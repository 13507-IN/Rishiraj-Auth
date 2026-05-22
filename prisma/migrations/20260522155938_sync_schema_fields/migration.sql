-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('DEVELOPMENT', 'PRODUCTION');

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "environment" "Environment" NOT NULL DEFAULT 'PRODUCTION';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "environment" "Environment";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL DEFAULT 'DEVELOPMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_tenantId_idx" ON "Project"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_environment_key" ON "Project"("tenantId", "environment");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
