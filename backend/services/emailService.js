const nodemailer = require('nodemailer');

const EMAIL_FROM = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@example.com';
const APP_NAME = process.env.APP_NAME || 'Zakaria Rental System';

const hasSmtpConfig = () => {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
};

const getTransporter = () => {
  if (!hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

const sendPasswordResetEmail = async ({ toEmail, firstName, resetUrl, expiresMinutes }) => {
  const transporter = getTransporter();

  if (!transporter) {
    console.warn(
      `Password reset requested for ${toEmail}, but SMTP is not configured. Reset URL: ${resetUrl}`
    );
    return { sent: false, skipped: true };
  }

  const safeName = firstName || 'there';
  const subject = `${APP_NAME} password reset`;
  const text = [
    `Hi ${safeName},`,
    '',
    `We received a request to reset your ${APP_NAME} password.`,
    `Use this link to continue: ${resetUrl}`,
    '',
    `This link expires in ${expiresMinutes} minutes and can be used once.`,
    '',
    'If you did not request this, you can ignore this email.'
  ].join('\n');

  const html = `
    <p>Hi ${safeName},</p>
    <p>We received a request to reset your <strong>${APP_NAME}</strong> password.</p>
    <p>
      <a href="${resetUrl}" target="_blank" rel="noopener noreferrer">
        Reset password
      </a>
    </p>
    <p>This link expires in ${expiresMinutes} minutes and can be used once.</p>
    <p>If you did not request this, you can ignore this email.</p>
  `;

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: toEmail,
    subject,
    text,
    html
  });

  return { sent: true };
};

module.exports = {
  sendPasswordResetEmail
};
