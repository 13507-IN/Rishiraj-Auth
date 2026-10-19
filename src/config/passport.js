const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { providerConfig } = require('./providers');
const env = require('./env');
const { resolveSocialAccount } = require('../services/socialAccountService');

const configurePassport = () => {
  for (const [provider, Strategy] of Object.entries({
    google: GoogleStrategy, github: GitHubStrategy, facebook: FacebookStrategy
  })) {
    const config = providerConfig(provider);
    if (!config.clientID || !config.clientSecret || !config.callbackURL) continue;
    const strategy = new Strategy(
      {
        clientID: config.clientID,
        clientSecret: config.clientSecret,
        callbackURL: config.callbackURL,
        passReqToCallback: true,
        ...(provider === 'facebook' ? {
          graphAPIVersion: env.FACEBOOK_GRAPH_API_VERSION,
          profileFields: ['id', 'displayName'],
          enableProof: true
        } : {})
      },
      async (req, _accessToken, _refreshToken, profile, done) => {
        try {
          return done(null, await resolveSocialAccount(provider, profile.id, req.oauthState));
        } catch (err) {
          return done(err);
        }
      }
    );
    passport.use(strategy);
  }
};

module.exports = {
  configurePassport,
  passport
};
