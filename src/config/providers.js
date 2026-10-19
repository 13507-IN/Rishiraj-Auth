const env = require('./env');

const providers = {
  google: { name: 'Google', scope: ['profile', 'email'], docs: 'https://developers.google.com/identity/protocols/oauth2/web-server', console: 'https://console.cloud.google.com/auth/clients' },
  github: { name: 'GitHub', scope: ['read:user'], docs: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app', console: 'https://github.com/settings/developers' },
  facebook: { name: 'Facebook', scope: ['public_profile'], docs: 'https://developers.facebook.com/docs/facebook-login/web/', console: 'https://developers.facebook.com/apps/' }
};

function providerConfig(id) {
  if (!Object.hasOwn(providers, id)) return null;
  const prefix = id.toUpperCase();
  return {
    ...providers[id], id,
    clientID: env[`${prefix}_CLIENT_ID`],
    clientSecret: env[`${prefix}_CLIENT_SECRET`],
    callbackURL: env[`${prefix}_CALLBACK_URL`]
  };
}

function publicProviders() {
  return Object.keys(providers).map((id) => {
    const config = providerConfig(id);
    return { id, name: config.name, configured: Boolean(config.clientID && config.clientSecret && config.callbackURL) };
  });
}

module.exports = { providers, providerConfig, publicProviders };
