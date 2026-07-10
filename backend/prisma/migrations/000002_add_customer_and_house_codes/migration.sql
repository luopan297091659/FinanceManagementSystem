ALTER TABLE "Room" ADD COLUMN IF NOT EXISTS "houseNumber" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "customerCode" TEXT;
ALTER TABLE "Owner" ADD COLUMN IF NOT EXISTS "customerCode" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Room_houseNumber_key"
  ON "Room"("houseNumber")
  WHERE "houseNumber" IS NOT NULL AND "houseNumber" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_customerCode_key"
  ON "Tenant"("customerCode")
  WHERE "customerCode" IS NOT NULL AND "customerCode" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "Owner_customerCode_key"
  ON "Owner"("customerCode")
  WHERE "customerCode" IS NOT NULL AND "customerCode" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_phone_key"
  ON "Tenant"("phone")
  WHERE "phone" IS NOT NULL AND "phone" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "Owner_phone_key"
  ON "Owner"("phone")
  WHERE "phone" IS NOT NULL AND "phone" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_email_key"
  ON "Tenant"("email")
  WHERE "email" IS NOT NULL AND "email" <> '';

CREATE UNIQUE INDEX IF NOT EXISTS "Owner_email_key"
  ON "Owner"("email")
  WHERE "email" IS NOT NULL AND "email" <> '';
