import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OwnerType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type ImportRow = Record<string, unknown>;

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown> = {}) {
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 20), 200);
    const search = text(query.search);
    const where: Prisma.OwnerWhereInput = {
      deletedAt: null,
      ...(search ? { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { nameKana: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { rooms: { some: { deletedAt: null, status: 'ACTIVE', room: { deletedAt: null, OR: [
          { roomNumber: { contains: search, mode: 'insensitive' } },
          { property: { name: { contains: search, mode: 'insensitive' } } },
        ] } } } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.owner.findMany({
        where,
        include: { _count: { select: { rooms: { where: { deletedAt: null, status: 'ACTIVE' } } } } },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.owner.count({ where }),
    ]);
    return {
      items: items.map((owner) => ({ ...owner, roomCount: owner._count.rooms })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async get(id: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id, deletedAt: null },
      include: {
        rooms: {
          where: { deletedAt: null, status: 'ACTIVE' },
          include: { room: { include: { property: { include: { project: true } } } } },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!owner) throw new NotFoundException('owner.error.notFound');
    return {
      ...owner,
      rooms: owner.rooms.map((link) => ({
        linkId: link.id,
        roomId: link.roomId,
        isPrimary: link.isPrimary,
        propertyId: link.room.propertyId,
        projectName: link.room.property.project?.name ?? '',
        propertyName: link.room.property.name,
        roomNumber: link.room.roomNumber ?? link.room.displayName ?? '',
        roomCode: link.room.roomCode ?? '',
        label: [link.room.property.project?.name, link.room.property.name, link.room.roomNumber || link.room.displayName].filter(Boolean).join(' / '),
      })),
    };
  }

  async create(body: Record<string, unknown>, actorUserId?: string) {
    const name = requiredText(body.name, 'owner.error.nameRequired');
    await this.assertUniqueName(name);
    await this.assertUniqueContact(text(body.phone), text(body.email));
    return this.prisma.owner.create({ data: this.ownerData(body, name, actorUserId, true) as Prisma.OwnerCreateInput });
  }

  async update(id: string, body: Record<string, unknown>, actorUserId?: string) {
    const current = await this.get(id);
    const name = body.name === undefined ? current.name : requiredText(body.name, 'owner.error.nameRequired');
    await this.assertUniqueName(name, id);
    const phone = body.phone === undefined ? current.phone : text(body.phone);
    const email = body.email === undefined ? current.email : text(body.email);
    await this.assertUniqueContact(phone ?? '', email ?? '', id);
    const data = this.ownerData(body, name, actorUserId, false);
    return this.prisma.owner.update({ where: { id }, data });
  }

  async attachRooms(ownerId: string, body: Record<string, unknown>, actorUserId?: string) {
    await this.get(ownerId);
    const roomIds = Array.isArray(body.roomIds) ? [...new Set(body.roomIds.map(String).filter(Boolean))] : [];
    if (!roomIds.length) throw new BadRequestException('owner.error.roomRequired');
    const rooms = await this.prisma.room.findMany({ where: { id: { in: roomIds }, deletedAt: null, property: { deletedAt: null } }, select: { id: true } });
    if (rooms.length !== roomIds.length) throw new BadRequestException('owner.error.roomNotFound');
    let attached = 0;
    for (const room of rooms) {
      const existing = await this.prisma.roomOwner.findFirst({ where: { ownerId, roomId: room.id }, orderBy: { createdAt: 'desc' } });
      if (existing?.deletedAt === null && existing.status === 'ACTIVE') continue;
      if (existing) {
        await this.prisma.roomOwner.update({ where: { id: existing.id }, data: { deletedAt: null, status: 'ACTIVE', endDate: null, startDate: existing.startDate ?? new Date() } });
      } else {
        await this.prisma.roomOwner.create({ data: { ownerId, roomId: room.id, status: 'ACTIVE', startDate: new Date() } });
      }
      attached += 1;
    }
    await this.audit(actorUserId, 'owner.rooms.attach', ownerId, { roomIds, attached });
    return this.get(ownerId);
  }

  async detachRoom(ownerId: string, roomId: string, actorUserId?: string) {
    await this.get(ownerId);
    const links = await this.prisma.roomOwner.findMany({ where: { ownerId, roomId, deletedAt: null, status: 'ACTIVE' }, select: { id: true } });
    if (!links.length) throw new NotFoundException('owner.error.roomLinkNotFound');
    const endedAt = new Date();
    await this.prisma.roomOwner.updateMany({ where: { id: { in: links.map((link) => link.id) } }, data: { status: 'ENDED', endDate: endedAt, deletedAt: endedAt } });
    await this.audit(actorUserId, 'owner.rooms.detach', ownerId, { roomId });
    return this.get(ownerId);
  }

  async importRows(body: Record<string, unknown>, actorUserId?: string) {
    const rows = Array.isArray(body.rows) ? body.rows.filter((row): row is ImportRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [];
    if (!rows.length) throw new BadRequestException('owner.import.empty');
    const [owners, properties] = await Promise.all([
      this.prisma.owner.findMany({ where: { deletedAt: null } }),
      this.prisma.property.findMany({
        where: { deletedAt: null },
        include: { rooms: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      }),
    ]);
    const ownerMap = new Map(owners.map((owner) => [normalize(owner.name), owner]));
    const propertyMap = groupBy(properties, (property) => normalize(property.name));
    const result = {
      originalName: text(body.originalName), totalRows: rows.length, createdOwners: 0, reusedOwners: 0,
      linkedRooms: 0, skippedLinks: 0, unmatchedRows: [] as Record<string, unknown>[], warnings: [] as Record<string, unknown>[],
    };
    const reused = new Set<string>();

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const propertyName = field(row, PROPERTY_HEADERS);
      const roomNumber = field(row, ROOM_HEADERS);
      const ownerName = field(row, OWNER_HEADERS);
      const sourceRow = index + 2;
      if (!propertyName || !ownerName) {
        result.unmatchedRows.push({ sourceRow, propertyName, roomNumber, ownerName, reason: !ownerName ? 'owner.import.ownerNameRequired' : 'owner.import.propertyNameRequired' });
        continue;
      }
      const matchedProperties = propertyMap.get(normalize(propertyName)) ?? [];
      if (matchedProperties.length !== 1) {
        result.unmatchedRows.push({ sourceRow, propertyName, roomNumber, ownerName, reason: matchedProperties.length ? 'owner.import.propertyAmbiguous' : 'owner.import.propertyNotFound' });
        continue;
      }
      const property = matchedProperties[0];
      const roomMatches = roomNumber
        ? property.rooms.filter((room) => normalize(room.roomNumber || room.displayName || '') === normalize(roomNumber))
        : matchRoomWithoutNumber(property.rooms);
      if (roomMatches.length !== 1) {
        result.unmatchedRows.push({ sourceRow, propertyName, roomNumber, ownerName, reason: roomMatches.length ? 'owner.import.roomAmbiguous' : 'owner.import.roomNotFound' });
        continue;
      }

      const ownerKey = normalize(ownerName);
      let owner = ownerMap.get(ownerKey);
      const ownerKana = field(row, OWNER_KANA_HEADERS);
      const phone = field(row, OWNER_PHONE_HEADERS);
      const email = field(row, OWNER_EMAIL_HEADERS).toLowerCase();
      if (!owner) {
        const conflicts = await this.contactConflicts(phone, email);
        owner = await this.prisma.owner.create({
          data: {
            name: ownerName, nameKana: ownerKana || null, phone: conflicts.phone ? null : phone || null,
            email: conflicts.email ? null : email || null, ownerType: inferOwnerType(ownerName), ownerStatus: 'ACTIVE', createdBy: actorUserId, updatedBy: actorUserId,
          },
        });
        if (conflicts.phone || conflicts.email) result.warnings.push({ sourceRow, ownerName, reason: 'owner.import.contactConflict' });
        ownerMap.set(ownerKey, owner);
        result.createdOwners += 1;
      } else {
        if (!reused.has(owner.id)) { result.reusedOwners += 1; reused.add(owner.id); }
        const changes: Prisma.OwnerUpdateInput = {};
        if (!owner.nameKana && ownerKana) changes.nameKana = ownerKana;
        if (!owner.phone && phone && !(await this.contactConflicts(phone, '', owner.id)).phone) changes.phone = phone;
        if (!owner.email && email && !(await this.contactConflicts('', email, owner.id)).email) changes.email = email;
        if (Object.keys(changes).length) {
          owner = await this.prisma.owner.update({ where: { id: owner.id }, data: { ...changes, updatedBy: actorUserId } });
          ownerMap.set(ownerKey, owner);
        }
      }
      const roomId = roomMatches[0].id;
      const existing = await this.prisma.roomOwner.findFirst({ where: { ownerId: owner.id, roomId }, orderBy: { createdAt: 'desc' } });
      if (existing?.deletedAt === null && existing.status === 'ACTIVE') {
        result.skippedLinks += 1;
      } else if (existing) {
        await this.prisma.roomOwner.update({ where: { id: existing.id }, data: { deletedAt: null, status: 'ACTIVE', endDate: null, startDate: existing.startDate ?? new Date() } });
        result.linkedRooms += 1;
      } else {
        await this.prisma.roomOwner.create({ data: { ownerId: owner.id, roomId, status: 'ACTIVE', startDate: new Date() } });
        result.linkedRooms += 1;
      }
    }
    await this.audit(actorUserId, 'owner.import', undefined, result);
    return result;
  }

  private ownerData(body: Record<string, unknown>, name: string, actorUserId: string | undefined, create: boolean): Prisma.OwnerCreateInput | Prisma.OwnerUpdateInput {
    const data: Record<string, unknown> = { name, updatedBy: actorUserId };
    if (create) data.createdBy = actorUserId;
    for (const key of ['nameKana', 'representativeName', 'companyName', 'postalCode', 'address', 'companyPhone', 'phone', 'email', 'address1', 'address2', 'address3', 'remark', 'note']) {
      if (body[key] !== undefined) data[key] = text(body[key]) || null;
    }
    if (body.email !== undefined) data.email = text(body.email).toLowerCase() || null;
    if (body.ownerStatus !== undefined) data.ownerStatus = text(body.ownerStatus) || 'ACTIVE';
    data.ownerType = body.ownerType === 'COMPANY' ? OwnerType.COMPANY : body.ownerType === 'PERSON' ? OwnerType.PERSON : inferOwnerType(name);
    return data as Prisma.OwnerCreateInput | Prisma.OwnerUpdateInput;
  }

  private async assertUniqueName(name: string, excludeId?: string) {
    const candidates = await this.prisma.owner.findMany({ where: { deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { name: true } });
    if (candidates.some((owner) => normalize(owner.name) === normalize(name))) throw new BadRequestException('owner.error.duplicateName');
  }

  private async assertUniqueContact(phone: string, email: string, excludeId?: string) {
    const conflicts = await this.contactConflicts(phone, email, excludeId);
    if (conflicts.phone) throw new BadRequestException('owner.error.duplicatePhone');
    if (conflicts.email) throw new BadRequestException('owner.error.duplicateEmail');
  }

  private async contactConflicts(phone: string, email: string, excludeId?: string) {
    if (!phone && !email) return { phone: false, email: false };
    const matches = await this.prisma.owner.findMany({ where: { deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}), OR: [
      ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : []),
    ] }, select: { phone: true, email: true } });
    return { phone: Boolean(phone && matches.some((item) => item.phone === phone)), email: Boolean(email && matches.some((item) => item.email === email)) };
  }

  private audit(actorUserId: string | undefined, action: string, entityId?: string, after?: unknown) {
    return this.prisma.auditLog.create({ data: { actorUserId, action, entityType: 'Owner', entityId, after: after as Prisma.InputJsonValue } });
  }
}

const PROPERTY_HEADERS = ['【契約物件】物件', '【契約物件】物件名', '物件', '物件名', '建物名'];
const ROOM_HEADERS = ['【基本情報】部屋番号', '部屋番号', '部屋', '号室'];
const OWNER_HEADERS = ['【家主】家主名', '家主名', '家主姓名', '所有者名'];
const OWNER_KANA_HEADERS = ['【家主】家主名カナ', '家主名カナ', '家主カナ'];
const OWNER_PHONE_HEADERS = ['【家主】家主电话', '【家主】家主電話', '家主电话', '家主電話', '電話'];
const OWNER_EMAIL_HEADERS = ['【家主】家主邮箱', '【家主】家主メール', '家主邮箱', '家主メール', 'メール'];

function field(row: ImportRow, aliases: string[]) {
  for (const alias of aliases) {
    const exact = Object.keys(row).find((key) => normalize(key) === normalize(alias));
    if (exact) return text(row[exact]);
  }
  return '';
}

function normalize(value: unknown) {
  return text(value).normalize('NFKC').replace(/[\s　]+/g, '').toLocaleLowerCase();
}

function text(value: unknown) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function requiredText(value: unknown, message: string) {
  const valueText = text(value);
  if (!valueText) throw new BadRequestException(message);
  return valueText;
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function inferOwnerType(name: string) {
  return /(株式会社|有限会社|合同会社|合資会社|会社|法人|㈱|（株）|\(株\))/u.test(name) ? OwnerType.COMPANY : OwnerType.PERSON;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const result = new Map<string, T[]>();
  for (const item of items) result.set(key(item), [...(result.get(key(item)) ?? []), item]);
  return result;
}

function matchRoomWithoutNumber<T extends { roomNumber: string | null; unitType: string }>(rooms: T[]) {
  const emptyNumberRooms = rooms.filter((room) => !normalize(room.roomNumber));
  if (emptyNumberRooms.length === 1) return emptyNumberRooms;
  const wholePropertyRooms = rooms.filter((room) => ['HOUSE', 'MINPAKU'].includes(room.unitType));
  if (wholePropertyRooms.length === 1) return wholePropertyRooms;
  return rooms.length === 1 ? rooms : [];
}
