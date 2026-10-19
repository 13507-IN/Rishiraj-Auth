CREATE TABLE "TenantInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    CONSTRAINT "TenantInvitation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "TenantInvitation_token_key" ON "TenantInvitation"("token");
CREATE INDEX "TenantInvitation_tenantId_email_idx" ON "TenantInvitation"("tenantId", "email");
CREATE INDEX "TenantInvitation_expiresAt_idx" ON "TenantInvitation"("expiresAt");

ALTER TABLE "TenantInvitation"
ADD CONSTRAINT "TenantInvitation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
