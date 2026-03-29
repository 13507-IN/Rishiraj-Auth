# Auth-System

Production-ready authentication and authorization server with JWT, RBAC, Google OAuth, refresh token rotation, and multi-tenant support.

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

1. Copy `.env.example` to `.env` and update values.
2. Install dependencies:
   - `npm install`
3. Run Prisma migrations:
   - `npm run prisma:migrate`
4. Start Redis and PostgreSQL.
5. Start the server:
   - `npm run dev`

## API Endpoints

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh-token`
- `POST /auth/verify-email`
- `POST /auth/resend-verification`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/google`
- `GET /user/profile`
- `GET /admin/dashboard`
- `POST /api-keys`
- `GET /admin/tenants`
- `POST /admin/tenants`
- `GET /admin/users`
- `PATCH /admin/users/:userId/role`
- `PATCH /admin/users/:userId/tenant`
- `GET /api-keys`
- `POST /api-keys/validate`

## Notes

- Refresh tokens are hashed and stored in Postgres and Redis for fast revocation.
- Access tokens are short-lived; blacklisting is supported on logout.
- Google OAuth requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`.
- Multi-tenant isolation is enforced via tenant IDs embedded in JWT.
- Email verification and password reset are implemented with hashed, time-limited tokens.
- Redis fallback can be enabled in development using `REDIS_REQUIRED=false`.
- API keys are shown once on creation. Only metadata + last 4 digits are listable later.

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
