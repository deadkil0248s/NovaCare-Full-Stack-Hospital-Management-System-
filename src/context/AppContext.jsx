import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { attachDoctorPhotos } from "../lib/doctorMedia";
import { createSeedState, readStoredSession, writeStoredSession } from "../lib/demoStore";
import { AppContext } from "./useAppContext";

const EMPTY_STATE = {
  appointments: [],
  contactMessages: [],
  doctors: [],
  users: [],
};

function asString(value, fallback = "") {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function asStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asString(item).trim()).filter(Boolean);
}

function normalizeSchedule(schedule) {
  if (!Array.isArray(schedule)) {
    return [];
  }

  return schedule
    .map((entry) => ({
      date: asString(entry?.date),
      label: asString(entry?.label),
      slots: asStringArray(entry?.slots),
    }))
    .filter((entry) => entry.date && entry.label && entry.slots.length);
}

function normalizeDoctor(doctor) {
  return {
    ...doctor,
    id: asString(doctor?.id),
    userId: asString(doctor?.userId),
    name: asString(doctor?.name, "Doctor"),
    specialty: asString(doctor?.specialty, "General Medicine"),
    clinic: asString(doctor?.clinic),
    experience: asString(doctor?.experience),
    fee: Number(doctor?.fee) || 0,
    location: asString(doctor?.location),
    languages: asStringArray(doctor?.languages),
    nextAvailable: asString(doctor?.nextAvailable),
    intro: asString(doctor?.intro),
    about: asString(doctor?.about),
    focusAreas: asStringArray(doctor?.focusAreas),
    credentials: asString(doctor?.credentials),
    tone: asString(doctor?.tone, "teal"),
    avatarLabel: asString(doctor?.avatarLabel),
    schedule: normalizeSchedule(doctor?.schedule),
  };
}

function normalizeUser(user) {
  return {
    ...user,
    id: asString(user?.id),
    role: asString(user?.role),
    name: asString(user?.name, "User"),
    email: asString(user?.email),
    phone: asString(user?.phone),
    linkedDoctorId: asString(user?.linkedDoctorId),
  };
}

function normalizeAppointment(appointment) {
  return {
    ...appointment,
    id: asString(appointment?.id),
    patientId: asString(appointment?.patientId),
    patientName: asString(appointment?.patientName, "Patient"),
    patientEmail: asString(appointment?.patientEmail),
    phone: asString(appointment?.phone),
    doctorId: asString(appointment?.doctorId),
    doctorName: asString(appointment?.doctorName, "Doctor"),
    specialty: asString(appointment?.specialty),
    appointmentDate: asString(appointment?.appointmentDate),
    appointmentSlot: asString(appointment?.appointmentSlot),
    consultationMode: asString(appointment?.consultationMode),
    priority: asString(appointment?.priority),
    reason: asString(appointment?.reason),
    symptoms: asString(appointment?.symptoms),
    status: asString(appointment?.status, "Requested"),
    adminSummary: asString(appointment?.adminSummary),
    doctorSummary: asString(appointment?.doctorSummary),
    prescription: asStringArray(appointment?.prescription),
    followUpDate: asString(appointment?.followUpDate),
    bookedAt: asString(appointment?.bookedAt || appointment?.createdAt),
    updatedAt: asString(appointment?.updatedAt || appointment?.createdAt),
    createdAt: asString(appointment?.createdAt || appointment?.bookedAt),
  };
}

function normalizeContactMessage(message) {
  return {
    ...message,
    id: asString(message?.id),
    name: asString(message?.name, "Visitor"),
    email: asString(message?.email),
    phone: asString(message?.phone),
    category: asString(message?.category, "General question"),
    subject: asString(message?.subject, "New message"),
    message: asString(message?.message),
    submittedByRole: asString(message?.submittedByRole, "guest"),
    createdAt: asString(message?.createdAt, new Date().toISOString()),
  };
}

function normalizeAppState(state) {
  return {
    appointments: (state?.appointments ?? []).map(normalizeAppointment),
    contactMessages: (state?.contactMessages ?? []).map(normalizeContactMessage),
    doctors: attachDoctorPhotos((state?.doctors ?? []).map(normalizeDoctor)),
    users: (state?.users ?? []).map(normalizeUser),
  };
}

function asErrorMessage(error) {
  return error instanceof Error ? error.message : "The care workspace could not complete that request.";
}

export function AppProvider({ children }) {
  const [appState, setAppState] = useState(EMPTY_STATE);
  const [sessionUserId, setSessionUserId] = useState(readStoredSession);
  const [isHydrating, setIsHydrating] = useState(true);
  const [backendError, setBackendError] = useState("");

  const refreshAppState = useCallback(async ({ allowSeedFallback = false } = {}) => {
    try {
      const state = await api.getAppState();
      setAppState(normalizeAppState(state));
      setBackendError("");
      return { ok: true, state };
    } catch (error) {
      const message = asErrorMessage(error);

      if (allowSeedFallback) {
        setAppState(normalizeAppState(createSeedState()));
      }

      setBackendError(message);
      return { ok: false, error: message };
    } finally {
      setIsHydrating(false);
    }
  }, []);

  useEffect(() => {
    void refreshAppState({ allowSeedFallback: true });
  }, [refreshAppState]);

  useEffect(() => {
    writeStoredSession(sessionUserId);
  }, [sessionUserId]);

  const currentUser =
    appState.users.find((user) => user.id === sessionUserId) ?? null;

  const login = useCallback(async ({ email, password }) => {
    try {
      const result = await api.login({ email, password });
      setSessionUserId(result.user.id);
      return result;
    } catch (error) {
      return {
        ok: false,
        error: asErrorMessage(error),
      };
    }
  }, []);

  const logout = useCallback(async () => {
    setSessionUserId("");
    return { ok: true };
  }, []);

  const registerPatient = useCallback(
    async (form) => {
      try {
        const result = await api.registerPatient(form);
        // If email verification is pending, don't log the user in yet
        if (result.ok && !result.awaitingVerification) {
          setSessionUserId(result.user.id);
          await refreshAppState();
        }
        return result;
      } catch (error) {
        return {
          ok: false,
          error: asErrorMessage(error),
        };
      }
    },
    [refreshAppState],
  );

  const sendOtp = useCallback(async ({ email, purpose }) => {
    try {
      return await api.sendOtp({ email, purpose });
    } catch (error) {
      return { ok: false, error: asErrorMessage(error) };
    }
  }, []);

  const verifyOtp = useCallback(
    async ({ email, otp, purpose }) => {
      try {
        const result = await api.verifyOtp({ email, otp, purpose });
        setSessionUserId(result.user.id);
        await refreshAppState();
        return result;
      } catch (error) {
        return { ok: false, error: asErrorMessage(error) };
      }
    },
    [refreshAppState],
  );

  const bookAppointment = useCallback(
    async (form) => {
      try {
        const result = await api.bookAppointment({
          actorUserId: sessionUserId,
          ...form,
        });
        await refreshAppState();
        return result;
      } catch (error) {
        return {
          ok: false,
          error: asErrorMessage(error),
        };
      }
    },
    [refreshAppState, sessionUserId],
  );

  const updateAppointmentByAdmin = useCallback(
    async ({
      adminSummary,
      appointmentDate,
      appointmentId,
      appointmentSlot,
      consultationMode,
      status,
    }) => {
      try {
        const result = await api.updateAppointmentByAdmin(appointmentId, {
          actorUserId: sessionUserId,
          adminSummary,
          appointmentDate,
          appointmentSlot,
          consultationMode,
          status,
        });
        await refreshAppState();
        return result;
      } catch (error) {
        return {
          ok: false,
          error: asErrorMessage(error),
        };
      }
    },
    [refreshAppState, sessionUserId],
  );

  const updateAppointmentByDoctor = useCallback(
    async ({
      appointmentId,
      doctorSummary,
      followUpDate,
      prescriptionItems,
      status,
    }) => {
      try {
        const result = await api.updateAppointmentByDoctor(appointmentId, {
          actorUserId: sessionUserId,
          doctorSummary,
          followUpDate,
          prescriptionItems,
          status,
        });
        await refreshAppState();
        return result;
      } catch (error) {
        return {
          ok: false,
          error: asErrorMessage(error),
        };
      }
    },
    [refreshAppState, sessionUserId],
  );

  const submitContactMessage = useCallback(
    async (form) => {
      try {
        const result = await api.submitContactMessage({
          actorUserId: sessionUserId,
          ...form,
        });
        await refreshAppState();
        return result;
      } catch (error) {
        return {
          ok: false,
          error: asErrorMessage(error),
        };
      }
    },
    [refreshAppState, sessionUserId],
  );

  const saveDoctorProfile = useCallback(
    async (form) => {
      try {
        const result = await api.saveDoctorProfile({
          actorUserId: sessionUserId,
          form,
        });
        await refreshAppState();
        return result;
      } catch (error) {
        return {
          ok: false,
          error: asErrorMessage(error),
        };
      }
    },
    [refreshAppState, sessionUserId],
  );

  const resetDemoData = useCallback(async () => {
    try {
      const result = await api.resetDemoData();
      setSessionUserId("");
      await refreshAppState({ allowSeedFallback: true });
      return result;
    } catch (error) {
      return {
        ok: false,
        error: asErrorMessage(error),
      };
    }
  }, [refreshAppState]);

  const value = useMemo(
    () => ({
      appointmentCount: appState.appointments.length,
      appointments: appState.appointments,
      backendError,
      bookAppointment,
      contactMessages: appState.contactMessages,
      currentUser,
      doctors: appState.doctors,
      isHydrating,
      login,
      logout,
      refreshAppState,
      registerPatient,
      resetDemoData,
      saveDoctorProfile,
      sendOtp,
      submitContactMessage,
      updateAppointmentByDoctor,
      updateAppointmentByAdmin,
      users: appState.users,
      verifyOtp,
    }),
    [
      appState.appointments,
      appState.contactMessages,
      appState.doctors,
      appState.users,
      backendError,
      bookAppointment,
      currentUser,
      isHydrating,
      login,
      logout,
      refreshAppState,
      registerPatient,
      resetDemoData,
      saveDoctorProfile,
      sendOtp,
      submitContactMessage,
      updateAppointmentByDoctor,
      updateAppointmentByAdmin,
      verifyOtp,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
