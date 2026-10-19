ALTER TABLE "Tenant" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "loginPage" JSONB;

-- Workspace registration creates the first user before invitations are
-- accepted. That original member is the workspace owner.
UPDATE "Tenant" t SET "ownerId" = first_member.id
FROM (
  SELECT DISTINCT ON (u."tenantId") u."tenantId", u.id AS id
  FROM "User" u
  ORDER BY u."tenantId", u."createdAt" ASC, u.id ASC
) first_member
WHERE first_member."tenantId" = t.id;

CREATE TABLE "SocialAccount" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocialAccount_provider_subject_key" ON "SocialAccount"("provider", "subject");
CREATE UNIQUE INDEX "SocialAccount_userId_provider_key" ON "SocialAccount"("userId", "provider");
