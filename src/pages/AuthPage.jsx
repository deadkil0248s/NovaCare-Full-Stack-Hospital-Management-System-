import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { demoCredentials } from "../data/siteData";
import { useAppContext } from "../context/useAppContext";
import { SectionHeading } from "../components/Shared";

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, registerPatient, sendOtp, verifyOtp } = useAppContext();

  // Top-level tab: "signin" | "register"
  const [mode, setMode] = useState("signin");

  // Signin sub-mode: "password" | "otp"
  const [loginMethod, setLoginMethod] = useState("password");

  // OTP login steps: "email" (enter email) | "code" (enter OTP)
  const [otpLoginStep, setOtpLoginStep] = useState("email");

  // Register steps: "form" (fill details) | "verify" (enter OTP)
  const [registerStep, setRegisterStep] = useState("form");

  // Forms
  const [loginForm, setLoginForm] = useState({ email: "patient@medizyra.demo", password: "Patient@123" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", phone: "", password: "" });

  // OTP login state
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // Registration OTP verify state
  const [pendingEmail, setPendingEmail] = useState("");
  const [registerOtpCode, setRegisterOtpCode] = useState("");

  // Shared UI state
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearMessages() {
    setFeedback("");
    setError("");
  }

  function switchMode(newMode) {
    setMode(newMode);
    setLoginMethod("password");
    setOtpLoginStep("email");
    setRegisterStep("form");
    setOtpCode("");
    setOtpEmail("");
    setRegisterOtpCode("");
    clearMessages();
  }

  // ── Password login ──────────────────────────────────────────────────────────

  const handleLoginChange = (field) => (e) =>
    setLoginForm((f) => ({ ...f, [field]: e.target.value }));

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    setIsSubmitting(true);
    const result = await login(loginForm);
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setFeedback(`Signed in as ${result.user.role}. Redirecting...`);
    setTimeout(() => navigate("/portal"), 400);
  };

  // ── OTP login: step 1 — send OTP ────────────────────────────────────────────

  const handleSendLoginOtp = async (e) => {
    e.preventDefault();
    clearMessages();
    if (!otpEmail.trim()) { setError("Please enter your email address."); return; }
    setIsSubmitting(true);
    const result = await sendOtp({ email: otpEmail.trim(), purpose: "login" });
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setFeedback(`OTP sent to ${otpEmail.trim()}. Check your inbox.`);
    setOtpLoginStep("code");
  };

  // ── OTP login: step 2 — verify OTP ─────────────────────────────────────────

  const handleVerifyLoginOtp = async (e) => {
    e.preventDefault();
    clearMessages();
    if (!otpCode.trim()) { setError("Please enter the OTP."); return; }
    setIsSubmitting(true);
    const result = await verifyOtp({ email: otpEmail.trim(), otp: otpCode.trim(), purpose: "login" });
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setFeedback("Signed in successfully. Redirecting...");
    setTimeout(() => navigate("/portal"), 400);
  };

  // ── Registration: step 1 — fill form ───────────────────────────────────────

  const handleRegisterChange = (field) => (e) =>
    setRegisterForm((f) => ({ ...f, [field]: e.target.value }));

  const handleRegister = async (e) => {
    e.preventDefault();
    clearMessages();
    setIsSubmitting(true);
    const result = await registerPatient(registerForm);
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    if (result.awaitingVerification) {
      setPendingEmail(registerForm.email);
      setRegisterStep("verify");
      setFeedback(`Account created! A 6-digit verification code was sent to ${registerForm.email}.`);
    } else {
      setFeedback("Patient profile created. Redirecting...");
      setTimeout(() => navigate("/portal"), 400);
    }
  };

  // ── Registration: step 2 — verify OTP ──────────────────────────────────────

  const handleVerifyRegistration = async (e) => {
    e.preventDefault();
    clearMessages();
    if (!registerOtpCode.trim()) { setError("Please enter the verification code."); return; }
    setIsSubmitting(true);
    const result = await verifyOtp({ email: pendingEmail, otp: registerOtpCode.trim(), purpose: "register" });
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setFeedback("Email verified! Redirecting to your portal...");
    setTimeout(() => navigate("/portal"), 400);
  };

  const handleResendRegisterOtp = async () => {
    clearMessages();
    setIsSubmitting(true);
    const result = await sendOtp({ email: pendingEmail, purpose: "register" });
    setIsSubmitting(false);
    if (!result.ok) { setError(result.error); return; }
    setFeedback("A new verification code was sent to your email.");
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section className="section">
      <div className="container auth-layout">
        <article className="panel auth-panel">
          <SectionHeading
            title="Access the demo portal"
            subtitle="Use seeded email accounts for admin and doctor testing, or create a fresh patient profile."
          />

          {/* Mode tabs */}
          <div className="auth-toggle">
            <button
              className={`auth-tab ${mode === "signin" ? "auth-tab-active" : ""}`}
              type="button"
              onClick={() => switchMode("signin")}
            >
              Sign in
            </button>
            <button
              className={`auth-tab ${mode === "register" ? "auth-tab-active" : ""}`}
              type="button"
              onClick={() => switchMode("register")}
            >
              Register patient
            </button>
          </div>

          {/* ── SIGN IN ── */}
          {mode === "signin" && (
            <>
              {/* Login method sub-tabs */}
              <div className="auth-method-toggle">
                <button
                  className={`auth-method-tab ${loginMethod === "password" ? "auth-method-tab-active" : ""}`}
                  type="button"
                  onClick={() => { setLoginMethod("password"); clearMessages(); }}
                >
                  🔑 Password
                </button>
                <button
                  className={`auth-method-tab ${loginMethod === "otp" ? "auth-method-tab-active" : ""}`}
                  type="button"
                  onClick={() => { setLoginMethod("otp"); setOtpLoginStep("email"); clearMessages(); }}
                >
                  📧 Email OTP
                </button>
              </div>

              {loginMethod === "password" && (
                <form className="auth-form" onSubmit={handlePasswordLogin}>
                  <label className="field-block">
                    <span>Email</span>
                    <input
                      className="text-input"
                      type="email"
                      value={loginForm.email}
                      onChange={handleLoginChange("email")}
                    />
                  </label>
                  <label className="field-block">
                    <span>Password</span>
                    <input
                      className="text-input"
                      type="password"
                      value={loginForm.password}
                      onChange={handleLoginChange("password")}
                    />
                  </label>
                  {error && <p className="form-error">{error}</p>}
                  {feedback && <p className="form-success">{feedback}</p>}
                  <button className="button button-primary wide" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Signing in..." : "Enter portal"}
                  </button>
                </form>
              )}

              {loginMethod === "otp" && otpLoginStep === "email" && (
                <form className="auth-form" onSubmit={handleSendLoginOtp}>
                  <p className="auth-otp-hint">
                    Enter your registered email and we'll send a one-time login code.
                    OTP login requires your email to be verified during registration.
                  </p>
                  <label className="field-block">
                    <span>Email</span>
                    <input
                      className="text-input"
                      type="email"
                      value={otpEmail}
                      placeholder="your@email.com"
                      onChange={(e) => setOtpEmail(e.target.value)}
                    />
                  </label>
                  {error && <p className="form-error">{error}</p>}
                  {feedback && <p className="form-success">{feedback}</p>}
                  <button className="button button-primary wide" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Sending..." : "Send OTP"}
                  </button>
                </form>
              )}

              {loginMethod === "otp" && otpLoginStep === "code" && (
                <form className="auth-form" onSubmit={handleVerifyLoginOtp}>
                  <p className="auth-otp-hint">
                    Enter the 6-digit code sent to <strong>{otpEmail}</strong>. Valid for 10 minutes.
                  </p>
                  <label className="field-block">
                    <span>One-time code</span>
                    <input
                      className="text-input auth-otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpCode}
                      placeholder="000000"
                      autoFocus
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    />
                  </label>
                  {error && <p className="form-error">{error}</p>}
                  {feedback && <p className="form-success">{feedback}</p>}
                  <button className="button button-primary wide" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Verifying..." : "Verify & Sign In"}
                  </button>
                  <button
                    className="auth-resend-btn"
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => { setOtpLoginStep("email"); setOtpCode(""); clearMessages(); }}
                  >
                    ← Change email or resend code
                  </button>
                </form>
              )}
            </>
          )}

          {/* ── REGISTER ── */}
          {mode === "register" && (
            <>
              {registerStep === "form" && (
                <form className="auth-form" onSubmit={handleRegister}>
                  <label className="field-block">
                    <span>Full name</span>
                    <input
                      className="text-input"
                      type="text"
                      value={registerForm.name}
                      onChange={handleRegisterChange("name")}
                    />
                  </label>
                  <label className="field-block">
                    <span>Email</span>
                    <input
                      className="text-input"
                      type="email"
                      value={registerForm.email}
                      onChange={handleRegisterChange("email")}
                    />
                  </label>
                  <label className="field-block">
                    <span>Phone</span>
                    <input
                      className="text-input"
                      type="tel"
                      value={registerForm.phone}
                      onChange={handleRegisterChange("phone")}
                    />
                  </label>
                  <label className="field-block">
                    <span>Password</span>
                    <input
                      className="text-input"
                      type="password"
                      value={registerForm.password}
                      onChange={handleRegisterChange("password")}
                    />
                  </label>
                  {error && <p className="form-error">{error}</p>}
                  {feedback && <p className="form-success">{feedback}</p>}
                  <button className="button button-primary wide" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Creating account..." : "Create patient account"}
                  </button>
                </form>
              )}

              {registerStep === "verify" && (
                <form className="auth-form" onSubmit={handleVerifyRegistration}>
                  <div className="auth-verify-banner">
                    <span className="auth-verify-icon">✉️</span>
                    <div>
                      <p>A verification code was sent to</p>
                      <strong>{pendingEmail}</strong>
                      <p className="auth-verify-note">Enter the 6-digit code below to activate your account.</p>
                    </div>
                  </div>
                  <label className="field-block">
                    <span>Verification code</span>
                    <input
                      className="text-input auth-otp-input"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={registerOtpCode}
                      placeholder="000000"
                      autoFocus
                      onChange={(e) => setRegisterOtpCode(e.target.value.replace(/\D/g, ""))}
                    />
                  </label>
                  {error && <p className="form-error">{error}</p>}
                  {feedback && <p className="form-success">{feedback}</p>}
                  <button className="button button-primary wide" disabled={isSubmitting} type="submit">
                    {isSubmitting ? "Verifying..." : "Verify & Activate Account"}
                  </button>
                  <button
                    className="auth-resend-btn"
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleResendRegisterOtp}
                  >
                    Resend verification code
                  </button>
                </form>
              )}
            </>
          )}
        </article>

        <article className="panel demo-panel">
          <SectionHeading
            eyebrow="Quick testing"
            title="Seeded demo credentials"
            subtitle="These accounts are available immediately for platform testing."
          />
          <div className="demo-credential-list">
            {demoCredentials.map((credential) => (
              <article className="demo-credential" key={credential.role}>
                <strong>{credential.role}</strong>
                <p>{credential.email}</p>
                <code>{credential.password}</code>
              </article>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
