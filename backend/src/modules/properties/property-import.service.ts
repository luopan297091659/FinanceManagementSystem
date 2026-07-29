import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';

export const PROPERTY_IMPORT_HEADERS = {
  propertyName: ['【物件情報】物件名', 'Property Name', '物件名', '物业名称'],
  roomNumber: ['【基本情報】部屋番号', 'Room Number', '部屋番号', '房间号'],
  postalCode: ['【物件情報】郵便番号', 'Postal Code', '郵便番号', '邮编'],
  address: ['【物件情報】住所', 'Address', '住所', '地址'],
} as const;

const IMPORT_ACTIONS = new Set([
  'CREATE_PROPERTY_AND_ROOM',
  'CREATE_ROOM',
  'UPDATE_PROPERTY',
  'UPDATE_ROOM',
  'SKIP',
  'CONFLICT',
  'ERROR',
]);

type SourceRow = Record<string, unknown>;
type UploadBody = {
  originalName?: string;
  fileHash?: string;
  rows?: SourceRow[];
  mapping?: Partial<Record<keyof typeof PROPERTY_IMPORT_HEADERS, string>>;
};

type EditableRow = Partial<{
  propertyName: string;
  roomNumber: string;
  postalCode: string;
  address: string;
  detectedUnitType: string;
  propertyId: string | null;
  roomId: string | null;
  action: string;
  remark: string;
}>;

type MatchResult = {
  action: string;
  status: string;
  propertyId?: string | null;
  roomId?: string | null;
  conflictReason?: string | null;
  errorMessage?: string | null;
};

@Injectable()
export class PropertyImportService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(body: UploadBody, actorUserId?: string) {
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (!rows.length) throw new BadRequestException('import.error.emptyFile');
    if (rows.length > 20_000) throw new BadRequestException('import.error.tooManyRows');

    const originalName = normalizeText(body.originalName) || 'property-import.xlsx';
    const fileHash = /^[a-f\d]{64}$/i.test(body.fileHash ?? '')
      ? String(body.fileHash).toLowerCase()
      : hashJson(rows);
    const duplicate = await this.prisma.propertyImportBatch.findUnique({ where: { fileHash } });
    if (duplicate) {
      throw new ConflictException({ message: 'import.error.duplicateFile', batchId: duplicate.id });
    }

    const mapping = this.resolveMapping(rows[0] ?? {}, body.mapping);
    const existingProperties = await this.prisma.property.findMany({
      where: { deletedAt: null },
      include: { rooms: { where: { deletedAt: null } } },
    });
    const seenRows = new Set<string>();
    const previewRows = rows.map((source, index) => {
      const normalized = this.normalizeSourceRow(source, mapping);
      const duplicateKey = [normalized.normalizedPropertyName, normalized.normalizedAddress, normalized.normalizedRoomNumber].join('|');
      const match = seenRows.has(duplicateKey)
        ? { action: 'ERROR', status: 'ERROR', errorMessage: 'import.error.duplicateRow' }
        : this.matchNormalizedRow(normalized, existingProperties);
      seenRows.add(duplicateKey);
      return {
        sourceRow: index + 2,
        sourceDataJson: source as Prisma.InputJsonObject,
        ...normalized,
        ...match,
      };
    });

    const batchNo = `PI-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${fileHash.slice(0, 6).toUpperCase()}`;
    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.propertyImportBatch.create({
        data: {
          batchNo,
          originalName,
          fileHash,
          totalRows: previewRows.length,
          status: 'PREVIEW_READY',
          mappingJson: mapping,
          createdBy: actorUserId,
        },
      });
      await tx.propertyImportRow.createMany({
        data: previewRows.map((row) => ({ ...row, batchId: created.id })),
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'property.import.upload',
          entityType: 'PropertyImportBatch',
          entityId: created.id,
          after: { batchNo, originalName, fileHash, totalRows: previewRows.length },
        },
      });
      return created;
    });
    await this.refreshBatchStats(batch.id);
    return this.getBatch(batch.id, { page: 1, pageSize: 50 });
  }

  async listBatches() {
    return this.prisma.propertyImportBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async getBatch(batchId: string, query: Record<string, unknown> = {}) {
    const batch = await this.prisma.propertyImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('import.error.batchNotFound');
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 50), 500);
    const where = this.rowWhere(batchId, query);
    const [rows, total] = await Promise.all([
      this.prisma.propertyImportRow.findMany({
        where,
        include: {
          property: { select: { id: true, propertyCode: true, name: true, address: true } },
          room: { select: { id: true, roomCode: true, roomNumber: true, unitType: true } },
        },
        orderBy: { sourceRow: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.propertyImportRow.count({ where }),
    ]);
    return { batch, rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async updateRow(batchId: string, rowId: string, dto: EditableRow, actorUserId?: string) {
    const before = await this.prisma.propertyImportRow.findFirst({ where: { id: rowId, batchId } });
    if (!before) throw new NotFoundException('import.error.rowNotFound');
    if (before.status === 'COMMITTED') throw new ConflictException('import.error.rowAlreadyCommitted');

    const normalized = {
      propertyName: dto.propertyName !== undefined ? normalizeText(dto.propertyName) : before.propertyName,
      normalizedPropertyName: dto.propertyName !== undefined ? normalizeMatchText(dto.propertyName) : before.normalizedPropertyName,
      roomNumber: dto.roomNumber !== undefined ? normalizeText(dto.roomNumber) || null : before.roomNumber,
      normalizedRoomNumber: dto.roomNumber !== undefined ? normalizeMatchText(dto.roomNumber) || null : before.normalizedRoomNumber,
      postalCode: dto.postalCode !== undefined ? normalizePostalCode(dto.postalCode) || null : before.postalCode,
      address: dto.address !== undefined ? normalizeText(dto.address) || null : before.address,
      normalizedAddress: dto.address !== undefined ? normalizeAddress(dto.address) || null : before.normalizedAddress,
      detectedUnitType: dto.detectedUnitType !== undefined ? validateUnitType(dto.detectedUnitType) : before.detectedUnitType,
    };
    const existingProperties = await this.prisma.property.findMany({
      where: { deletedAt: null },
      include: { rooms: { where: { deletedAt: null } } },
    });
    let match = this.matchNormalizedRow(normalized, existingProperties);
    if (dto.action !== undefined) {
      if (!IMPORT_ACTIONS.has(dto.action)) throw new BadRequestException('import.error.invalidAction');
      match = {
        ...match,
        action: dto.action,
        status: dto.action === 'SKIP' ? 'SKIPPED' : dto.action === 'CONFLICT' ? 'CONFLICT' : dto.action === 'ERROR' ? 'ERROR' : 'READY',
      };
    }
    const updated = await this.prisma.propertyImportRow.update({
      where: { id: rowId },
      data: {
        ...normalized,
        ...match,
        conflictReason: match.conflictReason ?? null,
        errorMessage: match.errorMessage ?? null,
        propertyId: dto.propertyId !== undefined ? dto.propertyId : (match.propertyId ?? null),
        roomId: dto.roomId !== undefined ? dto.roomId : (match.roomId ?? null),
        remark: dto.remark !== undefined ? dto.remark : before.remark,
      },
    });
    if (updated.status === 'READY') {
      await this.prisma.propertyImportBatch.update({
        where: { id: batchId },
        data: { status: 'PREVIEW_READY', completedAt: null },
      });
    }
    await this.prisma.auditLog.create({
      data: { actorUserId, action: 'property.import.row.update', entityType: 'PropertyImportRow', entityId: rowId, before: toJson(before), after: toJson(updated) },
    });
    await this.refreshBatchStats(batchId);
    return updated;
  }

  async commit(batchId: string, actorUserId?: string) {
    const batch = await this.prisma.propertyImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('import.error.batchNotFound');
    const readyRows = await this.prisma.propertyImportRow.count({ where: { batchId, status: 'READY' } });
    if (!readyRows) throw new ConflictException('import.error.noReadyRows');

    await this.prisma.propertyImportBatch.update({ where: { id: batchId }, data: { status: 'COMMITTING' } });
    const rows = await this.prisma.propertyImportRow.findMany({
      where: { batchId, status: 'READY', action: { in: ['CREATE_PROPERTY_AND_ROOM', 'CREATE_ROOM', 'UPDATE_PROPERTY', 'UPDATE_ROOM'] } },
      orderBy: { sourceRow: 'asc' },
    });
    for (const row of rows) {
      try {
        await this.commitRow(row, actorUserId);
      } catch (error) {
        await this.prisma.propertyImportRow.update({
          where: { id: row.id },
          data: { status: 'FAILED', errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'import.error.commitFailed' },
        });
      }
    }
    const stats = await this.refreshBatchStats(batchId, true);
    await this.prisma.auditLog.create({
      data: { actorUserId, action: 'property.import.commit', entityType: 'PropertyImportBatch', entityId: batchId, after: toJson(stats) },
    });
    return this.getBatch(batchId, { page: 1, pageSize: 50 });
  }

  async getErrors(batchId: string) {
    const batch = await this.prisma.propertyImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('import.error.batchNotFound');
    return this.prisma.propertyImportRow.findMany({
      where: { batchId, status: { in: ['ERROR', 'CONFLICT', 'FAILED'] } },
      orderBy: { sourceRow: 'asc' },
    });
  }

  private async commitRow(row: any, actorUserId?: string) {
    await this.prisma.$transaction(async (tx) => {
      let property = row.propertyId
        ? await tx.property.findFirst({ where: { id: row.propertyId, deletedAt: null } })
        : await tx.property.findFirst({
            where: { normalizedName: row.normalizedPropertyName, normalizedAddress: row.normalizedAddress, deletedAt: null },
          });

      if (row.action === 'CREATE_PROPERTY_AND_ROOM' && !property) {
        const conflicting = await tx.property.findFirst({ where: { normalizedName: row.normalizedPropertyName, deletedAt: null } });
        if (conflicting) throw new Error('import.error.propertyConflictAfterPreview');
        const propertyCode = this.businessCode('PROP', `${row.normalizedPropertyName}|${row.normalizedAddress}|${row.id}`);
        property = await tx.property.create({
          data: {
            propertyCode,
            name: row.propertyName,
            normalizedName: row.normalizedPropertyName,
            postalCode: row.postalCode,
            address: row.address,
            normalizedAddress: row.normalizedAddress,
            sourceDataJson: row.sourceDataJson,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
      }
      if (!property) throw new Error('import.error.matchedPropertyRequired');

      if (row.action === 'UPDATE_PROPERTY') {
        property = await tx.property.update({
          where: { id: property.id },
          data: {
            ...(row.postalCode ? { postalCode: row.postalCode } : {}),
            ...(row.address ? { address: row.address, normalizedAddress: row.normalizedAddress } : {}),
            updatedBy: actorUserId,
          },
        });
      }

      if (!row.normalizedRoomNumber || !row.roomNumber) throw new Error('import.error.roomNumberRequired');
      let room = row.roomId
        ? await tx.room.findFirst({ where: { id: row.roomId, deletedAt: null } })
        : await tx.room.findFirst({ where: { propertyId: property.id, normalizedRoomNumber: row.normalizedRoomNumber, deletedAt: null } });

      if (!room && ['CREATE_PROPERTY_AND_ROOM', 'CREATE_ROOM'].includes(row.action)) {
        room = await tx.room.create({
          data: {
            propertyId: property.id,
            roomCode: this.businessCode('ROOM', `${property.propertyCode ?? property.id}|${row.normalizedRoomNumber}|${row.id}`),
            roomNumber: row.roomNumber,
            normalizedRoomNumber: row.normalizedRoomNumber,
            displayName: row.roomNumber,
            unitType: row.detectedUnitType,
            sourceDataJson: row.sourceDataJson,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
      } else if (room && row.action === 'UPDATE_ROOM') {
        room = await tx.room.update({
          where: { id: room.id },
          data: { unitType: row.detectedUnitType, updatedBy: actorUserId },
        });
      } else if (room && ['CREATE_PROPERTY_AND_ROOM', 'CREATE_ROOM'].includes(row.action)) {
        throw new Error('import.error.roomConflictAfterPreview');
      }
      if (!room) throw new Error('import.error.roomNotFound');

      await tx.propertyImportRow.update({
        where: { id: row.id },
        data: { propertyId: property.id, roomId: room.id, status: 'COMMITTED', errorMessage: null, conflictReason: null },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'property.import.row.commit',
          entityType: 'PropertyImportRow',
          entityId: row.id,
          after: { batchId: row.batchId, sourceRow: row.sourceRow, propertyId: property.id, roomId: room.id, action: row.action },
        },
      });
    });
  }

  private normalizeSourceRow(source: SourceRow, mapping: Record<keyof typeof PROPERTY_IMPORT_HEADERS, string>) {
    const propertyName = normalizeText(source[mapping.propertyName]);
    const roomNumber = normalizeText(source[mapping.roomNumber]) || null;
    const address = normalizeText(source[mapping.address]) || null;
    return {
      propertyName,
      normalizedPropertyName: normalizeMatchText(propertyName),
      roomNumber,
      normalizedRoomNumber: normalizeMatchText(roomNumber) || null,
      postalCode: normalizePostalCode(source[mapping.postalCode]) || null,
      address,
      normalizedAddress: normalizeAddress(address) || null,
      detectedUnitType: detectUnitType(roomNumber),
    };
  }

  private matchNormalizedRow(row: any, properties: any[]): MatchResult {
    if (!row.normalizedPropertyName) return { action: 'ERROR', status: 'ERROR', errorMessage: 'import.error.propertyNameRequired' };
    if (!row.normalizedRoomNumber) return { action: 'ERROR', status: 'ERROR', errorMessage: 'import.error.roomNumberRequired' };
    const sameName = properties.filter((property) => this.propertyNormalizedName(property) === row.normalizedPropertyName);
    const sameAddress = row.normalizedAddress
      ? properties.filter((property) => this.propertyNormalizedAddress(property) === row.normalizedAddress)
      : [];
    const exact = sameName.find((property) => this.propertyNormalizedAddress(property) === row.normalizedAddress);
    if (exact) {
      const room = exact.rooms.find((item: any) => (item.normalizedRoomNumber || normalizeMatchText(item.roomNumber)) === row.normalizedRoomNumber);
      return room
        ? { action: 'SKIP', status: 'SKIPPED', propertyId: exact.id, roomId: room.id }
        : { action: 'CREATE_ROOM', status: 'READY', propertyId: exact.id };
    }
    if (sameName.length) {
      return { action: 'CONFLICT', status: 'CONFLICT', propertyId: sameName[0].id, conflictReason: 'import.error.sameNameDifferentAddress' };
    }
    if (sameAddress.length) {
      return { action: 'CREATE_PROPERTY_AND_ROOM', status: 'READY' };
    }
    return { action: 'CREATE_PROPERTY_AND_ROOM', status: 'READY' };
  }

  private propertyNormalizedName(property: any) {
    return property.normalizedName || normalizeMatchText(property.name);
  }

  private propertyNormalizedAddress(property: any) {
    return property.normalizedAddress || normalizeAddress(property.address);
  }

  private resolveMapping(source: SourceRow, override: UploadBody['mapping']) {
    const headers = Object.keys(source);
    const mapping = {} as Record<keyof typeof PROPERTY_IMPORT_HEADERS, string>;
    for (const key of Object.keys(PROPERTY_IMPORT_HEADERS) as Array<keyof typeof PROPERTY_IMPORT_HEADERS>) {
      const explicit = override?.[key];
      const detected = headers.find((header) => PROPERTY_IMPORT_HEADERS[key].includes(header as never));
      const resolved = explicit && headers.includes(explicit) ? explicit : detected;
      if (!resolved) throw new BadRequestException({ message: 'import.error.missingHeader', field: key, acceptedHeaders: PROPERTY_IMPORT_HEADERS[key] });
      mapping[key] = resolved;
    }
    return mapping;
  }

  private rowWhere(batchId: string, query: Record<string, unknown>): Prisma.PropertyImportRowWhereInput {
    const search = normalizeText(query.search);
    return {
      batchId,
      ...(query.status ? { status: String(query.status) } : {}),
      ...(query.action ? { action: String(query.action) } : {}),
      ...(search
        ? { OR: [{ propertyName: { contains: search, mode: 'insensitive' } }, { roomNumber: { contains: search, mode: 'insensitive' } }, { address: { contains: search, mode: 'insensitive' } }] }
        : {}),
    };
  }

  private async refreshBatchStats(batchId: string, complete = false) {
    const grouped = await this.prisma.propertyImportRow.groupBy({ by: ['status'], where: { batchId }, _count: { _all: true } });
    const count = Object.fromEntries(grouped.map((item) => [item.status, item._count._all]));
    const failedRows = (count.ERROR ?? 0) + (count.FAILED ?? 0);
    const conflictRows = count.CONFLICT ?? 0;
    const data = {
      successRows: count.COMMITTED ?? 0,
      skippedRows: count.SKIPPED ?? 0,
      failedRows,
      conflictRows,
      ...(complete
        ? { status: failedRows || conflictRows ? 'PARTIAL_COMPLETED' : 'COMPLETED', completedAt: new Date() }
        : {}),
    };
    await this.prisma.propertyImportBatch.update({ where: { id: batchId }, data });
    return data;
  }

  private businessCode(prefix: string, seed: string) {
    return `${prefix}-${createHash('sha256').update(seed).digest('hex').slice(0, 16).toUpperCase()}`;
  }
}

export function normalizeText(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/[\s\u3000]+/g, ' ').trim();
}

export function normalizeMatchText(value: unknown) {
  return normalizeText(value).replace(/\s+/g, '').toLocaleLowerCase('ja-JP');
}

export function normalizeAddress(value: unknown) {
  return normalizeMatchText(value).replace(/[‐‑‒–—―ー−]/g, '-');
}

export function normalizePostalCode(value: unknown) {
  const normalized = normalizeText(value).replace(/^〒/, '').replace(/\s/g, '');
  const digits = normalized.replace(/[^\d]/g, '');
  return digits.length === 7 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : normalized;
}

export function detectUnitType(roomNumber: unknown) {
  const value = normalizeText(roomNumber);
  if (/^(P\d+)|駐車/i.test(value)) return 'PARKING';
  if (value.includes('看板')) return 'SIGNBOARD';
  if (/基地局|KDDI|楽天/.test(value)) return 'BASE_STATION';
  if (/自販機|自動販売機/.test(value)) return 'VENDING';
  if (/一戸建て|戸建て/.test(value)) return 'HOUSE';
  if (value.includes('民泊')) return 'MINPAKU';
  if (/^\d+(?:[～~-]\d+)?F$/i.test(value) || value.includes('階')) return 'SHOP';
  return 'ROOM';
}

function validateUnitType(value: unknown) {
  const unitType = normalizeText(value).toUpperCase();
  const allowed = new Set(['ROOM', 'HOUSE', 'SHOP', 'OFFICE', 'PARKING', 'SIGNBOARD', 'BASE_STATION', 'VENDING', 'MINPAKU', 'OTHER']);
  if (!allowed.has(unitType)) throw new BadRequestException('import.error.invalidUnitType');
  return unitType;
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
