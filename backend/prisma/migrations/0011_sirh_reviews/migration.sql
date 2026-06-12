-- SIRH : brique Entretiens & objectifs (multi-tenant).

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('ANNUAL', 'PROFESSIONAL', 'PROBATION', 'ONE_ON_ONE');
CREATE TYPE "ReviewStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ObjectiveStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateTable Review
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL DEFAULT 'ANNUAL',
    "status" "ReviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "employeeNotes" TEXT,
    "managerNotes" TEXT,
    "summary" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Review_tenantId_idx" ON "Review"("tenantId");
CREATE INDEX "Review_tenantId_status_idx" ON "Review"("tenantId", "status");
CREATE INDEX "Review_employeeId_idx" ON "Review"("employeeId");
CREATE INDEX "Review_managerId_idx" ON "Review"("managerId");

-- CreateTable Objective
CREATE TABLE "Objective" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "reviewId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'TODO',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Objective_tenantId_idx" ON "Objective"("tenantId");
CREATE INDEX "Objective_userId_idx" ON "Objective"("userId");
CREATE INDEX "Objective_reviewId_idx" ON "Objective"("reviewId");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Objective" ADD CONSTRAINT "Objective_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
