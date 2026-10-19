# Rishiraj Auth

A self-hostable authentication service with a guided workspace studio, customizable sign-in page, Google/GitHub/Facebook login, email verification, password recovery, API keys, refresh-token rotation, and workspace invitations.

## Folder Structure

- `src/controllers/`
- `src/routes/`
- `src/middleware/`
- `src/services/`
- `src/utils/`
- `src/config/`
- `src/prisma/`
- `prisma/schema.prisma`
- `frontend/`

## Quick Start

1. Copy `.env.example` to `.env` and update the database, JWT, and Redis settings. For a local setup, follow the guided page at `/` after registering. OAuth credentials are optional until you want to enable a provider.
2. Install dependencies:
   - `npm install`
3. Start PostgreSQL and Redis. Redis may be optional for local development only.
4. Apply the local development migrations:
   - `npm run prisma:migrate`
5. Start the server:
   - `npm run dev`
6. Open `http://localhost:4000`, create your workspace, and use **Get started** to customize your sign-in page, copy provider callback URLs, and add the SDK.

Rishi Auth uses the PostgreSQL database in `DATABASE_URL` for all workspaces on a deployment. To use your own database, set that URL on the server, back up existing data, and apply migrations with `npx prisma migrate deploy`. For a separate physical database per customer, run a separate Rishi Auth deployment. Your app can keep its own business data and verify Rishi Auth access tokens through `POST /auth/verify-token`. There is no automatic cross-database sync.

Google, GitHub, and Facebook require separate apps in their provider developer consoles. The **Get started → Sign-in methods** guide shows the exact callback URL and credential names. Put OAuth client secrets in the server `.env`, never in a web page. Sign-in providers are linked only after a user signs in with email; Rishi Auth never merges users based on matching provider emails.

For deployments, set `NODE_ENV=production`, use `npx prisma migrate deploy`, and use HTTPS. Production startup intentionally fails unless PostgreSQL, Redis, SMTP credentials, trusted HTTPS origins, and distinct strong JWT/OAuth secrets are configured.

Never commit `.env` or put live credentials in the frontend. Use unique randomly generated secrets of at least 32 characters for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `OAUTH_STATE_SECRET`; the three production values must be different. `DEV_AUTH_TOKENS=true` is limited to development and exposes verification/reset tokens and test-email previews to the local UI.

## API Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh-token`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/providers`
- `GET /auth/google`, `GET /auth/github`, `GET /auth/facebook`
- `POST /auth/oauth/exchange`
- `POST /auth/providers/:provider/link`
- `GET /workspace/setup`
- `PUT /workspace/page`
- `GET /workspace/pages/:tenantId`
- `GET /user/profile`
- `GET /admin/dashboard`
- `POST /api-keys`
- `GET /admin/tenants`
- `POST /admin/tenants`
- `GET /admin/users`
- `PATCH /admin/users/:userId/role`
- `PATCH /admin/users/:userId/tenant`
- `POST /admin/tenants/:tenantId/invitations`
- `GET /api-keys`
- `POST /api-keys/validate`

## Notes

- Refresh tokens are hashed in Postgres and cached in Redis; rotation is single-use. Access tokens are short-lived, checked against current user permissions, and blacklisted on logout.
- OAuth uses provider-specific `CLIENT_ID`, `CLIENT_SECRET`, and `CALLBACK_URL` environment variables. The workspace settings page provides step-by-step setup.
- The workspace owner can update a small set of sign-in page settings; provider choices and colors are validated, and text is rendered as text. Published pages are served from `/login.html?workspace=<workspace-id>`.
- New users create a workspace or register with an email-bound, one-time invitation. A guessed tenant ID is not sufficient to join a workspace.
- Email-verification and password-reset tokens are hashed, expire, and can only be consumed once. Recovery responses do not confirm whether an account exists.
- Redis fallback is for development only (`REDIS_REQUIRED=false`). Production requires Redis for shared rate limiting and token revocation.
- `/health` reports PostgreSQL and Redis availability plus whether Google OAuth and SMTP are configured; it does not expose connection details or test SMTP delivery.
- API keys are shown once on creation. Only metadata + last 4 digits are listable later.
- Frontend pages: `/` (home), `/login.html` (sign in/create account), `/studio.html` (guided setup), `/dashboard.html` (sessions, keys and activity), and `/docs.html` (integration docs).
- The embedded SDK keeps tokens in memory. The first-party console/dashboard uses `sessionStorage` to survive page navigation within the current tab; this is still accessible to same-origin JavaScript, so XSS prevention and HTTPS remain essential.
- `ADMIN` is currently a platform-wide role with access to all tenants and user administration. Grant it only to trusted operators; tenant-scoped delegated administrators are not implemented yet.
- The migration `20261010180000_guided_setup` adds social account links and page settings. Review and back up the target database before applying production migrations.

## Middleware Quick Start

Set `AUTH_SYSTEM_URL`, then copy the middleware from `/docs.html#middleware` to protect your services with API keys.

## API Key Usage

Use the API key from `/api-keys` creation to access your downstream services. A common pattern:

```
Authorization: Bearer <apiKey>
```

Or:

```
x-api-key: <apiKey>
```

This project returns keys and metadata; enforcement in downstream services should validate the key hash.

## Validate API Key (for downstream services)

`POST /api-keys/validate`

Send the API key in `Authorization: Bearer <apiKey>`, `x-api-key`, or JSON body:

```
{ "apiKey": "<apiKey>" }
```

Response (valid):

```
{
  "valid": true,
  "keyId": "...",
  "name": "...",
  "userId": "...",
  "tenantId": "...",
  "services": ["auth", "users"],
  "last4": "1a2b",
  "createdAt": "..."
}
```

Response (invalid):

```
{ "valid": false }
```
