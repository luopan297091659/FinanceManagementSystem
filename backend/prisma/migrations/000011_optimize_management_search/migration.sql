CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Property_deletedAt_name_idx"
  ON "Property"("deletedAt", "name");
CREATE INDEX IF NOT EXISTS "Room_deletedAt_propertyId_roomNumber_idx"
  ON "Room"("deletedAt", "propertyId", "roomNumber");
CREATE INDEX IF NOT EXISTS "Contract_deletedAt_startDate_createdAt_idx"
  ON "Contract"("deletedAt", "startDate", "createdAt");

CREATE INDEX IF NOT EXISTS "Property_name_trgm_idx"
  ON "Property" USING GIN ("name" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Property_code_trgm_idx"
  ON "Property" USING GIN ("propertyCode" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Property_address_trgm_idx"
  ON "Property" USING GIN ("address" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Room_number_trgm_idx"
  ON "Room" USING GIN ("roomNumber" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Room_house_number_trgm_idx"
  ON "Room" USING GIN ("houseNumber" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Room_code_trgm_idx"
  ON "Room" USING GIN ("roomCode" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Contract_number_trgm_idx"
  ON "Contract" USING GIN ("contractNumber" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_contractor_name_trgm_idx"
  ON "Contract" USING GIN ("contractorName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_payer_name_trgm_idx"
  ON "Contract" USING GIN ("payerName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "Contract_bank_summary_trgm_idx"
  ON "Contract" USING GIN ("bankSummaryName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;
