CREATE TABLE "ReconciliationTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "configurationJson" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReconciliationTemplate_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ReconciliationBatch" ADD COLUMN "templateId" TEXT;
ALTER TABLE "ReconciliationBatch" ADD COLUMN "templateSnapshotJson" JSONB;

CREATE UNIQUE INDEX "ReconciliationTemplate_createdByUserId_name_key" ON "ReconciliationTemplate"("createdByUserId", "name");
CREATE INDEX "ReconciliationTemplate_createdByUserId_isActive_idx" ON "ReconciliationTemplate"("createdByUserId", "isActive");
CREATE INDEX "ReconciliationBatch_templateId_idx" ON "ReconciliationBatch"("templateId");

ALTER TABLE "ReconciliationTemplate" ADD CONSTRAINT "ReconciliationTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReconciliationBatch" ADD CONSTRAINT "ReconciliationBatch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReconciliationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
