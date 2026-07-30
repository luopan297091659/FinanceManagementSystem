-- User email is optional. Older databases may still carry the NOT NULL
-- constraint from the original User table definition.
ALTER TABLE "User"
  ALTER COLUMN "email" DROP NOT NULL;
