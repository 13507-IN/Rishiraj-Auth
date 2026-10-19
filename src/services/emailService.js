const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
let etherealReady = false;
let transporterPromise = null;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[char]);

const getTransporter = async () => {
  if (transporter) return transporter;
  if (transporterPromise) return transporterPromise;

  if (env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
  } else {
    transporterPromise = nodemailer.createTestAccount().then((testAccount) => {
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      etherealReady = true;
      return transporter;
    }).catch((error) => {
      transporterPromise = null;
      throw error;
    });
    return transporterPromise;
  }

  return transporter;
};

const buildHtmlEmail = ({ title, heading, body, buttonText, buttonUrl, token }) => {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0a10;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#151a22;border-radius:16px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
    <div style="background:linear-gradient(120deg,#ffb86b,#ff9a3d);padding:24px 32px;">
      <h1 style="margin:0;color:#1b1b1b;font-size:20px;">🔐 Rishiraj Auth</h1>
    </div>
    <div style="padding:32px;color:#f6f4ff;">
      <h2 style="margin:0 0 16px;font-size:22px;">${escapeHtml(heading)}</h2>
      <p style="color:#a7b0c0;line-height:1.6;margin:0 0 24px;">${escapeHtml(body)}</p>
      ${token ? `<div style="background:#0a0a10;border-radius:10px;padding:14px;font-family:'Consolas',monospace;font-size:14px;color:#ffb86b;word-break:break-all;margin-bottom:24px;">${escapeHtml(token)}</div>` : ''}
      ${buttonText && buttonUrl ? `<a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:linear-gradient(120deg,#ffb86b,#ff9a3d);color:#1b1b1b;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;">${escapeHtml(buttonText)}</a>` : ''}
    </div>
    <div style="padding:16px 32px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="margin:0;font-size:12px;color:#a7b0c0;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`;
};

const sendMail = async ({ to, subject, html }) => {
  try {
    const transport = await getTransporter();
    const info = await transport.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html
    });

    let previewUrl = null;
    if (etherealReady) {
      previewUrl = nodemailer.getTestMessageUrl(info) || null;
    }

    return { info, previewUrl };
  } catch (error) {
    // Never log message contents, credentials, tokens, or recipient addresses.
    throw error;
  }
};

const sendVerificationEmail = async (email, token) => {
  const html = buildHtmlEmail({
    title: 'Verify Your Email',
    heading: 'Verify your email address',
    body: 'Use the verification token below to activate your account. This token expires in 24 hours.',
    token
  });

  return await sendMail({
    to: email,
    subject: '🔐 Verify your email — Rishiraj Auth',
    html
  });
};

const sendPasswordResetEmail = async (email, token) => {
  const html = buildHtmlEmail({
    title: 'Password Reset',
    heading: 'Reset your password',
    body: 'Use the token below to reset your password. This token expires in 30 minutes.',
    token
  });

  return await sendMail({
    to: email,
    subject: '🔑 Password reset — Rishiraj Auth',
    html
  });
};

const sendTenantInvitationEmail = async (email, token, tenantName) => {
  const inviteUrl = new URL('/console.html', env.FRONTEND_URL);
  inviteUrl.hash = new URLSearchParams({
    invite: token,
    email: email.trim().toLowerCase()
  }).toString();
  const html = buildHtmlEmail({
    title: 'Workspace Invitation',
    heading: 'You have a workspace invitation',
    body: `You were invited to join ${tenantName}. This invitation expires in 7 days and can only be used once by the invited email address.`,
    buttonText: 'Accept Invitation',
    buttonUrl: inviteUrl.toString()
  });
  return sendMail({
    to: email,
    subject: 'You were invited to a Rishiraj Auth workspace',
    html
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendTenantInvitationEmail
};
