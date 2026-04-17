const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error ?? "The request could not be completed.");
  }

  return payload;
}

export const api = {
  async getAppState() {
    return request("/app-state");
  },
  async login(credentials) {
    return request("/auth/login", {
      body: JSON.stringify(credentials),
      method: "POST",
    });
  },
  async registerPatient(payload) {
    return request("/patients/register", {
      body: JSON.stringify(payload),
      method: "POST",
    });
  },
  async bookAppointment(payload) {
    return request("/appointments", {
      body: JSON.stringify(payload),
      method: "POST",
    });
  },
  async updateAppointmentByAdmin(appointmentId, payload) {
    return request(`/appointments/${appointmentId}/admin`, {
      body: JSON.stringify(payload),
      method: "PATCH",
    });
  },
  async updateAppointmentByDoctor(appointmentId, payload) {
    return request(`/appointments/${appointmentId}/doctor`, {
      body: JSON.stringify(payload),
      method: "PATCH",
    });
  },
  async completeAppointmentByDoctor(appointmentId, payload) {
    return request(`/appointments/${appointmentId}/doctor`, {
      body: JSON.stringify(payload),
      method: "PATCH",
    });
  },
  async submitContactMessage(payload) {
    return request("/contact-messages", {
      body: JSON.stringify(payload),
      method: "POST",
    });
  },
  async saveDoctorProfile(payload) {
    return request("/doctors/upsert", {
      body: JSON.stringify(payload),
      method: "POST",
    });
  },
  async sendOtp({ email, purpose }) {
    return request("/auth/send-otp", {
      body: JSON.stringify({ email, purpose }),
      method: "POST",
    });
  },
  async verifyOtp({ email, otp, purpose }) {
    return request("/auth/verify-otp", {
      body: JSON.stringify({ email, otp, purpose }),
      method: "POST",
    });
  },
  async resetDemoData() {
    return request("/reset", {
      method: "POST",
    });
  },
};
