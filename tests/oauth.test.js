const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
process.env.REDIS_URL = 'redis://127.0.0.1:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-long-enough';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-long-enough';
process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret-that-is-long-enough';

const {
  createOAuthState,
  decodeOAuthState,
  parseCookie
} = require('../src/utils/oauth');

test('OAuth state is signed, expiring, and bound to its nonce and client origin', () => {
  const created = createOAuthState({
    tenantId: '4b2b63b4-222c-491e-8bc7-f8cf81f75000',
    clientOrigin: 'https://client.example'
  });

  assert.ok(decodeOAuthState(created.state));
  assert.equal(decodeOAuthState(created.state, created.nonce).clientOrigin, 'https://client.example');
  assert.equal(decodeOAuthState(created.state, 'wrong-nonce'), null);
  assert.equal(decodeOAuthState(created.state).tenantId, '4b2b63b4-222c-491e-8bc7-f8cf81f75000');
});

test('OAuth state rejects tampered payloads and signatures', () => {
  const created = createOAuthState({ clientOrigin: 'https://client.example' });
  const [payload, signature] = created.state.split('.');
  const changedPayload = `${payload.slice(0, -1)}${payload.endsWith('A') ? 'B' : 'A'}`;
  const changedSignature = `${payload}.${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;

  assert.equal(decodeOAuthState(`${changedPayload}.${signature}`), null);
  assert.equal(decodeOAuthState(changedSignature), null);
  assert.equal(decodeOAuthState('not-a-state'), null);
});

test('cookie parser handles encoded values and malformed cookies safely', () => {
  assert.equal(parseCookie('other=x; rishiraj_oauth_nonce=abc%2B123', 'rishiraj_oauth_nonce'), 'abc+123');
  assert.equal(parseCookie('rishiraj_oauth_nonce=%E0%A4%A', 'rishiraj_oauth_nonce'), null);
  assert.equal(parseCookie('other=x', 'rishiraj_oauth_nonce'), null);
});
