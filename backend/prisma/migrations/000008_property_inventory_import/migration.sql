-- Incremental property inventory/import support. Existing records and legacy fields are preserved.
ALTER TABLE "Property"
  ADD COLUMN "propertyCode" TEXT,
  ADD COLUMN "normalizedName" TEXT,
  ADD COLUMN "nameKana" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "normalizedAddress" TEXT,
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "buildingType" TEXT,
  ADD COLUMN "usageType" TEXT,
  ADD COLUMN "managementStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "currentOwnerSummary" TEXT,
  ADD COLUMN "remark" TEXT,
  ADD COLUMN "sourceDataJson" JSONB,
  ADD COLUMN "createdBy" TEXT,
  ADD COLUMN "updatedBy" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Room"
  ADD COLUMN "roomCode" TEXT,
  ADD COLUMN "normalizedRoomNumber" TEXT,
  ADD COLUMN "displayName" TEXT,
  ADD COLUMN "unitType" TEXT NOT NULL DEFAULT 'ROOM',
  ADD COLUMN "floorLabel" TEXT,
  ADD COLUMN "usageType" TEXT,
  ADD COLUMN "currentContractId" TEXT,
  ADD COLUMN "currentOwnerSummary" TEXT,
  ADD COLUMN "remark" TEXT,
  ADD COLUMN "sourceDataJson" JSONB,
  ADD COLUMN "createdBy" TEXT,
  ADD COLUMN "updatedBy" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "Owner"
  ADD COLUMN "ownerCode" TEXT,
  ADD COLUMN "companyName" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "bankAccountInfo" JSONB,
  ADD COLUMN "taxInfo" JSONB,
  ADD COLUMN "ownerStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "remark" TEXT,
  ADD COLUMN "createdBy" TEXT,
  ADD COLUMN "updatedBy" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "RoomOwner"
  ADD COLUMN "ownershipRole" TEXT NOT NULL DEFAULT 'OWNER',
  ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "remark" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "PropertyOwnership" (
  "id" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "ownershipRole" TEXT NOT NULL DEFAULT 'OWNER',
  "ownershipRatio" DECIMAL(7,4),
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PropertyOwnership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyImportBatch" (
  "id" TEXT NOT NULL,
  "batchNo" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "fileHash" TEXT NOT NULL,
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "successRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "conflictRows" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "mappingJson" JSONB,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "PropertyImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PropertyImportRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "sourceDataJson" JSONB NOT NULL,
  "propertyName" TEXT NOT NULL,
  "normalizedPropertyName" TEXT NOT NULL,
  "roomNumber" TEXT,
  "normalizedRoomNumber" TEXT,
  "postalCode" TEXT,
  "address" TEXT,
  "normalizedAddress" TEXT,
  "detectedUnitType" TEXT NOT NULL DEFAULT 'ROOM',
  "propertyId" TEXT,
  "roomId" TEXT,
  "action" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "conflictReason" TEXT,
  "errorMessage" TEXT,
  "remark" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropertyImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Property_propertyCode_key" ON "Property"("propertyCode");
CREATE INDEX "Property_normalizedName_normalizedAddress_idx" ON "Property"("normalizedName", "normalizedAddress");
CREATE INDEX "Property_postalCode_idx" ON "Property"("postalCode");
CREATE INDEX "Property_managementStatus_idx" ON "Property"("managementStatus");
CREATE INDEX "Property_deletedAt_idx" ON "Property"("deletedAt");

CREATE UNIQUE INDEX "Room_roomCode_key" ON "Room"("roomCode");
CREATE UNIQUE INDEX "Room_propertyId_normalizedRoomNumber_key" ON "Room"("propertyId", "normalizedRoomNumber");
CREATE INDEX "Room_roomNumber_idx" ON "Room"("roomNumber");
CREATE INDEX "Room_unitType_idx" ON "Room"("unitType");
CREATE INDEX "Room_deletedAt_idx" ON "Room"("deletedAt");

CREATE UNIQUE INDEX "Owner_ownerCode_key" ON "Owner"("ownerCode");
CREATE INDEX "Owner_name_idx" ON "Owner"("name");
CREATE INDEX "Owner_ownerStatus_idx" ON "Owner"("ownerStatus");
CREATE INDEX "Owner_deletedAt_idx" ON "Owner"("deletedAt");

CREATE INDEX "RoomOwner_startDate_endDate_idx" ON "RoomOwner"("startDate", "endDate");
CREATE INDEX "RoomOwner_deletedAt_idx" ON "RoomOwner"("deletedAt");
CREATE INDEX "PropertyOwnership_propertyId_idx" ON "PropertyOwnership"("propertyId");
CREATE INDEX "PropertyOwnership_ownerId_idx" ON "PropertyOwnership"("ownerId");
CREATE INDEX "PropertyOwnership_validFrom_validTo_idx" ON "PropertyOwnership"("validFrom", "validTo");
CREATE INDEX "PropertyOwnership_deletedAt_idx" ON "PropertyOwnership"("deletedAt");

CREATE UNIQUE INDEX "PropertyImportBatch_batchNo_key" ON "PropertyImportBatch"("batchNo");
CREATE UNIQUE INDEX "PropertyImportBatch_fileHash_key" ON "PropertyImportBatch"("fileHash");
CREATE INDEX "PropertyImportBatch_status_createdAt_idx" ON "PropertyImportBatch"("status", "createdAt");
CREATE UNIQUE INDEX "PropertyImportRow_batchId_sourceRow_key" ON "PropertyImportRow"("batchId", "sourceRow");
CREATE INDEX "PropertyImportRow_propertyId_idx" ON "PropertyImportRow"("propertyId");
CREATE INDEX "PropertyImportRow_roomId_idx" ON "PropertyImportRow"("roomId");
CREATE INDEX "PropertyImportRow_status_idx" ON "PropertyImportRow"("status");
CREATE INDEX "PropertyImportRow_action_idx" ON "PropertyImportRow"("action");

ALTER TABLE "PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PropertyOwnership" ADD CONSTRAINT "PropertyOwnership_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PropertyImportRow" ADD CONSTRAINT "PropertyImportRow_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "PropertyImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyImportRow" ADD CONSTRAINT "PropertyImportRow_propertyId_fkey"
  FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropertyImportRow" ADD CONSTRAINT "PropertyImportRow_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
