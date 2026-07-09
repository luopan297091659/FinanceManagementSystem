import { BadRequestException, Injectable } from '@nestjs/common';
import { LinkStatus, Prisma } from '@prisma/client';
import { addMoney, toDecimal } from '../../common/money/decimal';
import { FrontendBootstrap } from '../../common/types/frontend-contract';
import { PrismaService } from '../../database/prisma.service';
import { CreateBindingDto } from './dto/create-binding.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateFeeItemDto } from './dto/create-fee-item.dto';
import { CreateRoomDto } from './dto/create-room.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import {
  dateToIsoDate,
  decimalToString,
  toFrontendCategory,
  toFrontendTransactionType,
  toFrontendValueType,
  toPrismaCategory,
  toPrismaTransactionType,
  toPrismaValueType,
} from './frontend-api.mapper';

@Injectable()
export class FrontendApiService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(): Promise<FrontendBootstrap> {
    const [
      projects,
      properties,
      rooms,
      tenants,
      owners,
      roomTenants,
      roomOwners,
      feeItems,
      transactions,
      documents,
      knowledgeDocuments,
    ] = await Promise.all([
      this.prisma.project.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.property.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.room.findMany({ include: { property: true }, orderBy: [{ propertyId: 'asc' }, { roomNumber: 'asc' }] }),
      this.prisma.tenant.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.owner.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.roomTenant.findMany({ orderBy: { startDate: 'desc' } }),
      this.prisma.roomOwner.findMany({ orderBy: { startDate: 'desc' } }),
      this.prisma.feeItem.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.transaction.findMany({
        include: { details: true },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      }),
      this.prisma.document.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.knowledgeDocument.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);

    return {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        address: project.address,
        note: project.note,
      })),
      buildings: properties.map((property) => ({
        id: property.id,
        projectId: property.projectId,
        name: property.name,
        latitude: decimalToString(property.latitude),
        longitude: decimalToString(property.longitude),
      })),
      rooms: rooms.map((room) => ({
        id: room.id,
        projectId: room.property.projectId,
        buildingId: room.propertyId,
        number: room.roomNumber,
        area: decimalToString(room.area),
        floor: room.floor,
        latitude: decimalToString(room.latitude),
        longitude: decimalToString(room.longitude),
        effectiveLatitude: decimalToString(room.latitude ?? room.property.latitude),
        effectiveLongitude: decimalToString(room.longitude ?? room.property.longitude),
        coordinateSource:
          room.latitude != null && room.longitude != null
            ? 'room'
            : room.property.latitude != null && room.property.longitude != null
              ? 'building'
              : 'none',
        status: room.status,
        note: room.note,
      })),
      tenants: tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        kana: tenant.nameKana,
        nationality: tenant.nationality,
        phone: tenant.phone,
        email: tenant.email,
        birthDate: dateToIsoDate(tenant.birthDate),
        occupation: tenant.occupation,
        annualIncome: decimalToString(tenant.annualIncome),
        address: tenant.address1,
        attachments: tenant.note,
      })),
      owners: owners.map((owner) => ({
        id: owner.id,
        ownerType: owner.ownerType,
        name: owner.name,
        kana: owner.nameKana,
        phone: owner.phone,
        email: owner.email,
        address: owner.address1,
        attachments: owner.note,
      })),
      roomTenants: roomTenants.map((link) => ({
        id: link.id,
        roomId: link.roomId,
        tenantId: link.tenantId,
        startDate: dateToIsoDate(link.startDate),
        endDate: dateToIsoDate(link.endDate),
        status: link.status,
      })),
      roomOwners: roomOwners.map((link) => ({
        id: link.id,
        roomId: link.roomId,
        ownerId: link.ownerId,
        startDate: dateToIsoDate(link.startDate),
        endDate: dateToIsoDate(link.endDate),
        status: link.status,
      })),
      feeItems: feeItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: toFrontendCategory(item.category),
        valueType: toFrontendValueType(item.valueType),
        sortOrder: item.sortOrder,
        enabled: item.enabled,
      })),
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        type: toFrontendTransactionType(transaction.type),
        roomId: transaction.roomId,
        date: dateToIsoDate(transaction.date) ?? '',
        counterparty: transaction.counterparty,
        note: transaction.note,
        details: transaction.details.map((detail) => ({
          feeItemId: detail.feeItemId,
          value:
            decimalToString(detail.valueMoney) ??
            decimalToString(detail.valueNumber) ??
            detail.valueText ??
            dateToIsoDate(detail.valueDate) ??
            '',
        })),
      })),
      documents: documents.map((document) => ({
        id: document.id,
        roomId: document.roomId,
        documentType: document.documentType,
        fileName: document.fileName,
        extractedText: document.ocrText,
      })),
      knowledgeDocuments: knowledgeDocuments.map((document) => ({
        id: document.id,
        roomId: document.roomId,
        title: document.title,
        content: document.content,
        sourceType: document.sourceType,
      })),
    };
  }

  async createRoom(dto: CreateRoomDto) {
    const project = await this.prisma.project.upsert({
      where: { name: dto.projectName },
      create: { name: dto.projectName },
      update: {},
    });
    const property = await this.prisma.property.upsert({
      where: { projectId_name: { projectId: project.id, name: dto.buildingName } },
      create: {
        projectId: project.id,
        name: dto.buildingName,
        latitude: this.optionalDecimal(dto.buildingLatitude),
        longitude: this.optionalDecimal(dto.buildingLongitude),
      },
      update: {
        latitude: this.optionalDecimal(dto.buildingLatitude),
        longitude: this.optionalDecimal(dto.buildingLongitude),
      },
    });

    await this.prisma.room.create({
      data: {
        propertyId: property.id,
        roomNumber: dto.roomNumber,
        area: this.optionalDecimal(dto.area),
        floor: dto.floor ? Number(dto.floor) : undefined,
        latitude: this.optionalDecimal(dto.roomLatitude),
        longitude: this.optionalDecimal(dto.roomLongitude),
        status: this.normalizeRoomStatus(dto.status),
        note: dto.note,
      },
    });
    return { ok: true };
  }

  async createCustomer(dto: CreateCustomerDto) {
    if (dto.kind === 'tenant') {
      await this.prisma.tenant.create({
        data: {
          name: dto.name,
          nameKana: dto.kana,
          nationality: dto.nationality,
          phone: dto.phone,
          email: dto.email,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          occupation: dto.occupation,
          annualIncome: dto.annualIncome ? toDecimal(dto.annualIncome) : undefined,
          address1: dto.address,
          note: dto.attachments,
        },
      });
      return { ok: true };
    }

    await this.prisma.owner.create({
      data: {
        ownerType: dto.ownerType ?? 'PERSON',
        name: dto.name,
        nameKana: dto.kana,
        phone: dto.phone,
        email: dto.email,
        address1: dto.address,
        note: dto.attachments,
      },
    });
    return { ok: true };
  }

  async createBinding(dto: CreateBindingDto) {
    if (!dto.roomId || !dto.customerId) {
      throw new BadRequestException('roomId and customerId are required');
    }

    const data = {
      roomId: dto.roomId,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      status: this.normalizeLinkStatus(dto.status),
    };

    if (dto.kind === 'tenant') {
      await this.prisma.roomTenant.create({ data: { ...data, tenantId: dto.customerId } });
    } else {
      await this.prisma.roomOwner.create({ data: { ...data, ownerId: dto.customerId } });
    }
    return { ok: true };
  }

  async createTransaction(dto: CreateTransactionDto) {
    const feeItems = await this.prisma.feeItem.findMany({
      where: { id: { in: dto.details.map((detail) => detail.feeItemId) } },
    });
    const feeItemById = new Map(feeItems.map((item) => [item.id, item]));
    const moneyValues = dto.details
      .filter((detail) => {
        const item = feeItemById.get(detail.feeItemId);
        return item?.valueType === 'MONEY' || item?.valueType === 'NUMBER';
      })
      .map((detail) => toDecimal(detail.value || 0));

    await this.prisma.transaction.create({
      data: {
        type: toPrismaTransactionType(dto.type),
        roomId: dto.roomId || undefined,
        date: new Date(dto.date),
        counterparty: dto.counterparty,
        totalAmount: addMoney(moneyValues),
        note: dto.note,
        details: {
          create: dto.details.map((detail) => this.toTransactionDetailCreate(detail, feeItemById)),
        },
      },
    });
    return { ok: true };
  }

  async createDocument(dto: CreateDocumentDto) {
    const document = await this.prisma.document.create({
      data: {
        roomId: dto.roomId || undefined,
        documentType: dto.documentType,
        fileName: dto.fileName,
        ocrText: dto.extractedText,
        status: 'CONFIRMED',
      },
    });

    await this.prisma.knowledgeDocument.create({
      data: {
        roomId: dto.roomId || undefined,
        documentId: document.id,
        title: dto.fileName,
        content: dto.extractedText,
        sourceType: dto.documentType,
      },
    });
    return { ok: true };
  }

  async createFeeItem(dto: CreateFeeItemDto) {
    await this.prisma.feeItem.create({
      data: {
        name: dto.name,
        category: toPrismaCategory(dto.category),
        valueType: toPrismaValueType(dto.valueType),
        sortOrder: dto.sortOrder ?? 0,
        enabled: dto.enabled ?? true,
      },
    });
    return { ok: true };
  }

  async reset() {
    await this.prisma.$transaction([
      this.prisma.auditLog.deleteMany(),
      this.prisma.anomaly.deleteMany(),
      this.prisma.reconciliationMatch.deleteMany(),
      this.prisma.bankTransaction.deleteMany(),
      this.prisma.transactionDetail.deleteMany(),
      this.prisma.transaction.deleteMany(),
      this.prisma.knowledgeDocument.deleteMany(),
      this.prisma.document.deleteMany(),
      this.prisma.contract.deleteMany(),
      this.prisma.roomTenant.deleteMany(),
      this.prisma.roomOwner.deleteMany(),
      this.prisma.feeItem.deleteMany(),
      this.prisma.room.deleteMany(),
      this.prisma.tenant.deleteMany(),
      this.prisma.owner.deleteMany(),
      this.prisma.property.deleteMany(),
      this.prisma.project.deleteMany(),
      this.prisma.user.deleteMany(),
      this.prisma.managementCompany.deleteMany(),
    ]);
    return { ok: true };
  }

  private toTransactionDetailCreate(
    detail: { feeItemId: string; value: string },
    feeItemById: Map<string, { valueType: string }>,
  ): Prisma.TransactionDetailCreateWithoutTransactionInput {
    const valueType = feeItemById.get(detail.feeItemId)?.valueType ?? 'TEXT';
    const base = { feeItem: { connect: { id: detail.feeItemId } } };
    if (valueType === 'MONEY') return { ...base, valueMoney: toDecimal(detail.value || 0) };
    if (valueType === 'NUMBER') return { ...base, valueNumber: toDecimal(detail.value || 0) };
    if (valueType === 'DATE') return { ...base, valueDate: new Date(detail.value) };
    return { ...base, valueText: detail.value };
  }

  private normalizeRoomStatus(status?: string) {
    if (status === 'MAINTENANCE') return 'INACTIVE';
    if (status === 'OCCUPIED' || status === 'OVERDUE' || status === 'INACTIVE') return status;
    return 'VACANT';
  }

  private normalizeLinkStatus(status?: string): LinkStatus {
    if (status === 'ENDED' || status === 'PENDING') return status;
    return 'ACTIVE';
  }

  private optionalDecimal(value?: string) {
    return value == null || value === '' ? undefined : toDecimal(value);
  }
}
