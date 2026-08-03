CREATE TABLE "OcrWorkflow" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "webhookUrl" TEXT NOT NULL,
  "callbackUrl" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OcrWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OcrWorkflow_name_key" ON "OcrWorkflow"("name");
CREATE INDEX "OcrWorkflow_enabled_createdAt_idx" ON "OcrWorkflow"("enabled", "createdAt");

ALTER TABLE "OcrTask"
  ADD COLUMN "sessionId" TEXT,
  ADD COLUMN "workflowId" TEXT,
  ADD COLUMN "storagePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "matchedResultJson" JSONB,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OcrTask_sessionId_key" ON "OcrTask"("sessionId");
CREATE INDEX "OcrTask_workflowId_createdAt_idx" ON "OcrTask"("workflowId", "createdAt");
CREATE INDEX "OcrTask_state_createdAt_idx" ON "OcrTask"("state", "createdAt");

ALTER TABLE "OcrTask" ADD CONSTRAINT "OcrTask_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "OcrWorkflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
