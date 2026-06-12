-- SIRH : brique Parcours collaborateur (onboarding / offboarding RH), multi-tenant.

-- CreateEnum
CREATE TYPE "JourneyKind" AS ENUM ('ONBOARDING', 'OFFBOARDING');
CREATE TYPE "JourneyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable JourneyTemplate
CREATE TABLE "JourneyTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "kind" "JourneyKind" NOT NULL DEFAULT 'ONBOARDING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JourneyTemplate_tenantId_idx" ON "JourneyTemplate"("tenantId");
CREATE INDEX "JourneyTemplate_tenantId_kind_idx" ON "JourneyTemplate"("tenantId", "kind");

-- CreateTable JourneyTemplateTask
CREATE TABLE "JourneyTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "responsible" TEXT,
    "offsetDays" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JourneyTemplateTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JourneyTemplateTask_templateId_idx" ON "JourneyTemplateTask"("templateId");

-- CreateTable Journey
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "employeeId" TEXT NOT NULL,
    "templateId" TEXT,
    "kind" "JourneyKind" NOT NULL DEFAULT 'ONBOARDING',
    "title" TEXT NOT NULL,
    "startDate" DATE,
    "status" "JourneyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Journey_tenantId_idx" ON "Journey"("tenantId");
CREATE INDEX "Journey_tenantId_status_idx" ON "Journey"("tenantId", "status");
CREATE INDEX "Journey_employeeId_idx" ON "Journey"("employeeId");

-- CreateTable JourneyTask
CREATE TABLE "JourneyTask" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "responsible" TEXT,
    "dueDate" DATE,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JourneyTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JourneyTask_journeyId_idx" ON "JourneyTask"("journeyId");

-- AddForeignKey
ALTER TABLE "JourneyTemplate" ADD CONSTRAINT "JourneyTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JourneyTemplateTask" ADD CONSTRAINT "JourneyTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JourneyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JourneyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JourneyTask" ADD CONSTRAINT "JourneyTask_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
