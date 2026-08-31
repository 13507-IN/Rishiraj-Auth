const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;
let etherealReady = false;

// Eagerly initialize the transporter in the background on startup
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
  console.log('📧 Email: Production SMTP eagerly initialized');
} else {
  nodemailer.createTestAccount()
    .then((testAccount) => {
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
      console.log('📧 Email: Ethereal test account eagerly initialized');
      console.log(`   Ethereal user: ${testAccount.user}`);
    })
    .catch((err) => {
      console.error('❌ Failed to eagerly initialize Ethereal test account:', err.message);
    });
}

const getTransporter = async () => {
  if (transporter) return transporter;

  // Fallback if eager initialization failed or hasn't finished yet
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
    console.log('📧 Email: Production SMTP initialized on-demand');
  } else {
    console.log('📧 Email: Creating Ethereal test account on-demand (fallback)...');
    const testAccount = await nodemailer.createTestAccount();
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
    console.log('📧 Email: Ethereal test account initialized on-demand');
    console.log(`   Ethereal user: ${testAccount.user}`);
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
      <h2 style="margin:0 0 16px;font-size:22px;">${heading}</h2>
      <p style="color:#a7b0c0;line-height:1.6;margin:0 0 24px;">${body}</p>
      ${token ? `<div style="background:#0a0a10;border-radius:10px;padding:14px;font-family:'Consolas',monospace;font-size:14px;color:#ffb86b;word-break:break-all;margin-bottom:24px;">${token}</div>` : ''}
      ${buttonText && buttonUrl ? `<a href="${buttonUrl}" style="display:inline-block;background:linear-gradient(120deg,#ffb86b,#ff9a3d);color:#1b1b1b;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;">${buttonText}</a>` : ''}
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
      console.log(`\n📬 Email Preview for ${to}:`);
      console.log(`   ${previewUrl}\n`);
    }

    return { info, previewUrl };
  } catch (error) {
    console.error('❌ Failed to send email via SMTP:', error.message);
    
    // In development/local environments, do not crash the registration request!
    // Simply fallback to logging the details to the console.
    if (env.NODE_ENV !== 'production') {
      console.log(`\n📬 [DEV FALLBACK] Simulated Email to ${to}:`);
      console.log(`   Subject: ${subject}`);
      console.log(`   HTML Content:\n${html}\n`);
      return { info: { messageId: 'simulated-id' }, previewUrl: null };
    }
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

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};