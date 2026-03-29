const encodeOAuthState = (state) => {
  const json = JSON.stringify(state || {});
  return Buffer.from(json).toString('base64url');
};

const decodeOAuthState = (state) => {
  if (!state) return {};
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    return {};
  }
};

module.exports = {
  encodeOAuthState,
  decodeOAuthState
};