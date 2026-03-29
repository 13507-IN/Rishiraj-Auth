const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const prisma = require('./prisma');
const env = require('./env');
const { decodeOAuthState } = require('../utils/oauth');
const { ApiError } = require('../utils/errors');

const configurePassport = () => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        callbackURL: env.GOOGLE_CALLBACK_URL,
        passReqToCallback: true
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const state = decodeOAuthState(req.query.state);
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;

          if (!email) {
            return done(new ApiError(400, 'Google account email not available'));
          }

          let user = await prisma.user.findUnique({ where: { email } });

          if (!user) {
            if (!state.tenantId) {
              return done(new ApiError(400, 'Tenant ID is required for first-time OAuth login'));
            }

            const tenant = await prisma.tenant.findUnique({ where: { id: state.tenantId } });
            if (!tenant) {
              return done(new ApiError(404, 'Tenant not found'));
            }

            user = await prisma.user.create({
              data: {
                email,
                password: null,
                role: 'USER',
                tenantId: tenant.id,
                isVerified: true
              }
            });
          }

          if (state.tenantId && user.tenantId !== state.tenantId) {
            return done(new ApiError(403, 'User belongs to a different tenant'));
          }

          return done(null, user);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
};

module.exports = {
  configurePassport,
  passport
};