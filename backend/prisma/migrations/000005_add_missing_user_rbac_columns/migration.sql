-- The RBAC schema expects these fields on the existing User table.
-- Add them in a backfill-friendly way so production databases with rows can migrate.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'operator';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultDataScope" "DataScopeType" DEFAULT 'SELF';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultDataScopeValue" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

WITH numbered_users AS (
  SELECT
    "id",
    COALESCE(NULLIF(split_part(COALESCE("email", ''), '@', 1), ''), 'user') || '_' ||
      row_number() OVER (ORDER BY "createdAt", "id") AS generated_username
  FROM "User"
  WHERE "username" IS NULL OR "username" = ''
)
UPDATE "User"
SET "username" = numbered_users.generated_username
FROM numbered_users
WHERE "User"."id" = numbered_users."id";

-- SHA-256 for the temporary password: admin123
UPDATE "User"
SET "passwordHash" = '240be518fabd2724d2f79524080cb2c5d563550a03d4f62d4898e71b0a39fef7'
WHERE "passwordHash" IS NULL OR "passwordHash" = '';

UPDATE "User"
SET "name" = "username"
WHERE "name" IS NULL OR "name" = '';

UPDATE "User"
SET "role" = 'operator'
WHERE "role" IS NULL OR "role" = '';

UPDATE "User"
SET "defaultDataScope" = 'SELF'
WHERE "defaultDataScope" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "defaultDataScope" SET DEFAULT 'SELF';

CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_companyId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "ManagementCompany"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
