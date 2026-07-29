# Property inventory and Excel import

## Existing model analysis and compatibility

The implementation reuses the existing `Property`, `Room`, `Owner`, `RoomOwner`, `Contract`, `Document`, and `AuditLog` models. The migration is additive: it does not delete tables, rename legacy columns, or rewrite existing rows.

- `Property` keeps the existing project/company/GIS fields and gains an optional unique `propertyCode`, normalized matching fields, postal/address metadata, management fields, import source JSON, and soft deletion.
- `Room` keeps `houseNumber`, integer `floor`, `RoomStatus`, legacy contract fields, and all existing relations. It gains an optional unique `roomCode`, a string `floorLabel`, normalized room number, unit type, source JSON, and soft deletion.
- `Owner` and `RoomOwner` are extended. `PropertyOwnership` is added because the old schema only supported room-level ownership.
- `Contract` is intentionally unchanged by this import. The source workbook contains no contract data, so no contracts are synthesized and `currentContractId` remains nullable.
- Codes are nullable for legacy rows so the migration can deploy without inventing or colliding with existing business identifiers. Every row created by the new importer receives a deterministic non-null code.

## Source field mapping

| Excel header | Database field |
| --- | --- |
| `【物件情報】物件名` | `Property.name` |
| `【基本情報】部屋番号` | `Room.roomNumber` |
| `【物件情報】郵便番号` | `Property.postalCode` |
| `【物件情報】住所` | `Property.address` |

The importer also accepts the documented English, Japanese short-name, and Chinese aliases. The source object is retained in `sourceDataJson` on the import row and on newly created property/room records.

## Matching and data safety

1. Text is normalized with Unicode NFKC, full-width spaces are collapsed, postal marks are removed, and seven-digit postal codes are formatted as `NNN-NNNN`.
2. Properties primarily match on normalized name plus normalized address.
3. Same name/different address and same address/different name remain conflicts for manual review.
4. Rooms match on property ID plus normalized room number. Room numbers are always strings and combined values are never split.
5. Empty property or room numbers are errors. Duplicate normalized source rows are errors.
6. Existing records are reused without overwriting owner, contract, or manually maintained values. Update actions only write explicitly supplied non-empty import fields.
7. The SHA-256 file hash is unique per batch and blocks repeat uploads.
8. Each ready row commits in its own database transaction. A failed room creation rolls back the property created for that row while other valid rows continue.

## API

- `POST /api/v1/properties/import/upload`
- `POST /api/v1/properties/import/:batchId/preview`
- `PATCH /api/v1/properties/import/:batchId/rows/:rowId`
- `POST /api/v1/properties/import/:batchId/commit`
- `GET /api/v1/properties/import/batches`
- `GET /api/v1/properties/import/batches/:batchId`
- `GET /api/v1/properties/import/:batchId/errors`
- `GET /api/v1/properties`
- `GET /api/v1/properties/:propertyId`
- `PATCH /api/v1/properties/:propertyId`

## Permissions

The migration reuses the current RBAC seed flow and adds:

`property.view`, `property.create`, `property.edit`, `property.import`, `property.import.commit`, `property.owner.view`, `property.owner.edit`, `room.view`, `room.create`, `room.edit`, `contract.view`, `contract.create`, `contract.edit`, `owner.financial.view`, and `owner.financial.edit`.

## Run and verify

```powershell
npm.cmd --prefix backend run prisma:generate
npm.cmd --prefix backend run prisma:deploy
npm.cmd --prefix backend run build
npm.cmd run build
```

After deployment, sign in with a role containing `property.import`, open Property Management, select **Import Property Data**, choose the workbook, review/edit suggested types and actions, filter conflicts/errors, and select **Commit non-conflicting rows**. Use **Import History** to reopen a batch and **Export errors** to download unresolved rows.

## Known limitations

- The first delivery implements property/room import and property detail APIs. Dedicated ownership and contract editing screens/APIs remain separate follow-up work; existing customer bindings and contract data are preserved.
- Legacy rows are not automatically backfilled with property/room codes or normalized fields. They are still considered during preview through runtime normalization; a controlled backfill can be added after duplicate review.
- The client parses Excel and submits JSON, so very large files are capped at 20,000 rows. The supplied 177-row workbook is well within the limit.
