const sendVerificationEmail = async (email, token) => {
  // TODO: replace with real email provider.
  console.log(`Verification token for ${email}: ${token}`);
};

const sendPasswordResetEmail = async (email, token) => {
  // TODO: replace with real email provider.
  console.log(`Password reset token for ${email}: ${token}`);
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};