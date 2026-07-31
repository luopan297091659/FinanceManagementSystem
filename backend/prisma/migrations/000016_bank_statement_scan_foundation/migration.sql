CREATE TYPE "BankStatementScanStatus" AS ENUM (
  'VALIDATING',
  'READY',
  'DUPLICATE',
  'QUEUED',
  'PREPROCESSING',
  'OCR_RUNNING',
  'TABLE_ANALYSIS',
  'DATA_NORMALIZATION',
  'VALIDATING_RESULTS',
  'REVIEW_REQUIRED',
  'GENERATING_EXCEL',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "BankStatementScanTask" (
  "id" TEXT NOT NULL,
  "scanNo" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
  "fileSize" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "pageCount" INTEGER,
  "createdByUserId" TEXT,
  "status" "BankStatementScanStatus" NOT NULL DEFAULT 'VALIDATING',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "processedPageCount" INTEGER NOT NULL DEFAULT 0,
  "extractedRowCount" INTEGER NOT NULL DEFAULT 0,
  "warningCount" INTEGER NOT NULL DEFAULT 0,
  "currentStage" TEXT,
  "providerProfileId" TEXT,
  "providerType" TEXT,
  "providerModel" TEXT,
  "providerSnapshot" JSONB,
  "generatedFileId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankStatementScanTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankStatementScanTask_scanNo_key" ON "BankStatementScanTask"("scanNo");
CREATE INDEX "BankStatementScanTask_createdByUserId_createdAt_idx" ON "BankStatementScanTask"("createdByUserId", "createdAt");
CREATE INDEX "BankStatementScanTask_checksum_idx" ON "BankStatementScanTask"("checksum");
CREATE INDEX "BankStatementScanTask_status_createdAt_idx" ON "BankStatementScanTask"("status", "createdAt");
