-- Keep OCR list responses independent from the potentially very large result payload.
ALTER TABLE "OcrTask"
  ADD COLUMN "resultSummary" JSONB;

UPDATE "OcrTask"
SET "resultSummary" = COALESCE("resultJson"->'summary', "matchedResultJson"->'summary')
WHERE "resultSummary" IS NULL
  AND ("resultJson"->'summary' IS NOT NULL OR "matchedResultJson"->'summary' IS NOT NULL);

-- The management screens use case-insensitive substring search. B-tree indexes
-- cannot serve those predicates, while trigram GIN indexes can.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Property_name_trgm_idx" ON "Property" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Property_propertyCode_trgm_idx" ON "Property" USING GIN ("propertyCode" gin_trgm_ops);
CREATE INDEX "Property_address_trgm_idx" ON "Property" USING GIN ("address" gin_trgm_ops);
CREATE INDEX "Room_roomCode_trgm_idx" ON "Room" USING GIN ("roomCode" gin_trgm_ops);
CREATE INDEX "Room_houseNumber_trgm_idx" ON "Room" USING GIN ("houseNumber" gin_trgm_ops);
CREATE INDEX "Room_roomNumber_trgm_idx" ON "Room" USING GIN ("roomNumber" gin_trgm_ops);
CREATE INDEX "Room_displayName_trgm_idx" ON "Room" USING GIN ("displayName" gin_trgm_ops);
CREATE INDEX "Contract_contractNumber_trgm_idx" ON "Contract" USING GIN ("contractNumber" gin_trgm_ops);
CREATE INDEX "Contract_externalContractId_trgm_idx" ON "Contract" USING GIN ("externalContractId" gin_trgm_ops);
CREATE INDEX "Contract_contractorName_trgm_idx" ON "Contract" USING GIN ("contractorName" gin_trgm_ops);
CREATE INDEX "Contract_contractorNameKana_trgm_idx" ON "Contract" USING GIN ("contractorNameKana" gin_trgm_ops);
CREATE INDEX "Contract_payerName_trgm_idx" ON "Contract" USING GIN ("payerName" gin_trgm_ops);
CREATE INDEX "Contract_payerNameKana_trgm_idx" ON "Contract" USING GIN ("payerNameKana" gin_trgm_ops);
CREATE INDEX "Contract_bankSummaryName_trgm_idx" ON "Contract" USING GIN ("bankSummaryName" gin_trgm_ops);
CREATE INDEX "Contract_bankStatementSummary_trgm_idx" ON "Contract" USING GIN ("bankStatementSummary" gin_trgm_ops);
CREATE INDEX "Contract_list_order_idx" ON "Contract" ("deletedAt", "startDate" DESC, "createdAt" DESC);
