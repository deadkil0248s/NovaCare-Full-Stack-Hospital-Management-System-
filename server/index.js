import dotenv from "dotenv";
dotenv.config({ override: true });
import { compare as comparePasswordHash } from "bcryptjs";
import cors from "cors";
import express from "express";
import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDb, getDb, getMongoConfig } from "./db.js";
import { createSeedState } from "./seedData.js";
import { getAIRecommendation, logConversation } from "./aiAssistant.js";
import { sendOTPEmail } from "./emailService.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = resolve(__dirname, "../dist");
const indexPath = resolve(distPath, "index.html");
const PHONE_MIN_DIGITS = 10;
const DEFAULT_DOCTOR_PASSWORD = "Doctor@123";
const DEFAULT_DOCTOR_SLOTS = [
  ["10:00 AM", "01:00 PM", "04:00 PM"],
  ["09:30 AM", "12:30 PM", "03:30 PM"],
  ["11:00 AM", "02:00 PM", "05:00 PM"],
];
const APPOINTMENT_STATUS = {
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
  CONFIRMED: "Confirmed",
  REQUESTED: "Requested",
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

if (existsSync(indexPath)) {
  app.use(express.static(distPath));
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function generateOTP() {
  return String(randomInt(100000, 999999));
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function hasValidPhone(phone) {
  return normalizePhone(phone).length >= PHONE_MIN_DIGITS;
}

function buildAvatarLabel(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatScheduleLabel(date) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function createDoctorSchedule(startDate) {
  const baseDate = startDate ? new Date(`${startDate}T00:00:00`) : new Date("2026-03-30T00:00:00");

  return Array.from({ length: 3 }, (_, index) => {
    const date = addDays(baseDate, index * 2);

    return {
      date: date.toISOString().slice(0, 10),
      label: formatScheduleLabel(date),
      slots: DEFAULT_DOCTOR_SLOTS[index % DEFAULT_DOCTOR_SLOTS.length],
    };
  });
}

function buildDoctorRecord({ existingDoctor, form }) {
  const schedule = createDoctorSchedule(form.availabilityDate || existingDoctor?.schedule?.[0]?.date);
  const focusAreas = String(form.focusAreas ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const languages = String(form.languages ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    id: existingDoctor?.id ?? `dr-${slugify(form.name) || createId("doctor")}`,
    userId: existingDoctor?.userId ?? createId("usr-doc"),
    name: String(form.name).trim(),
    specialty: String(form.specialty).trim(),
    clinic: String(form.clinic).trim(),
    experience: String(form.experience).trim(),
    fee: Number(form.fee),
    location: String(form.location).trim(),
    languages,
    nextAvailable: `${schedule[0].label} at ${schedule[0].slots[0]}`,
    intro: String(form.intro).trim(),
    about: String(form.about).trim(),
    focusAreas,
    credentials: String(form.credentials).trim(),
    tone: form.tone,
    avatarLabel: buildAvatarLabel(form.name),
    schedule,
  };
}

function stripMongoFields(document) {
  const sanitized = { ...document };
  delete sanitized._id;
  delete sanitized._seedIndex;
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.__v;
  return sanitized;
}

function buildAppointmentSeedKey(appointment) {
  return [
    normalizeEmail(appointment.patientEmail),
    String(appointment.doctorName ?? "").trim().toLowerCase(),
    String(appointment.appointmentDate ?? "").trim(),
    String(appointment.appointmentSlot ?? "").trim(),
  ].join("|");
}

function createLegacyUserId(user) {
  const rolePrefix =
    user.role === "admin" ? "usr-admin" : user.role === "doctor" ? "usr-doc" : "usr-patient";

  return `${rolePrefix}-${String(user._id).slice(-8)}`;
}

async function verifyUserPassword(user, password) {
  if (!password) {
    return false;
  }

  if (typeof user.password === "string" && user.password === password) {
    return true;
  }

  if (typeof user.passwordHash === "string" && user.passwordHash) {
    try {
      return await comparePasswordHash(password, user.passwordHash);
    } catch {
      return false;
    }
  }

  return false;
}

function validateAdminTransition(currentStatus, nextStatus) {
  if (currentStatus === APPOINTMENT_STATUS.COMPLETED) {
    return "Completed appointments cannot be changed by admin controls.";
  }

  if (nextStatus === currentStatus) {
    if ([APPOINTMENT_STATUS.REQUESTED, APPOINTMENT_STATUS.CONFIRMED].includes(currentStatus)) {
      return "";
    }

    return "Only requested or confirmed appointments can be edited from admin triage.";
  }

  if (nextStatus === APPOINTMENT_STATUS.CONFIRMED && currentStatus !== APPOINTMENT_STATUS.REQUESTED) {
    return "Admin can only confirm appointments that are still requested.";
  }

  if (
    nextStatus === APPOINTMENT_STATUS.CANCELLED &&
    ![APPOINTMENT_STATUS.REQUESTED, APPOINTMENT_STATUS.CONFIRMED].includes(currentStatus)
  ) {
    return "Only requested or confirmed appointments can be cancelled by admin.";
  }

  if (![APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.CANCELLED].includes(nextStatus)) {
    return "Admin can only mark appointments as confirmed or cancelled.";
  }

  return "";
}

function validateDoctorTransition(currentStatus, nextStatus) {
  if (currentStatus === APPOINTMENT_STATUS.COMPLETED) {
    return "Completed appointments cannot be changed by doctor controls.";
  }

  if (nextStatus === APPOINTMENT_STATUS.CONFIRMED && currentStatus !== APPOINTMENT_STATUS.REQUESTED) {
    return "Doctor can only confirm appointments that are still requested.";
  }

  if (nextStatus === APPOINTMENT_STATUS.COMPLETED && currentStatus !== APPOINTMENT_STATUS.CONFIRMED) {
    return "Only confirmed appointments can be completed by the doctor.";
  }

  if (![APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.COMPLETED].includes(nextStatus)) {
    return "Doctor can only confirm or complete appointments.";
  }

  return "";
}

async function getCollections() {
  const db = await getDb();
  return {
    appointments: db.collection("appointments"),
    contactMessages: db.collection("contactMessages"),
    doctors: db.collection("doctors"),
    otps: db.collection("otps"),
    users: db.collection("users"),
  };
}

async function ensureSeedData() {
  const collections = await getCollections();
  const seed = createSeedState();

  await collections.users.createIndex({ email: 1 }, { unique: true });
  await collections.otps.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await collections.otps.createIndex({ email: 1, purpose: 1 }, { unique: true });

  const specs = [
    ["users", seed.users],
    ["doctors", seed.doctors],
    ["appointments", seed.appointments],
    ["contactMessages", seed.contactMessages],
  ];

  await Promise.all(
    specs.map(async ([name, items]) => {
      const collection = collections[name];
      const count = await collection.estimatedDocumentCount();

      if (count === 0 && items.length) {
        await collection.insertMany(items.map((item, index) => ({ ...item, _seedIndex: index })));
      }
    }),
  );
}

async function repairLegacyData() {
  const collections = await getCollections();
  const seed = createSeedState();
  const seedUsersByEmail = new Map(seed.users.map((user, index) => [normalizeEmail(user.email), { ...user, index }]));
  const seedAppointmentsByKey = new Map(
    seed.appointments.map((appointment, index) => [buildAppointmentSeedKey(appointment), { appointment, index }]),
  );

  const doctors = await collections.doctors.find({}, { projection: { _id: 0, id: 1, name: 1 } }).toArray();
  const doctorIdByName = new Map(doctors.map((doctor) => [doctor.name, doctor.id]));
  const users = await collections.users.find({}).toArray();

  await Promise.all(
    users.map(async (user) => {
      const seedUser = seedUsersByEmail.get(normalizeEmail(user.email));
      const updates = {};

      if (!user.id) {
        updates.id = seedUser?.id ?? createLegacyUserId(user);
      }

      if (user.role === "doctor" && !user.linkedDoctorId) {
        updates.linkedDoctorId = seedUser?.linkedDoctorId ?? doctorIdByName.get(user.name) ?? "";
      }

      if (seedUser && user._seedIndex == null) {
        updates._seedIndex = seedUser.index;
      }

      if (seedUser && !user.phone) {
        updates.phone = seedUser.phone;
      }

      if (seedUser && !user.name) {
        updates.name = seedUser.name;
      }

      if (seedUser && !user.password && !user.passwordHash) {
        updates.password = seedUser.password;
      }

      if (Object.keys(updates).length) {
        await collections.users.updateOne({ _id: user._id }, { $set: updates });
      }
    }),
  );

  const normalizedUsers = await collections.users
    .find({}, { projection: { _id: 0, id: 1, email: 1 } })
    .toArray();
  const userIdByEmail = new Map(normalizedUsers.map((user) => [normalizeEmail(user.email), user.id]).filter(([, id]) => id));
  const appointments = await collections.appointments.find({}).toArray();

  await Promise.all(
    appointments.map(async (appointment) => {
      const seedMatch = seedAppointmentsByKey.get(buildAppointmentSeedKey(appointment));
      const updates = {};

      if (!appointment.id) {
        updates.id = seedMatch?.appointment.id ?? createId("apt");
      }

      if (!appointment.patientId) {
        updates.patientId = userIdByEmail.get(normalizeEmail(appointment.patientEmail)) ?? "";
      }

      if (!appointment.doctorId) {
        updates.doctorId = doctorIdByName.get(appointment.doctorName) ?? "";
      }

      if (seedMatch && appointment._seedIndex == null) {
        updates._seedIndex = seedMatch.index;
      }

      if (!appointment.bookedAt && appointment.createdAt) {
        updates.bookedAt = appointment.createdAt;
      }

      if (!appointment.updatedAt && appointment.createdAt) {
        updates.updatedAt = appointment.createdAt;
      }

      if (Object.keys(updates).length) {
        await collections.appointments.updateOne({ _id: appointment._id }, { $set: updates });
      }
    }),
  );
}

function compareSeedOrder(left, right) {
  const leftCreatedAt = Date.parse(left.createdAt ?? "") || 0;
  const rightCreatedAt = Date.parse(right.createdAt ?? "") || 0;

  if (leftCreatedAt !== rightCreatedAt) {
    return rightCreatedAt - leftCreatedAt;
  }

  return (left._seedIndex ?? Number.MAX_SAFE_INTEGER) - (right._seedIndex ?? Number.MAX_SAFE_INTEGER);
}

async function readAppState() {
  const collections = await getCollections();
  const [users, doctors, appointments, contactMessages] = await Promise.all([
    collections.users.find({}, { projection: { _id: 0, __v: 0, password: 0, passwordHash: 0 } }).toArray(),
    collections.doctors.find({}, { projection: { _id: 0, __v: 0 } }).toArray(),
    collections.appointments.find({}, { projection: { _id: 0, __v: 0 } }).toArray(),
    collections.contactMessages.find({}, { projection: { _id: 0, __v: 0 } }).toArray(),
  ]);

  return {
    appointments,
    contactMessages: contactMessages.sort(compareSeedOrder),
    doctors: doctors.sort(compareSeedOrder),
    users: users.sort(compareSeedOrder),
  };
}

async function findActor(actorUserId) {
  if (!actorUserId) {
    return null;
  }

  const { users } = await getCollections();
  return users.findOne({ id: actorUserId });
}

async function resetDatabase() {
  const collections = await getCollections();
  const seed = createSeedState();

  await Promise.all([
    collections.users.deleteMany({}),
    collections.doctors.deleteMany({}),
    collections.appointments.deleteMany({}),
    collections.contactMessages.deleteMany({}),
  ]);

  await Promise.all([
    seed.users.length
      ? collections.users.insertMany(seed.users.map((item, index) => ({ ...item, _seedIndex: index })))
      : null,
    seed.doctors.length
      ? collections.doctors.insertMany(seed.doctors.map((item, index) => ({ ...item, _seedIndex: index })))
      : null,
    seed.appointments.length
      ? collections.appointments.insertMany(
          seed.appointments.map((item, index) => ({ ...item, _seedIndex: index })),
        )
      : null,
  ]);
}

app.get("/api/health", async (_request, response) => {
  const { dbName, mongoUri } = getMongoConfig();

  response.json({
    dbName,
    mongoUri,
    ok: true,
  });
});

app.get("/api/app-state", async (_request, response) => {
  response.json(await readAppState());
});

app.post("/api/auth/login", async (request, response) => {
  const { users } = await getCollections();
  const email = normalizeEmail(request.body.email);
  const password = String(request.body.password ?? "");

  const matchedUser = await users.findOne({ email });
  const isValidPassword = matchedUser ? await verifyUserPassword(matchedUser, password) : false;

  if (!matchedUser || !isValidPassword) {
    response.status(401).json({
      error: "We could not match that email and password in the system.",
    });
    return;
  }

  response.json({ ok: true, user: stripMongoFields(matchedUser) });
});

app.post("/api/patients/register", async (request, response) => {
  const { users } = await getCollections();
  const email = normalizeEmail(request.body.email);
  const name = String(request.body.name ?? "").trim();
  const password = String(request.body.password ?? "").trim();
  const phone = String(request.body.phone ?? "");
  const cleanedPhone = normalizePhone(phone);

  if (!name || !email || !password || !phone.trim()) {
    response.status(400).json({ error: "Please complete all registration fields." });
    return;
  }

  if (!hasValidPhone(phone)) {
    response.status(400).json({
      error: "Please enter a valid mobile number with at least 10 digits.",
    });
    return;
  }

  const existingUser = await users.findOne({ email });
  if (existingUser) {
    response.status(409).json({
      error: "That email is already in the system. Please sign in instead.",
    });
    return;
  }

  const newPatient = {
    id: createId("usr-patient"),
    role: "patient",
    name,
    email,
    password,
    phone: cleanedPhone,
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };

  await users.insertOne(newPatient);

  // Send verification OTP (best-effort — don't fail registration if email errors)
  try {
    const { otps } = await getCollections();
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await otps.replaceOne(
      { email, purpose: "register" },
      { email, purpose: "register", otp, expiresAt, createdAt: new Date().toISOString() },
      { upsert: true },
    );
    await sendOTPEmail({ to: email, otp, purpose: "register" });
  } catch (emailErr) {
    console.warn("Failed to send verification OTP on register:", emailErr.message);
  }

  response.status(201).json({ ok: true, awaitingVerification: true, user: stripMongoFields(newPatient) });
});

app.post("/api/appointments", async (request, response) => {
  const actor = await findActor(request.body.actorUserId);
  if (!actor || actor.role !== "patient") {
    response.status(403).json({
      error: "Please sign in with a patient account before booking.",
    });
    return;
  }

  const { doctors, appointments } = await getCollections();
  const doctorId = String(request.body.doctorId ?? "");
  const doctor = await doctors.findOne({ id: doctorId });

  if (!doctor) {
    response.status(404).json({ error: "Selected doctor was not found." });
    return;
  }

  const selectedDate = String(request.body.selectedDate ?? "");
  const selectedSlot = String(request.body.selectedSlot ?? "");
  const reason = String(request.body.reason ?? "");
  const symptoms = String(request.body.symptoms ?? "");
  const patientPhone = normalizePhone(request.body.phone || actor.phone || "");

  if (!selectedDate || !selectedSlot || !reason.trim() || !symptoms.trim()) {
    response.status(400).json({
      error: "Please complete the visit details before sending the request.",
    });
    return;
  }

  if (!hasValidPhone(patientPhone)) {
    response.status(400).json({
      error: "Please enter a valid mobile number with at least 10 digits.",
    });
    return;
  }

  const appointment = {
    id: createId("apt"),
    patientId: actor.id,
    patientName: actor.name,
    patientEmail: actor.email,
    phone: patientPhone,
    doctorId: doctor.id,
    doctorName: doctor.name,
    specialty: doctor.specialty,
    appointmentDate: selectedDate,
    appointmentSlot: selectedSlot,
    consultationMode: String(request.body.consultationMode ?? "In-clinic"),
    priority: String(request.body.priority ?? "Routine"),
    reason: reason.trim(),
    symptoms: symptoms.trim(),
    status: "Requested",
    adminSummary: "",
    doctorSummary: "",
    prescription: [],
    followUpDate: "",
    bookedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await appointments.insertOne(appointment);
  response.status(201).json({ ok: true, appointment });
});

app.patch("/api/appointments/:appointmentId/admin", async (request, response) => {
  const actor = await findActor(request.body.actorUserId);
  if (!actor || actor.role !== "admin") {
    response.status(403).json({
      error: "Only admin accounts can update the triage board.",
    });
    return;
  }

  const { appointments } = await getCollections();
  const appointment = await appointments.findOne({ id: request.params.appointmentId });
  if (!appointment) {
    response.status(404).json({ error: "Appointment not found." });
    return;
  }

  const nextStatus = String(request.body.status ?? APPOINTMENT_STATUS.REQUESTED);
  const transitionError = validateAdminTransition(appointment.status, nextStatus);
  if (transitionError) {
    response.status(400).json({ error: transitionError });
    return;
  }

  const result = await appointments.updateOne(
    { id: request.params.appointmentId },
    {
      $set: {
        status: nextStatus,
        consultationMode: String(request.body.consultationMode ?? "In-clinic"),
        appointmentDate: String(request.body.appointmentDate ?? ""),
        appointmentSlot: String(request.body.appointmentSlot ?? ""),
        adminSummary: String(request.body.adminSummary ?? "").trim(),
        updatedAt: new Date().toISOString(),
      },
    },
  );

  if (!result.matchedCount) {
    response.status(404).json({ error: "Appointment not found." });
    return;
  }

  response.json({ ok: true });
});

app.patch("/api/appointments/:appointmentId/doctor", async (request, response) => {
  const actor = await findActor(request.body.actorUserId);
  if (!actor || actor.role !== "doctor") {
    response.status(403).json({
      error: "Only doctor accounts can update doctor-handled appointments.",
    });
    return;
  }

  const { appointments } = await getCollections();
  const appointment = await appointments.findOne({
    id: request.params.appointmentId,
    doctorId: actor.linkedDoctorId,
  });
  if (!appointment) {
    response.status(404).json({ error: "Appointment not found for this doctor." });
    return;
  }

  const nextStatus = String(request.body.status ?? APPOINTMENT_STATUS.COMPLETED);
  const transitionError = validateDoctorTransition(appointment.status, nextStatus);
  if (transitionError) {
    response.status(400).json({ error: transitionError });
    return;
  }

  const update = {
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };

  if (nextStatus === APPOINTMENT_STATUS.COMPLETED) {
    const doctorSummary = String(request.body.doctorSummary ?? "").trim();
    if (!doctorSummary) {
      response.status(400).json({
        error: "Please add a consultation summary before completing the visit.",
      });
      return;
    }

    update.doctorSummary = doctorSummary;
    update.prescription = String(request.body.prescriptionItems ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    update.followUpDate = String(request.body.followUpDate ?? "");
  }

  const result = await appointments.updateOne(
    { id: request.params.appointmentId, doctorId: actor.linkedDoctorId },
    {
      $set: update,
    },
  );

  if (!result.matchedCount) {
    response.status(404).json({ error: "Appointment not found for this doctor." });
    return;
  }

  response.json({ ok: true });
});

app.post("/api/contact-messages", async (request, response) => {
  const actor = await findActor(request.body.actorUserId);
  const email = normalizeEmail(request.body.email || actor?.email || "");
  const phone = normalizePhone(request.body.phone || actor?.phone || "");
  const name = String(request.body.name ?? "").trim() || actor?.name || "Visitor";
  const subject = String(request.body.subject ?? "").trim();
  const message = String(request.body.message ?? "").trim();

  if (!name || !email || !subject || !message) {
    response.status(400).json({
      error: "Please complete the contact form before sending it.",
    });
    return;
  }

  if (phone && !hasValidPhone(phone)) {
    response.status(400).json({
      error: "Please enter a valid mobile number with at least 10 digits.",
    });
    return;
  }

  const { contactMessages } = await getCollections();
  const contactMessage = {
    id: createId("msg"),
    name,
    email,
    phone,
    category: String(request.body.category ?? "General question"),
    subject,
    message,
    submittedByRole: actor?.role ?? "guest",
    createdAt: new Date().toISOString(),
  };

  await contactMessages.insertOne(contactMessage);
  response.status(201).json({ ok: true, contactMessage });
});

app.post("/api/doctors/upsert", async (request, response) => {
  const actor = await findActor(request.body.actorUserId);
  if (!actor || actor.role !== "admin") {
    response.status(403).json({
      error: "Only admin accounts can manage doctor profiles.",
    });
    return;
  }

  const form = request.body.form ?? {};
  const requiredFields = [
    form.name,
    form.specialty,
    form.clinic,
    form.experience,
    form.fee,
    form.location,
    form.languages,
    form.focusAreas,
    form.credentials,
    form.intro,
    form.about,
    form.email,
    form.phone,
    form.availabilityDate,
  ];

  if (requiredFields.some((value) => !String(value ?? "").trim())) {
    response.status(400).json({ error: "Please complete all doctor profile fields." });
    return;
  }

  if (!hasValidPhone(form.phone)) {
    response.status(400).json({
      error: "Doctor contact number must contain at least 10 digits.",
    });
    return;
  }

  if (!Number.isFinite(Number(form.fee)) || Number(form.fee) <= 0) {
    response.status(400).json({
      error: "Consultation fee must be a valid amount.",
    });
    return;
  }

  const { doctors, users } = await getCollections();
  const doctorId = String(form.doctorId ?? "");
  const existingDoctor = doctorId ? await doctors.findOne({ id: doctorId }) : null;
  const existingUser = doctorId ? await users.findOne({ linkedDoctorId: doctorId }) : null;
  const normalizedEmail = normalizeEmail(form.email);
  const conflictingUser = await users.findOne({
    email: normalizedEmail,
    ...(existingUser ? { id: { $ne: existingUser.id } } : {}),
  });

  if (conflictingUser) {
    response.status(409).json({
      error: "That doctor email is already assigned to another account.",
    });
    return;
  }

  const doctorRecord = buildDoctorRecord({ existingDoctor, form });
  const doctorUser = {
    id: existingUser?.id ?? doctorRecord.userId,
    role: "doctor",
    name: doctorRecord.name,
    email: normalizedEmail,
    phone: normalizePhone(form.phone),
    linkedDoctorId: doctorRecord.id,
    createdAt: existingUser?.createdAt ?? new Date().toISOString(),
    ...(existingUser?.passwordHash
      ? { passwordHash: existingUser.passwordHash }
      : { password: existingUser?.password ?? DEFAULT_DOCTOR_PASSWORD }),
  };

  if (existingDoctor) {
    await doctors.updateOne(
      { id: existingDoctor.id },
      {
        $set: {
          ...doctorRecord,
          createdAt: existingDoctor.createdAt ?? new Date().toISOString(),
        },
      },
    );
  } else {
    await doctors.insertOne({
      ...doctorRecord,
      createdAt: new Date().toISOString(),
    });
  }

  if (existingUser) {
    await users.updateOne({ id: existingUser.id }, { $set: doctorUser });
  } else {
    await users.insertOne(doctorUser);
  }

  response.json({
    ok: true,
    message: existingDoctor
      ? "Doctor profile updated successfully."
      : `Doctor profile created. Default password: ${doctorUser.password}`,
  });
});

app.post("/api/auth/send-otp", async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const purpose = String(request.body.purpose ?? "");

  if (!email || !["login", "register"].includes(purpose)) {
    response.status(400).json({ error: "Valid email and purpose are required." });
    return;
  }

  const { users, otps } = await getCollections();
  const user = await users.findOne({ email });

  if (!user) {
    // Return ok to avoid exposing whether the email exists
    response.json({ ok: true });
    return;
  }

  if (purpose === "login" && !user.emailVerified) {
    response.status(403).json({
      error: "OTP login is not available for this account. Please verify your email first, or use your password to sign in.",
    });
    return;
  }

  if (purpose === "register" && user.emailVerified) {
    response.status(400).json({
      error: "This email is already verified. Please sign in instead.",
    });
    return;
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await otps.replaceOne(
    { email, purpose },
    { email, purpose, otp, expiresAt, createdAt: new Date().toISOString() },
    { upsert: true },
  );

  try {
    await sendOTPEmail({ to: email, otp, purpose });
  } catch (emailErr) {
    console.error("OTP email send failed:", emailErr.message);
    response.status(500).json({ error: "Failed to send OTP email. Please try again shortly." });
    return;
  }

  response.json({ ok: true });
});

app.post("/api/auth/verify-otp", async (request, response) => {
  const email = normalizeEmail(request.body.email);
  const otp = String(request.body.otp ?? "").trim();
  const purpose = String(request.body.purpose ?? "");

  if (!email || !otp || !["login", "register"].includes(purpose)) {
    response.status(400).json({ error: "Email, OTP, and purpose are required." });
    return;
  }

  const { users, otps } = await getCollections();
  const otpDoc = await otps.findOne({ email, purpose });

  if (!otpDoc) {
    response.status(400).json({ error: "No active OTP found for this email. Please request a new one." });
    return;
  }

  if (new Date() > new Date(otpDoc.expiresAt)) {
    await otps.deleteOne({ email, purpose });
    response.status(400).json({ error: "OTP has expired. Please request a new one." });
    return;
  }

  if (otpDoc.otp !== otp) {
    response.status(400).json({ error: "Incorrect OTP. Please check the code and try again." });
    return;
  }

  // Valid — consume the OTP
  await otps.deleteOne({ email, purpose });

  const user = await users.findOne({ email });
  if (!user) {
    response.status(404).json({ error: "Account not found." });
    return;
  }

  if (purpose === "register") {
    await users.updateOne({ email }, { $set: { emailVerified: true } });
    user.emailVerified = true;
  }

  response.json({ ok: true, user: stripMongoFields(user) });
});

app.post("/api/reset", async (_request, response) => {
  await resetDatabase();
  response.json({ ok: true });
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({
    error: "The care workspace could not complete that request right now.",
  });
});

if (existsSync(indexPath)) {
  app.get("/{*path}", (_request, response, next) => {
    if (_request.path.startsWith("/api")) {
      next();
      return;
    }

    response.sendFile(indexPath);
  });
}

async function start() {
  await ensureSeedData();
  await repairLegacyData();

  // POST /api/ai-assistant
  app.post("/api/ai-assistant", async (req, res) => {
    const { messages, sessionId } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    if (messages.length > 40) {
      return res.status(400).json({ error: "Conversation too long — please start a new session" });
    }

    try {
      const rawResponse = await getAIRecommendation(messages);

      const recommendationMatch = rawResponse.match(/<recommendation>([\s\S]*?)<\/recommendation>/);
      let recommendation = null;
      const message = rawResponse.replace(/<recommendation>[\s\S]*?<\/recommendation>/, "").trim();

      if (recommendationMatch) {
        try {
          recommendation = JSON.parse(recommendationMatch[1].trim());
        } catch {
          // malformed JSON in recommendation block — ignore it
        }
      }

      if (recommendation && sessionId) {
        await logConversation({ sessionId, messages, recommendation });
      }

      return res.json({ message, recommendation });
    } catch (err) {
      console.error("AI assistant error:", err.message);
      const status = err.status === 429 ? 429 : 503;
      return res.status(status).json({ error: err.message ?? "AI assistant is temporarily unavailable. Please try again." });
    }
  });

  app.listen(port, () => {
    console.log(`MediZyra API listening on http://127.0.0.1:${port}`);
  });
}

start().catch(async (error) => {
  console.error("Failed to start MediZyra API", error);
  await closeDb();
  process.exit(1);
});
