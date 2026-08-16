import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(search?: string) {
    return this.prisma.property.findMany({
      where: {
        deletedAt: null,
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { propertyCode: { contains: search, mode: 'insensitive' as const } }, { address: { contains: search, mode: 'insensitive' as const } }] }
          : {}),
      },
      include: { _count: { select: { rooms: true, ownerships: true } } },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async listRooms(query: Record<string, unknown> = {}) {
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 20), 200);
    const where = this.roomWhere(query.search);
    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: {
          property: { include: { project: true } },
          _count: { select: { contracts: { where: { deletedAt: null } } } },
          contracts: {
            where: { deletedAt: null },
            select: { id: true, contractNumber: true, contractorName: true, status: true, startDate: true },
            orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
            take: 1,
          },
          ownerLinks: {
            where: { deletedAt: null, status: 'ACTIVE' },
            include: { owner: { select: { id: true, name: true, nameKana: true } } },
            orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
          },
        },
        orderBy: [{ property: { name: 'asc' } }, { roomNumber: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.room.count({ where }),
    ]);
    const roomIds = rooms.map((room) => room.id);
    const currentContractIds = rooms.map((room) => room.currentContractId).filter((id): id is string => Boolean(id));
    const preferredContracts = roomIds.length
      ? await this.prisma.contract.findMany({
          where: {
            deletedAt: null,
            OR: [
              ...(currentContractIds.length ? [{ id: { in: currentContractIds } }] : []),
              { roomId: { in: roomIds }, status: 'ACTIVE' },
            ],
          },
          select: { id: true, roomId: true, contractNumber: true, contractorName: true, status: true, startDate: true },
          orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        })
      : [];
    const contractsByRoom = new Map<string, typeof preferredContracts>();
    for (const contract of preferredContracts) {
      const existing = contractsByRoom.get(contract.roomId) ?? [];
      existing.push(contract);
      contractsByRoom.set(contract.roomId, existing);
    }
    return {
      items: rooms.map((room) => this.toRoomListItem(room, contractsByRoom.get(room.id))),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async roomOptions(search?: string) {
    const rooms = await this.prisma.room.findMany({
      where: this.roomWhere(search),
      include: { property: { include: { project: true } } },
      orderBy: [{ property: { name: 'asc' } }, { roomNumber: 'asc' }],
      take: 100,
    });
    return rooms.map((room) => ({
      id: room.id,
      propertyId: room.propertyId,
      label: [room.property.project?.name, room.property.name, room.roomNumber || room.displayName, room.property.propertyCode, room.roomCode].filter(Boolean).join(' / '),
    }));
  }

  async exportRooms(search?: string) {
    const rooms = await this.prisma.room.findMany({
      where: this.roomWhere(search),
      include: {
        property: { include: { project: true } },
        contracts: {
          where: { deletedAt: null },
          select: { id: true, contractNumber: true, contractorName: true, bankSummaryName: true, bankStatementSummary: true, status: true, startDate: true },
          orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
        },
        ownerLinks: {
          where: { deletedAt: null, status: 'ACTIVE' },
          include: { owner: { select: { id: true, name: true, nameKana: true } } },
          orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
        },
      },
      orderBy: [{ property: { name: 'asc' } }, { roomNumber: 'asc' }, { createdAt: 'asc' }],
    });
    return rooms.map((room) => this.toRoomListItem(room));
  }

  async get(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: {
        rooms: { where: { deletedAt: null }, include: { contracts: { where: { deletedAt: null }, orderBy: { startDate: 'desc' } } }, orderBy: { roomNumber: 'asc' } },
        contracts: { where: { deletedAt: null }, include: { room: true, tenant: true }, orderBy: { startDate: 'desc' } },
        ownerships: { where: { deletedAt: null }, include: { owner: true }, orderBy: { isPrimary: 'desc' } },
      },
    });
    if (!property) throw new NotFoundException('property.error.notFound');
    return property;
  }

  async update(id: string, body: Record<string, unknown>, actorUserId?: string) {
    await this.get(id);
    const allowed = ['name', 'nameKana', 'postalCode', 'address', 'prefecture', 'city', 'ward', 'buildingType', 'usageType', 'managementStatus', 'latitude', 'longitude', 'remark'] as const;
    const data: Prisma.PropertyUpdateInput = { updatedBy: actorUserId };
    for (const key of allowed) {
      if (body[key] !== undefined) (data as Record<string, unknown>)[key] = body[key] === '' ? null : body[key];
    }
    return this.prisma.property.update({ where: { id }, data });
  }

  private roomWhere(search: unknown): Prisma.RoomWhereInput {
    const value = String(search ?? '').trim();
    return {
      deletedAt: null,
      property: { deletedAt: null },
      ...(value ? { OR: [
        { roomCode: { contains: value, mode: 'insensitive' } },
        { houseNumber: { contains: value, mode: 'insensitive' } },
        { roomNumber: { contains: value, mode: 'insensitive' } },
        { displayName: { contains: value, mode: 'insensitive' } },
        { property: { name: { contains: value, mode: 'insensitive' } } },
        { property: { propertyCode: { contains: value, mode: 'insensitive' } } },
        { property: { address: { contains: value, mode: 'insensitive' } } },
      ] } : {}),
    };
  }

  private toRoomListItem(room: any, preferredContracts: any[] = []) {
    const contracts = [...preferredContracts, ...room.contracts]
      .filter((contract, index, all) => all.findIndex((candidate) => candidate.id === contract.id) === index);
    const currentContract = contracts.find((contract: any) => contract.id === room.currentContractId)
      ?? contracts.find((contract: any) => contract.status === 'ACTIVE')
      ?? contracts[0]
      ?? null;
    const property = room.property;
    const owners = (room.ownerLinks ?? []).map((link: any) => ({
      id: link.owner.id,
      name: link.owner.name,
      nameKana: link.owner.nameKana ?? '',
      isPrimary: Boolean(link.isPrimary),
    }));
    return {
      id: room.id,
      buildingId: property.id,
      projectName: property.project?.name ?? '',
      buildingName: property.name,
      propertyCode: property.propertyCode ?? '',
      buildingNameKana: property.nameKana ?? '',
      postalCode: property.postalCode ?? '',
      address: property.address ?? '',
      addressLine1: property.addressLine1 ?? '',
      addressLine2: property.addressLine2 ?? '',
      prefecture: property.prefecture ?? '',
      city: property.city ?? '',
      ward: property.ward ?? '',
      buildingLatitude: property.latitude?.toString() ?? '',
      buildingLongitude: property.longitude?.toString() ?? '',
      buildingType: property.buildingType ?? '',
      propertyUsageType: property.usageType ?? '',
      managementStatus: property.managementStatus,
      propertyRemark: property.remark ?? '',
      roomCode: room.roomCode ?? '',
      houseNumber: room.houseNumber ?? '',
      roomNumber: room.roomNumber ?? '',
      displayName: room.displayName ?? '',
      unitType: room.unitType,
      roomUsageType: room.usageType ?? '',
      area: room.area?.toString() ?? '',
      floor: room.floor,
      floorLabel: room.floorLabel ?? '',
      roomLatitude: room.latitude?.toString() ?? '',
      roomLongitude: room.longitude?.toString() ?? '',
      status: room.status,
      note: room.note ?? '',
      roomRemark: room.remark ?? '',
      contractPresence: (room._count?.contracts ?? room.contracts.length) > 0,
      currentContractId: currentContract?.id ?? '',
      currentContract: currentContract ? [currentContract.contractNumber, currentContract.contractorName].filter(Boolean).join(' / ') : '',
      currentContractStatus: currentContract?.status ?? 'UNCONTRACTED',
      owners,
      ownerId: owners[0]?.id ?? '',
      ownerName: owners.map((owner: { name: string }) => owner.name).join(' / '),
    };
  }
}

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
