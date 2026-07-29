-- Detached houses do not always have a room number.
ALTER TABLE "Room"
  ALTER COLUMN "roomNumber" DROP NOT NULL;
