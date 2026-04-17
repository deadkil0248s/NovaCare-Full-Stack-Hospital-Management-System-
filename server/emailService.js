import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const SENDER = "MediZyra <medizyranoreply@gmail.com>";

let _ses = null;
function getSESClient() {
  if (!_ses) _ses = new SESv2Client({ region: process.env.SES_REGION ?? "eu-west-1" });
  return _ses;
}

export async function sendOTPEmail({ to, otp, purpose }) {
  const isLogin = purpose === "login";
  const subject = isLogin
    ? "Your MediZyra Login OTP"
    : "Verify your MediZyra email address";

  const htmlBody = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#5b21b6,#4c1d95);border-radius:12px;padding:24px 28px;margin-bottom:24px;">
        <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:-0.5px;">MediZyra Healthcare</h1>
        <p style="color:rgba(255,255,255,0.75);margin:4px 0 0;font-size:13px;">Your trusted health management platform</p>
      </div>

      <p style="color:#1e1440;font-size:15px;margin-bottom:8px;">
        ${isLogin ? "Use the OTP below to log in to your account:" : "Use the OTP below to verify your email and activate your account:"}
      </p>

      <div style="background:#f5f3ff;border:2px dashed #7c3aed;border-radius:12px;padding:28px;text-align:center;margin:24px 0;">
        <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#4c1d95;font-family:monospace;">${otp}</span>
      </div>

      <p style="color:#6b7280;font-size:13px;">
        ⏱ This OTP is valid for <strong>10 minutes</strong> and can only be used once.
      </p>
      <p style="color:#6b7280;font-size:13px;">
        If you did not request this, you can safely ignore this email.
      </p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:11px;text-align:center;">
        MediZyra Healthcare Solutions · This is an automated email, please do not reply.
      </p>
    </div>
  `;

  const command = new SendEmailCommand({
    FromEmailAddress: SENDER,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: {
            Data: `Your MediZyra OTP is: ${otp}\nValid for 10 minutes.\nDo not share this with anyone.`,
            Charset: "UTF-8",
          },
        },
      },
    },
  });

  await getSESClient().send(command);
}
