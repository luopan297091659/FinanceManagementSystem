CREATE TYPE "FundProcessingStatus" AS ENUM ('INCLUDED', 'DETAIL_ONLY', 'DUPLICATE_EXCLUDED');
CREATE TYPE "ConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'SELECTED_FOR_FIX', 'FIXING', 'RESOLVED', 'IGNORED');
CREATE TYPE "FeeBearer" AS ENUM ('OWNER', 'COMPANY', 'NEGOTIATED');
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'REMITTED');
CREATE TYPE "ThresholdScope" AS ENUM ('GLOBAL', 'PROPERTY', 'CONTRACT');
CREATE TYPE "PageReadStatus" AS ENUM ('READ', 'UNREAD', 'FAILED');

ALTER TABLE "Contract"
  ADD COLUMN "otherMonthlyFee1Name" TEXT,
  ADD COLUMN "otherMonthlyFee1" DECIMAL(18,2),
  ADD COLUMN "otherMonthlyFee2Name" TEXT,
  ADD COLUMN "otherMonthlyFee2" DECIMAL(18,2),
  ADD COLUMN "otherMonthlyFee3Name" TEXT,
  ADD COLUMN "otherMonthlyFee3" DECIMAL(18,2),
  ADD COLUMN "paymentCycleMonths" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "paymentDay" INTEGER,
  ADD COLUMN "nextDueDate" TIMESTAMP(3),
  ADD COLUMN "reminderDays" INTEGER,
  ADD COLUMN "feeBearer" "FeeBearer" NOT NULL DEFAULT 'OWNER';

ALTER TABLE "Transaction"
  ADD COLUMN "sequenceNo" INTEGER,
  ADD COLUMN "fileType" TEXT,
  ADD COLUMN "counterpartyRaw" TEXT,
  ADD COLUMN "contentSummary" TEXT,
  ADD COLUMN "fileAmount" DECIMAL(18,2),
  ADD COLUMN "transferFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "statisticalAmount" DECIMAL(18,2),
  ADD COLUMN "evidenceDateType" TEXT,
  ADD COLUMN "sourcePageStart" INTEGER,
  ADD COLUMN "sourcePageEnd" INTEGER,
  ADD COLUMN "processingStatus" "FundProcessingStatus" NOT NULL DEFAULT 'INCLUDED',
  ADD COLUMN "confirmationStatus" "ConfirmationStatus" NOT NULL DEFAULT 'PENDING';

CREATE TABLE "BankNameAlias" (
  "id" TEXT NOT NULL,
  "rawName" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "tenantId" TEXT,
  "ownerId" TEXT,
  "confidence" DECIMAL(5,4),
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BankNameAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OwnerSettlement" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "grossIncomeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "managementFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "expenseAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "transferFeeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "overdueAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "remittanceAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnerSettlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnomalyAlert" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT,
  "roomId" TEXT,
  "contractId" TEXT,
  "transactionId" TEXT,
  "alertType" TEXT NOT NULL,
  "severity" "AnomalySeverity" NOT NULL,
  "amount" DECIMAL(18,2),
  "differenceAmount" DECIMAL(18,2),
  "occurredOn" TIMESTAMP(3),
  "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
  "assigneeUserId" TEXT,
  "handledBy" TEXT,
  "handledAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "changedFields" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnomalyAlert_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PageCoverage" (
  "id" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "pageNumber" INTEGER NOT NULL,
  "readStatus" "PageReadStatus" NOT NULL DEFAULT 'UNREAD',
  "relatedSequenceNos" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "fileType" TEXT,
  "pageNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PageCoverage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnomalyThresholdConfig" (
  "id" TEXT NOT NULL,
  "scope" "ThresholdScope" NOT NULL,
  "propertyId" TEXT,
  "contractId" TEXT,
  "anomalyType" TEXT NOT NULL,
  "graceDays" INTEGER,
  "amountTolerance" DECIMAL(18,2),
  "percentTolerance" DECIMAL(8,4),
  "reminderLeadDays" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnomalyThresholdConfig_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Contract_nextDueDate_idx" ON "Contract"("nextDueDate");
CREATE INDEX "Transaction_processingStatus_confirmationStatus_idx" ON "Transaction"("processingStatus", "confirmationStatus");
CREATE INDEX "BankNameAlias_normalizedName_idx" ON "BankNameAlias"("normalizedName");
CREATE INDEX "BankNameAlias_tenantId_idx" ON "BankNameAlias"("tenantId");
CREATE INDEX "BankNameAlias_ownerId_idx" ON "BankNameAlias"("ownerId");
CREATE INDEX "OwnerSettlement_ownerId_periodStart_periodEnd_idx" ON "OwnerSettlement"("ownerId", "periodStart", "periodEnd");
CREATE INDEX "OwnerSettlement_status_idx" ON "OwnerSettlement"("status");
CREATE INDEX "AnomalyAlert_status_severity_idx" ON "AnomalyAlert"("status", "severity");
CREATE INDEX "AnomalyAlert_propertyId_alertType_idx" ON "AnomalyAlert"("propertyId", "alertType");
CREATE INDEX "AnomalyAlert_roomId_alertType_idx" ON "AnomalyAlert"("roomId", "alertType");
CREATE UNIQUE INDEX "PageCoverage_documentId_pageNumber_key" ON "PageCoverage"("documentId", "pageNumber");
CREATE INDEX "PageCoverage_readStatus_idx" ON "PageCoverage"("readStatus");
CREATE INDEX "AnomalyThresholdConfig_scope_anomalyType_enabled_idx" ON "AnomalyThresholdConfig"("scope", "anomalyType", "enabled");
CREATE INDEX "AnomalyThresholdConfig_propertyId_idx" ON "AnomalyThresholdConfig"("propertyId");
CREATE INDEX "AnomalyThresholdConfig_contractId_idx" ON "AnomalyThresholdConfig"("contractId");

ALTER TABLE "BankNameAlias" ADD CONSTRAINT "BankNameAlias_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankNameAlias" ADD CONSTRAINT "BankNameAlias_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OwnerSettlement" ADD CONSTRAINT "OwnerSettlement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnomalyAlert" ADD CONSTRAINT "AnomalyAlert_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnomalyAlert" ADD CONSTRAINT "AnomalyAlert_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnomalyAlert" ADD CONSTRAINT "AnomalyAlert_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AnomalyAlert" ADD CONSTRAINT "AnomalyAlert_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PageCoverage" ADD CONSTRAINT "PageCoverage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
