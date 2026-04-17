import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { DetailRow, DoctorIdentity, SectionHeading, StatusBadge } from "../components/Shared";
import { useAppContext } from "../context/useAppContext";
import { formatCurrency } from "../lib/appointments";
import NotFoundPage from "./NotFoundPage";

export default function DoctorDetailPage() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const aiPrefill = location.state?.aiPrefill ?? null;
  const { bookAppointment, currentUser, doctors } = useAppContext();
  const doctor = doctors.find((item) => item.id === doctorId);

  const defaultSchedule = doctor?.schedule?.[0];
  const [form, setForm] = useState(() => ({
    selectedDate: defaultSchedule?.date ?? "",
    selectedSlot: defaultSchedule?.slots?.[0] ?? "",
    consultationMode: aiPrefill?.consultMode ?? "In-clinic",
    priority: aiPrefill?.priority ?? "Routine",
    phone: currentUser?.phone ?? "",
    reason: aiPrefill?.reason ?? "",
    symptoms: aiPrefill?.symptoms ?? "",
  }));
  const [showPrefillBanner, setShowPrefillBanner] = useState(!!aiPrefill);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!doctor) {
    return <NotFoundPage />;
  }

  const activeSchedule =
    doctor.schedule.find((slot) => slot.date === form.selectedDate) ?? doctor.schedule[0];

  const updateField = (field) => (event) => {
    const value = event.target.value;

    if (field === "selectedDate") {
      const nextSchedule =
        doctor.schedule.find((slot) => slot.date === value) ?? doctor.schedule[0];
      setForm((current) => ({
        ...current,
        selectedDate: value,
        selectedSlot: nextSchedule?.slots?.[0] ?? "",
      }));
      return;
    }

    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    const result = await bookAppointment({ doctorId: doctor.id, ...form });
    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    setMessage(`Request ${result.appointment.id} sent to the admin triage board.`);
    setTimeout(() => {
      navigate("/portal");
    }, 500);
    setIsSubmitting(false);
  };

  return (
    <section className="section">
      <div className="container detail-grid">
        <article className="panel profile-card">
          <div className="profile-header">
            <DoctorIdentity doctor={doctor} size="large" />
            <div>
              <span className="badge">{doctor.specialty}</span>
              <h2>{doctor.name}</h2>
              <p className="lead compact">{doctor.about}</p>
            </div>
          </div>

          <div className="detail-stats">
            <DetailRow label="Clinic" value={doctor.clinic} />
            <DetailRow label="Experience" value={doctor.experience} />
            <DetailRow label="Consultation fee" value={formatCurrency(doctor.fee)} />
            <DetailRow label="Languages" value={doctor.languages.join(", ")} />
            <DetailRow label="Credentials" value={doctor.credentials} />
            <DetailRow label="Location" value={doctor.location} />
          </div>

          <div className="detail-section">
            <h3>Care focus</h3>
            <div className="chip-row">
              {doctor.focusAreas.map((focus) => (
                <span className="chip" key={focus}>
                  {focus}
                </span>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <h3>Slot planner</h3>
            <div className="schedule-list">
              {doctor.schedule.map((slot) => (
                <article className="schedule-card" key={slot.date}>
                  <div className="schedule-topline">
                    <strong>{slot.label}</strong>
                    <StatusBadge value="Planned" />
                  </div>
                  <div className="chip-row">
                    {slot.slots.map((time) => (
                      <span className="chip" key={time}>
                        {time}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </article>

        <article className="panel booking-card">
          <SectionHeading
            title="Request care slot"
            subtitle="This version uses a triage request flow, so admin review happens before the doctor workspace sees the visit."
          />

          {showPrefillBanner && (
            <div className="ai-prefill-banner">
              <span className="ai-prefill-icon">✦</span>
              <span>Form pre-filled by Health Assistant based on your symptoms.</span>
              <button
                className="ai-prefill-dismiss"
                type="button"
                onClick={() => setShowPrefillBanner(false)}
              >
                ✕
              </button>
            </div>
          )}

          {currentUser?.role !== "patient" ? (
            <div className="callout">
              <h3>Patient sign-in required</h3>
              <p>
                To keep the workflow realistic, only patient accounts can send care
                requests. Sign in or register first, then return here to book.
              </p>
              <Link className="button button-primary" to="/signin">
                Go to patient access
              </Link>
            </div>
          ) : (
            <form className="booking-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="field-block">
                  <span>Date</span>
                  <select
                    className="text-input"
                    value={form.selectedDate}
                    onChange={updateField("selectedDate")}
                  >
                    {doctor.schedule.map((slot) => (
                      <option key={slot.date} value={slot.date}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-block">
                  <span>Slot</span>
                  <select
                    className="text-input"
                    value={form.selectedSlot}
                    onChange={updateField("selectedSlot")}
                  >
                    {activeSchedule.slots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-block">
                  <span>Mode</span>
                  <select
                    className="text-input"
                    value={form.consultationMode}
                    onChange={updateField("consultationMode")}
                  >
                    <option>In-clinic</option>
                    <option>Tele-consult</option>
                  </select>
                </label>

                <label className="field-block">
                  <span>Priority</span>
                  <select
                    className="text-input"
                    value={form.priority}
                    onChange={updateField("priority")}
                  >
                    <option>Routine</option>
                    <option>Priority</option>
                    <option>Urgent</option>
                  </select>
                </label>

                <label className="field-block form-grid-span">
                  <span>Contact number</span>
                  <input
                    className="text-input"
                    type="tel"
                    value={form.phone}
                    onChange={updateField("phone")}
                    placeholder="Enter reachable mobile number"
                  />
                </label>
              </div>

              <label className="field-block">
                <span>Visit reason</span>
                <input
                  className="text-input"
                  type="text"
                  value={form.reason}
                  onChange={updateField("reason")}
                  placeholder="Short title for the appointment request"
                />
              </label>

              <label className="field-block">
                <span>Symptoms or background</span>
                <textarea
                  className="text-input textarea"
                  rows="5"
                  value={form.symptoms}
                  onChange={updateField("symptoms")}
                  placeholder="Mention symptoms, history, or follow-up context."
                />
              </label>

              {error ? <p className="form-error">{error}</p> : null}
              {message ? <p className="form-success">{message}</p> : null}

              <button className="button button-primary wide" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Sending request..." : "Send care request"}
              </button>
            </form>
          )}
        </article>
      </div>
    </section>
  );
}
