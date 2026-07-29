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
}
