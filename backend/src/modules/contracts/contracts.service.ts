import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ContractStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { detectUnitType, normalizeAddress, normalizeMatchText, normalizePostalCode, normalizeText } from '../properties/property-import.service';

type SourceRow = Record<string, unknown>;

const H = {
  propertyName: '【物件情報】物件名', roomNumber: '【基本情報】部屋番号', postalCode: '【物件情報】郵便番号', address: '【物件情報】住所',
  contractorName: '【契約者】氏名/名称', payerNameKana: '【契約者】振込名義人カナ1', bankSummaryName: '銀行摘要名義', bankStatementSummary: '銀行明細摘要',
  monthlyName1: 'その他月次費用：項目名', monthly1: 'その他月次費用', monthlyName2: 'その他月次費用２：項目名', monthly2: 'その他月次費用２',
  startDate: '契約開始日', endDate: '契約満了日', contractorType: '【契約者】個人法人区分', paymentMethod: '賃料等支払方法', paymentMonthType: '賃料等支払月区分',
  rent: '賃料', managementFee: '管理費・共益費', deposit: '敷金', keyMoney: '礼金', guaranteeDeposit: '保証金', guaranteeFee: '保証料',
  guaranteeCompanyName: '【保証会社】名称', guaranteeCompanyNameKana: '【保証会社】名称カナ', monthlyName6: 'その他月次費用６：項目名', monthly6: 'その他月次費用６',
  depositMonths: '敷金：適用月数', keyMoneyMonths: '礼金：適用月数', keyReplacementFee: '鍵交換代', initialName1: 'その他初期費用：項目名', initial1: 'その他初期費用',
  initialName6: 'その他初期費用６：項目名', renewalFee: '更新事務手数料', insuranceName: '保険名称', insuranceFee: '保険料', insurancePeriod: '保険期間',
  insuranceStartDate: '保険開始日', insuranceEndDate: '保険満期日', guarantor2BirthDate: '【連帯保証人2】生年月日/設立年月日', collectionAccount: '賃料回収用口座（入居者）',
  managementContractType: '管理委託契約契約方式', remark: 'メモ',
} as const;

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown> = {}) {
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 20), 200);
    const where = this.contractWhere(query.search);
    const sortBy = String(query.sortBy || 'startDate');
    const sortDir = String(query.sortDir).toLowerCase() === 'asc' ? 'asc' : 'desc';
    const [contracts, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: { property: { select: { id: true, name: true } }, room: { select: { id: true, roomNumber: true } } },
        orderBy: this.contractOrderBy(sortBy, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);
    return { items: contracts.map((contract) => this.toContract(contract)), pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  private contractOrderBy(
    sortBy: string,
    sortDir: Prisma.SortOrder,
  ): Prisma.ContractOrderByWithRelationInput[] {
    const sortableFields: Record<string, boolean> = {
      startDate: true,
      endDate: true,
      monthlyRent: true,
      managementFee: true,
      deposit: true,
      keyMoney: true,
      guaranteeDeposit: true,
      guaranteeFee: true,
      keyReplacementFee: true,
      renewalAdministrativeFee: true,
      insuranceFee: true,
    };

    if (sortableFields[sortBy]) {
      const primaryOrder = {
        [sortBy]: sortDir,
      } as Prisma.ContractOrderByWithRelationInput;
      return [primaryOrder, { startDate: Prisma.SortOrder.desc }, { createdAt: Prisma.SortOrder.desc }];
    }

    return [{ startDate: Prisma.SortOrder.desc }, { createdAt: Prisma.SortOrder.desc }];
  }

  async get(id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, deletedAt: null },
      include: { property: true, room: true, tenant: true, charges: { orderBy: { sortOrder: 'asc' } }, paymentAliases: true, partyHistories: true },
    });
    if (!contract) throw new NotFoundException('contract.error.notFound');
    return this.toContract(contract);
  }

  async exportRows(search?: string) {
    const contracts = await this.prisma.contract.findMany({
      where: this.contractWhere(search),
      include: { property: { select: { id: true, name: true } }, room: { select: { id: true, roomNumber: true } } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    return contracts.map((contract) => this.toContract(contract));
  }

  async create(body: Record<string, unknown>, actorUserId?: string) {
    const roomId = normalizeText(body.roomId);
    if (!roomId) throw new BadRequestException('contract.error.roomRequired');
    const room = await this.prisma.room.findFirst({ where: { id: roomId, deletedAt: null }, include: { property: true } });
    if (!room || room.property.deletedAt) throw new NotFoundException('contract.error.roomNotFound');
    const contractNumber = normalizeText(body.contractNumber) || `CTR-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${createHash('sha1').update(`${roomId}|${Date.now()}|${Math.random()}`).digest('hex').slice(0, 4).toUpperCase()}`;
    const duplicate = await this.prisma.contract.findFirst({ where: { contractNumber } });
    if (duplicate) throw new ConflictException('contract.error.numberExists');
    const data: Prisma.ContractUncheckedCreateInput = {
      propertyId: room.propertyId,
      roomId,
      contractNumber,
      status: body.status !== undefined ? this.validateStatus(body.status) : ContractStatus.DRAFT,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    };
    this.applyEditableFields(data, body);
    const created = await this.prisma.contract.create({ data });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'contract.create', entityType: 'Contract', entityId: created.id, after: json(created) } });
    await this.setRoomCurrentContract(roomId, created.id, actorUserId);
    return this.get(created.id);
  }

  async listLinked(where: { propertyId?: string; roomId?: string }) {
    const contracts = await this.prisma.contract.findMany({
      where: { ...where, deletedAt: null },
      include: { property: true, room: true, tenant: true, charges: { orderBy: { sortOrder: 'asc' } }, paymentAliases: true },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    return contracts.map((contract) => this.toContract(contract));
  }

  async propertySummary(propertyId: string) {
    const contracts = await this.listLinked({ propertyId });
    const current = contracts.find((contract) => contract.status === 'ACTIVE') ?? contracts[0] ?? null;
    return {
      propertyId,
      hasContract: contracts.length > 0,
      managementStatus: current?.status ?? 'UNCONTRACTED',
      currentContract: current,
      contractCount: contracts.length,
    };
  }

  async update(id: string, body: Record<string, unknown>, actorUserId?: string) {
    const before = await this.prisma.contract.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('contract.error.notFound');
    const data: Prisma.ContractUpdateInput = { updatedBy: actorUserId };
    this.applyEditableFields(data, body);
    const updated = await this.prisma.contract.update({ where: { id }, data });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'contract.update', entityType: 'Contract', entityId: id, before: json(before), after: json(updated) } });
    const room = await this.prisma.room.findUnique({ where: { id: updated.roomId }, select: { currentContractId: true } });
    if (room?.currentContractId === updated.id) {
      await this.prisma.room.update({ where: { id: updated.roomId }, data: { status: updated.status === 'ACTIVE' ? 'OCCUPIED' : 'VACANT', updatedBy: actorUserId } });
    } else if (!room?.currentContractId) {
      await this.refreshRoomCurrentContract(updated.roomId, actorUserId);
    }
    await this.recalculateProperty(updated.propertyId);
    return this.get(id);
  }

  async delete(id: string, actorUserId?: string) {
    const contract = await this.prisma.contract.findFirst({ where: { id, deletedAt: null } });
    if (!contract) throw new NotFoundException('contract.error.notFound');
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({ where: { id }, data: { deletedAt, updatedBy: actorUserId } });
      await tx.room.updateMany({ where: { id: contract.roomId, currentContractId: id }, data: { currentContractId: null, updatedBy: actorUserId } });
      await tx.auditLog.create({ data: { actorUserId, action: 'contract.delete', entityType: 'Contract', entityId: id, before: json(contract), after: { deletedAt: deletedAt.toISOString() } } });
    });
    await this.refreshRoomCurrentContract(contract.roomId, actorUserId);
    await this.recalculateProperty(contract.propertyId);
    return { ok: true, id };
  }

  async batchDelete(value: unknown, actorUserId?: string) {
    const ids = [...new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id.length > 0) : [])];
    if (!ids.length) throw new BadRequestException('contract.error.idsRequired');
    if (ids.length > 500) throw new BadRequestException('contract.error.tooManyIds');
    const contracts = await this.prisma.contract.findMany({ where: { id: { in: ids }, deletedAt: null } });
    if (!contracts.length) return { ok: true, deletedCount: 0 };
    const existingIds = contracts.map((contract) => contract.id);
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.contract.updateMany({ where: { id: { in: existingIds }, deletedAt: null }, data: { deletedAt, updatedBy: actorUserId } });
      await tx.room.updateMany({ where: { currentContractId: { in: existingIds } }, data: { currentContractId: null, updatedBy: actorUserId } });
      await tx.auditLog.create({ data: { actorUserId, action: 'contract.batch_delete', entityType: 'Contract', after: { ids: existingIds, deletedCount: existingIds.length, deletedAt: deletedAt.toISOString() } } });
    });
    const roomIds = [...new Set(contracts.map((contract) => contract.roomId))];
    const propertyIds = [...new Set(contracts.map((contract) => contract.propertyId))];
    for (const roomId of roomIds) await this.refreshRoomCurrentContract(roomId, actorUserId);
    for (const propertyId of propertyIds) await this.recalculateProperty(propertyId);
    return { ok: true, deletedCount: existingIds.length };
  }

  async setRoomCurrentContract(roomId: string, value: unknown, actorUserId?: string) {
    const room = await this.prisma.room.findFirst({ where: { id: roomId, deletedAt: null } });
    if (!room) throw new NotFoundException('contract.error.roomNotFound');
    const contractId = normalizeText(value) || null;
    const contract = contractId
      ? await this.prisma.contract.findFirst({ where: { id: contractId, roomId, deletedAt: null } })
      : null;
    if (contractId && !contract) throw new BadRequestException('contract.error.contractRoomMismatch');
    const before = { currentContractId: room.currentContractId, status: room.status };
    const updated = await this.prisma.room.update({
      where: { id: roomId },
      data: {
        currentContractId: contract?.id ?? null,
        status: contract?.status === 'ACTIVE' ? 'OCCUPIED' : 'VACANT',
        updatedBy: actorUserId,
      },
    });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'room.current_contract.update', entityType: 'Room', entityId: roomId, before, after: { currentContractId: updated.currentContractId, status: updated.status } } });
    await this.recalculateProperty(room.propertyId);
    return { ok: true, roomId, currentContractId: updated.currentContractId, status: updated.status };
  }

  async uploadIntegrated(body: { originalName?: string; fileHash?: string; rows?: SourceRow[] }, actorUserId?: string) {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) throw new BadRequestException('import.error.emptyFile');
    if (rows.length > 20_000) throw new BadRequestException('import.error.tooManyRows');
    const missing = [H.propertyName, H.roomNumber, H.postalCode, H.address].filter((header) => !(header in (rows[0] ?? {})));
    if (missing.length) throw new BadRequestException({ message: 'integrated.error.missingHeaders', missing });
    const fileHash = createHash('sha256').update(`INTEGRATED:${body.fileHash || JSON.stringify(rows)}`).digest('hex');
    const duplicate = await this.prisma.propertyImportBatch.findUnique({ where: { fileHash } });
    if (duplicate) throw new ConflictException({ message: 'import.error.duplicateFile', batchId: duplicate.id });

    const properties = await this.prisma.property.findMany({
      where: { deletedAt: null },
      include: { rooms: { where: { deletedAt: null }, include: { contracts: { where: { deletedAt: null } } } } },
    });
    const preview = rows.map((source, index) => this.previewRow(source, index + 2, properties));
    const batchNo = `ICI-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${fileHash.slice(0, 6).toUpperCase()}`;
    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.propertyImportBatch.create({
        data: { batchNo, originalName: normalizeText(body.originalName) || 'integrated-import.xls', fileHash, importType: 'INTEGRATED', totalRows: preview.length, status: 'PREVIEW_READY', createdBy: actorUserId, mappingJson: H },
      });
      await tx.propertyImportRow.createMany({ data: preview.map((row) => ({ ...row, batchId: created.id })) });
      await tx.auditLog.create({ data: { actorUserId, action: 'integrated.import.upload', entityType: 'PropertyImportBatch', entityId: created.id, after: { batchNo, totalRows: preview.length } } });
      return created;
    });
    await this.refreshStats(batch.id);
    return this.getImportBatch(batch.id, { page: 1, pageSize: 50 });
  }

  async listImportBatches() {
    return this.prisma.propertyImportBatch.findMany({
      where: { importType: 'INTEGRATED' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getImportBatch(batchId: string, query: Record<string, unknown> = {}) {
    const batch = await this.prisma.propertyImportBatch.findFirst({ where: { id: batchId, importType: 'INTEGRATED' } });
    if (!batch) throw new NotFoundException('import.error.batchNotFound');
    const page = positiveInt(query.page, 1);
    const pageSize = Math.min(positiveInt(query.pageSize, 50), 500);
    const search = normalizeText(query.search);
    const where: Prisma.PropertyImportRowWhereInput = {
      batchId,
      ...(query.status ? { status: String(query.status) } : {}),
      ...(search ? { OR: [{ propertyName: { contains: search, mode: 'insensitive' } }, { roomNumber: { contains: search, mode: 'insensitive' } }] } : {}),
    };
    const [importRows, total] = await Promise.all([
      this.prisma.propertyImportRow.findMany({ where, include: { property: true, room: true, contract: true }, orderBy: { sourceRow: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.propertyImportRow.count({ where }),
    ]);
    return { batch, rows: importRows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async updateImportRow(batchId: string, rowId: string, body: any, actorUserId?: string) {
    const before = await this.prisma.propertyImportRow.findFirst({ where: { id: rowId, batchId, batch: { importType: 'INTEGRATED' } } });
    if (!before) throw new NotFoundException('import.error.rowNotFound');
    if (before.status === 'COMMITTED') throw new ConflictException('import.error.rowAlreadyCommitted');
    const contractAction = body.contractAction ?? before.contractAction;
    if (!['CREATE_CONTRACT', 'UPDATE_CONTRACT', 'NO_CONTRACT', 'SKIP'].includes(contractAction)) throw new BadRequestException('integrated.error.invalidContractAction');
    const updated = await this.prisma.propertyImportRow.update({
      where: { id: rowId },
      data: { contractAction, status: contractAction === 'SKIP' ? 'SKIPPED' : 'READY', contractConflictReason: null, remark: body.remark ?? before.remark },
    });
    await this.prisma.propertyImportBatch.update({ where: { id: batchId }, data: { status: 'PREVIEW_READY', completedAt: null } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'integrated.import.row.update', entityType: 'PropertyImportRow', entityId: rowId, before: json(before), after: json(updated) } });
    await this.refreshStats(batchId);
    return updated;
  }

  async commitIntegrated(batchId: string, actorUserId?: string) {
    const batch = await this.prisma.propertyImportBatch.findFirst({ where: { id: batchId, importType: 'INTEGRATED' } });
    if (!batch) throw new NotFoundException('import.error.batchNotFound');
    const rows = await this.prisma.propertyImportRow.findMany({ where: { batchId, status: 'READY' }, orderBy: { sourceRow: 'asc' } });
    if (!rows.length) throw new ConflictException('import.error.noReadyRows');
    await this.prisma.propertyImportBatch.update({ where: { id: batchId }, data: { status: 'COMMITTING' } });
    const touched = new Set<string>();
    for (const row of rows) {
      try {
        const propertyId = await this.commitRow(row, actorUserId);
        touched.add(propertyId);
      } catch (error) {
        await this.prisma.propertyImportRow.update({ where: { id: row.id }, data: { status: 'FAILED', errorMessage: error instanceof Error ? error.message.slice(0, 1000) : 'integrated.error.commitFailed' } });
      }
    }
    for (const propertyId of touched) await this.recalculateProperty(propertyId);
    const stats = await this.refreshStats(batchId, true);
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'integrated.import.commit', entityType: 'PropertyImportBatch', entityId: batchId, after: json(stats) } });
    return this.getImportBatch(batchId, { page: 1, pageSize: 50 });
  }

  private previewRow(source: SourceRow, sourceRow: number, properties: any[]) {
    const propertyName = normalizeText(source[H.propertyName]);
    const address = normalizeText(source[H.address]);
    const roomNumber = normalizeText(source[H.roomNumber]) || '0';
    const normalizedPropertyName = normalizeMatchText(propertyName);
    const normalizedAddress = normalizeAddress(address);
    const normalizedRoomNumber = normalizeMatchText(roomNumber);
    const contractData = this.contractData(source);
    if (!propertyName) return this.previewError(source, sourceRow, propertyName, address, roomNumber, 'import.error.propertyNameRequired');
    const sameName = properties.filter((property) => (property.normalizedName || normalizeMatchText(property.name)) === normalizedPropertyName);
    const exact = sameName.find((property) => (property.normalizedAddress || normalizeAddress(property.address)) === normalizedAddress);
    if (!exact && sameName.length) return this.previewError(source, sourceRow, propertyName, address, roomNumber, 'import.error.sameNameDifferentAddress');
    const room = exact?.rooms.find((item: any) => (item.normalizedRoomNumber || normalizeMatchText(item.roomNumber)) === normalizedRoomNumber);
    let contractAction = contractData.hasContract ? 'CREATE_CONTRACT' : 'NO_CONTRACT';
    let contractId: string | null = null;
    let contractConflictReason: string | null = null;
    let status = 'READY';
    if (room && contractData.hasContract) {
      const exactContract = room.contracts.find((contract: any) => normalizeMatchText(contract.contractorName) === normalizeMatchText(contractData.contractorName) && iso(contract.startDate) === contractData.startDate && iso(contract.endDate) === contractData.endDate);
      if (exactContract) {
        contractId = exactContract.id;
        if (sameMoney(exactContract.monthlyRent, contractData.monthlyRent) && sameMoney(exactContract.managementFee, contractData.managementFee)) {
          contractAction = 'SKIP'; status = 'SKIPPED';
        } else {
          contractAction = 'UPDATE_CONTRACT'; status = 'CONFLICT'; contractConflictReason = 'integrated.error.existingContractDiffers';
        }
      } else if (room.contracts.some((contract: any) => periodsOverlap(contract.startDate, contract.endDate, contractData.startDate, contractData.endDate))) {
        status = 'CONFLICT'; contractConflictReason = 'integrated.error.overlappingContract';
      }
    }
    return {
      sourceRow, sourceDataJson: source as Prisma.InputJsonObject, propertyName, normalizedPropertyName, roomNumber, normalizedRoomNumber,
      postalCode: normalizePostalCode(source[H.postalCode]) || null, address: address || null, normalizedAddress: normalizedAddress || null,
      detectedUnitType: detectUnitType(roomNumber), propertyId: exact?.id ?? null, roomId: room?.id ?? null,
      action: room ? 'UPDATE_ROOM' : exact ? 'CREATE_ROOM' : 'CREATE_PROPERTY_AND_ROOM', status, contractId,
      contractAction, contractStatus: contractData.status, contractDataJson: contractData as unknown as Prisma.InputJsonObject, contractConflictReason,
      conflictReason: contractConflictReason, errorMessage: null,
    };
  }

  private previewError(source: SourceRow, sourceRow: number, propertyName: string, address: string, roomNumber: string, reason: string) {
    return { sourceRow, sourceDataJson: source as Prisma.InputJsonObject, propertyName, normalizedPropertyName: normalizeMatchText(propertyName), roomNumber, normalizedRoomNumber: normalizeMatchText(roomNumber), postalCode: normalizePostalCode(source[H.postalCode]) || null, address: address || null, normalizedAddress: normalizeAddress(address) || null, detectedUnitType: detectUnitType(roomNumber), action: 'ERROR', status: 'ERROR', contractAction: 'SKIP', contractStatus: 'DRAFT', contractDataJson: this.contractData(source) as unknown as Prisma.InputJsonObject, errorMessage: reason, conflictReason: reason };
  }

  private contractData(source: SourceRow) {
    const contractorName = normalizeText(source[H.contractorName]);
    const startDate = iso(parseDate(source[H.startDate]));
    const endDate = iso(parseDate(source[H.endDate]));
    const monthlyRent = moneyString(source[H.rent]);
    const bankStatementSummary = normalizeText(source[H.bankStatementSummary]) || normalizeText(source['银行账单摘要']);
    const hasContract = Boolean(contractorName || startDate || endDate || monthlyRent !== null || normalizeText(source[H.bankSummaryName]) || bankStatementSummary || normalizeText(source[H.paymentMethod]));
    const valid = Boolean(contractorName && startDate && monthlyRent !== null);
    const charges = [
      charge('MONTHLY_OTHER', source[H.monthlyName1], source[H.monthly1], null, 1), charge('MONTHLY_OTHER', source[H.monthlyName2], source[H.monthly2], null, 2), charge('MONTHLY_OTHER', source[H.monthlyName6], source[H.monthly6], null, 6),
      charge('INITIAL_OTHER', source[H.initialName1], source[H.initial1], null, 1), charge('INITIAL_OTHER', source[H.initialName6], null, null, 6),
      charge('SECURITY_DEPOSIT', '敷金', source[H.deposit], source[H.depositMonths], 10), charge('KEY_MONEY', '礼金', source[H.keyMoney], source[H.keyMoneyMonths], 11),
    ].filter(Boolean);
    return {
      hasContract, contractorName: contractorName || null, contractorNameKana: normalizeText(source[H.payerNameKana]) || null,
      contractorType: normalizeText(source[H.contractorType]) || null, payerName: contractorName || null, payerNameKana: normalizeText(source[H.payerNameKana]) || null,
      bankSummaryName: normalizeText(source[H.bankSummaryName]) || null, bankStatementSummary: bankStatementSummary || null, startDate, endDate, paymentMethod: normalizeText(source[H.paymentMethod]) || null,
      paymentMonthType: normalizeText(source[H.paymentMonthType]) || null, monthlyRent, managementFee: moneyString(source[H.managementFee]), deposit: moneyString(source[H.deposit]), keyMoney: moneyString(source[H.keyMoney]),
      guaranteeDeposit: moneyString(source[H.guaranteeDeposit]), guaranteeFee: moneyString(source[H.guaranteeFee]), guaranteeCompanyName: normalizeText(source[H.guaranteeCompanyName]) || null,
      guaranteeCompanyNameKana: normalizeText(source[H.guaranteeCompanyNameKana]) || null, keyReplacementFee: moneyString(source[H.keyReplacementFee]), renewalAdministrativeFee: moneyString(source[H.renewalFee]),
      insuranceName: normalizeText(source[H.insuranceName]) || null, insuranceFee: moneyString(source[H.insuranceFee]), insurancePeriod: normalizeText(source[H.insurancePeriod]) || null,
      insuranceStartDate: iso(parseDate(source[H.insuranceStartDate])), insuranceEndDate: iso(parseDate(source[H.insuranceEndDate])), collectionAccount: normalizeText(source[H.collectionAccount]) || null,
      managementContractType: normalizeText(source[H.managementContractType]) || null, remark: normalizeText(source[H.remark]) || null,
      guarantor2BirthDate: iso(parseDate(source[H.guarantor2BirthDate])), charges, status: hasContract ? (valid ? calculateStatus(startDate, endDate) : 'DRAFT') : 'UNCONTRACTED',
    };
  }

  private async commitRow(row: any, actorUserId?: string) {
    return this.prisma.$transaction(async (tx) => {
      let property = row.propertyId ? await tx.property.findFirst({ where: { id: row.propertyId, deletedAt: null } }) : null;
      if (!property) property = await tx.property.findFirst({ where: { normalizedName: row.normalizedPropertyName, normalizedAddress: row.normalizedAddress, deletedAt: null } });
      if (!property) {
        property = await tx.property.create({ data: { propertyCode: code('PROP', `${row.normalizedPropertyName}|${row.normalizedAddress}`), name: row.propertyName, normalizedName: row.normalizedPropertyName, postalCode: row.postalCode, address: row.address, normalizedAddress: row.normalizedAddress, managementStatus: 'UNCONTRACTED', sourceDataJson: row.sourceDataJson, createdBy: actorUserId, updatedBy: actorUserId } });
      } else {
        property = await tx.property.update({ where: { id: property.id }, data: { ...(row.postalCode ? { postalCode: row.postalCode } : {}), ...(row.address ? { address: row.address, normalizedAddress: row.normalizedAddress } : {}), updatedBy: actorUserId } });
      }
      let room = row.roomId ? await tx.room.findFirst({ where: { id: row.roomId, deletedAt: null } }) : await tx.room.findFirst({ where: { propertyId: property.id, normalizedRoomNumber: row.normalizedRoomNumber, deletedAt: null } });
      if (!room) room = await tx.room.create({ data: { propertyId: property.id, roomCode: code('ROOM', `${property.propertyCode || property.id}|${row.normalizedRoomNumber}`), roomNumber: row.roomNumber, normalizedRoomNumber: row.normalizedRoomNumber, displayName: row.roomNumber, unitType: row.detectedUnitType, sourceDataJson: row.sourceDataJson, status: 'VACANT', createdBy: actorUserId, updatedBy: actorUserId } });

      const data = row.contractDataJson as any;
      let contractId: string | null = null;
      if (row.contractAction !== 'NO_CONTRACT') {
        let tenant = data.contractorName ? await tx.tenant.findFirst({ where: { name: data.contractorName } }) : null;
        if (!tenant && data.contractorName) tenant = await tx.tenant.create({ data: { name: data.contractorName, nameKana: data.contractorNameKana } });
        const contractData = {
          propertyId: property.id, roomId: room.id, tenantId: tenant?.id ?? null, contractorName: data.contractorName, contractorNameKana: data.contractorNameKana,
          contractorType: data.contractorType, payerName: data.payerName, payerNameKana: data.payerNameKana, bankSummaryName: data.bankSummaryName, bankStatementSummary: data.bankStatementSummary,
          startDate: parseDate(data.startDate), endDate: parseDate(data.endDate), paymentMethod: data.paymentMethod, paymentMonthType: data.paymentMonthType,
          monthlyRent: decimalOrNull(data.monthlyRent), managementFee: decimalOrNull(data.managementFee), deposit: decimalOrNull(data.deposit), keyMoney: decimalOrNull(data.keyMoney),
          guaranteeDeposit: decimalOrNull(data.guaranteeDeposit), guaranteeFee: decimalOrNull(data.guaranteeFee), keyReplacementFee: decimalOrNull(data.keyReplacementFee), renewalAdministrativeFee: decimalOrNull(data.renewalAdministrativeFee),
          guaranteeCompanyName: data.guaranteeCompanyName, guaranteeCompanyNameKana: data.guaranteeCompanyNameKana, insuranceName: data.insuranceName, insuranceFee: decimalOrNull(data.insuranceFee), insurancePeriod: data.insurancePeriod,
          insuranceStartDate: parseDate(data.insuranceStartDate), insuranceEndDate: parseDate(data.insuranceEndDate), collectionAccount: data.collectionAccount, managementContractType: data.managementContractType,
          status: this.validateStatus(data.status), remark: data.remark, sourceDataJson: row.sourceDataJson, updatedBy: actorUserId,
        };
        let contract;
        if (row.contractAction === 'UPDATE_CONTRACT' && row.contractId) {
          await tx.contractCharge.deleteMany({ where: { contractId: row.contractId } });
          contract = await tx.contract.update({ where: { id: row.contractId }, data: contractData });
        } else {
          contract = await tx.contract.create({ data: { ...contractData, contractNumber: contractNumber(row), createdBy: actorUserId } });
        }
        contractId = contract.id;
        if (Array.isArray(data.charges) && data.charges.length) await tx.contractCharge.createMany({ data: data.charges.map((item: any) => ({ contractId: contract.id, chargeType: item.chargeType, itemName: item.itemName, amount: decimalOrNull(item.amount), monthCount: decimalOrNull(item.monthCount), sortOrder: item.sortOrder })) });
        if (data.bankSummaryName) {
          const normalizedBankSummary = normalizeMatchText(data.bankSummaryName);
          const alias = await tx.contractPaymentAlias.findFirst({ where: { contractId: contract.id, normalizedBankSummary } });
          if (!alias) await tx.contractPaymentAlias.create({ data: { contractId: contract.id, payerName: data.payerName, originalBankSummary: data.bankSummaryName, normalizedBankSummary, createdBy: actorUserId } });
        }
        await tx.room.update({ where: { id: room.id }, data: { currentContractId: contract.id, status: contract.status === 'ACTIVE' ? 'OCCUPIED' : 'VACANT', updatedBy: actorUserId } });
      }
      await tx.propertyImportRow.update({ where: { id: row.id }, data: { propertyId: property.id, roomId: room.id, contractId, status: 'COMMITTED', errorMessage: null, conflictReason: null, contractConflictReason: null } });
      await tx.auditLog.create({ data: { actorUserId, action: 'integrated.import.row.commit', entityType: 'PropertyImportRow', entityId: row.id, after: { propertyId: property.id, roomId: room.id, contractId, sourceRow: row.sourceRow } } });
      return property.id;
    });
  }

  private async recalculateProperty(propertyId: string) {
    const contracts = await this.prisma.contract.findMany({ where: { propertyId, deletedAt: null }, select: { status: true } });
    const statuses = new Set(contracts.map((item) => item.status));
    const managementStatus = statuses.has('ACTIVE') ? 'ACTIVE' : statuses.has('CANCELLATION_SETTLEMENT') ? 'CANCELLATION_SETTLEMENT' : statuses.has('DRAFT') || statuses.has('FUTURE') ? 'DRAFT' : 'UNCONTRACTED';
    await this.prisma.property.update({ where: { id: propertyId }, data: { managementStatus } });
  }

  private applyEditableFields(data: Record<string, unknown>, body: Record<string, unknown>) {
    const textFields = ['contractorName', 'contractorNameKana', 'contractorType', 'payerName', 'payerNameKana', 'bankSummaryName', 'bankStatementSummary', 'paymentMethod', 'paymentMonthType', 'guaranteeCompanyName', 'guaranteeCompanyNameKana', 'insuranceName', 'insurancePeriod', 'collectionAccount', 'managementContractType', 'remark'] as const;
    for (const key of textFields) if (body[key] !== undefined) data[key] = normalizeText(body[key]) || null;
    for (const key of ['startDate', 'endDate', 'insuranceStartDate', 'insuranceEndDate'] as const) {
      if (body[key] !== undefined) data[key] = parseDate(body[key]);
    }
    for (const key of ['monthlyRent', 'managementFee', 'deposit', 'keyMoney', 'guaranteeDeposit', 'guaranteeFee', 'keyReplacementFee', 'renewalAdministrativeFee', 'insuranceFee'] as const) {
      if (body[key] !== undefined) data[key] = decimalOrNull(body[key]);
    }
    if (body.status !== undefined) data.status = this.validateStatus(body.status);
  }

  private contractWhere(search: unknown): Prisma.ContractWhereInput {
    const value = normalizeText(search);
    return {
      deletedAt: null,
      ...(value ? { OR: [
        { contractNumber: { contains: value, mode: 'insensitive' } },
        { externalContractId: { contains: value, mode: 'insensitive' } },
        { contractorName: { contains: value, mode: 'insensitive' } },
        { payerName: { contains: value, mode: 'insensitive' } },
        { payerNameKana: { contains: value, mode: 'insensitive' } },
        { bankSummaryName: { contains: value, mode: 'insensitive' } },
        { bankStatementSummary: { contains: value, mode: 'insensitive' } },
        { room: { roomNumber: { contains: value, mode: 'insensitive' } } },
        { property: { name: { contains: value, mode: 'insensitive' } } },
      ] } : {}),
    };
  }

  private async refreshRoomCurrentContract(roomId: string, actorUserId?: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { roomId, deletedAt: null },
      select: { id: true, status: true },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    });
    const current = contracts.find((contract) => contract.status === 'ACTIVE')
      ?? contracts.find((contract) => contract.status === 'FUTURE')
      ?? contracts[0]
      ?? null;
    await this.prisma.room.update({
      where: { id: roomId },
      data: {
        currentContractId: current?.id ?? null,
        status: current?.status === 'ACTIVE' ? 'OCCUPIED' : 'VACANT',
        updatedBy: actorUserId,
      },
    });
  }

  private async refreshStats(batchId: string, complete = false) {
    const grouped = await this.prisma.propertyImportRow.groupBy({ by: ['status'], where: { batchId }, _count: { _all: true } });
    const counts = Object.fromEntries(grouped.map((item) => [item.status, item._count._all]));
    const data = { successRows: counts.COMMITTED ?? 0, skippedRows: counts.SKIPPED ?? 0, failedRows: (counts.ERROR ?? 0) + (counts.FAILED ?? 0), conflictRows: counts.CONFLICT ?? 0, ...(complete ? { status: (counts.ERROR || counts.FAILED || counts.CONFLICT) ? 'PARTIAL_COMPLETED' : 'COMPLETED', completedAt: new Date() } : {}) };
    await this.prisma.propertyImportBatch.update({ where: { id: batchId }, data });
    return data;
  }

  private validateStatus(value: unknown): ContractStatus {
    const status = normalizeText(value).toUpperCase();
    if (!['DRAFT', 'ACTIVE', 'CANCELLATION_SETTLEMENT', 'EXPIRED', 'TERMINATED', 'FUTURE'].includes(status)) return ContractStatus.DRAFT;
    return status as ContractStatus;
  }

  private toContract(contract: any) {
    return { ...contract, startDate: iso(contract.startDate), endDate: iso(contract.endDate), insuranceStartDate: iso(contract.insuranceStartDate), insuranceEndDate: iso(contract.insuranceEndDate), monthlyRent: moneyString(contract.monthlyRent), managementFee: moneyString(contract.managementFee), deposit: moneyString(contract.deposit), keyMoney: moneyString(contract.keyMoney), guaranteeDeposit: moneyString(contract.guaranteeDeposit), guaranteeFee: moneyString(contract.guaranteeFee), keyReplacementFee: moneyString(contract.keyReplacementFee), renewalAdministrativeFee: moneyString(contract.renewalAdministrativeFee), insuranceFee: moneyString(contract.insuranceFee), propertyName: contract.property?.name, roomNumber: contract.room?.roomNumber };
  }
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})$/);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function iso(value: unknown) { const date = value instanceof Date ? value : parseDate(value); return date ? date.toISOString().slice(0, 10) : null; }
function moneyString(value: unknown) { if (value === null || value === undefined || normalizeText(value) === '') return null; const normalized = normalizeText(value).replace(/[,￥¥]/g, ''); return Number.isFinite(Number(normalized)) ? Number(normalized).toFixed(2) : null; }
function decimalOrNull(value: unknown) { const text = moneyString(value); return text === null ? null : new Prisma.Decimal(text); }
function monthCount(value: unknown) { const match = normalizeText(value).match(/\d+(?:\.\d+)?/); return match ? match[0] : null; }
function charge(chargeType: string, itemName: unknown, amount: unknown, months: unknown, sortOrder: number) { const name = normalizeText(itemName); const money = moneyString(amount); const count = monthCount(months); return name || (money !== null && Number(money) !== 0) || count ? { chargeType, itemName: name || chargeType, amount: money, monthCount: count, sortOrder } : null; }
function calculateStatus(start: string | null, end: string | null) { const today = new Date().toISOString().slice(0, 10); if (!start) return 'DRAFT'; if (start > today) return 'FUTURE'; if (end && end < today) return 'EXPIRED'; return 'ACTIVE'; }
function periodsOverlap(startA: unknown, endA: unknown, startB: string | null, endB: string | null) { const a1 = iso(startA); const a2 = iso(endA) || '9999-12-31'; const b1 = startB; const b2 = endB || '9999-12-31'; return Boolean(a1 && b1 && a1 <= b2 && b1 <= a2); }
function sameMoney(left: unknown, right: unknown) { return moneyString(left) === moneyString(right); }
function code(prefix: string, seed: string) { return `${prefix}-${createHash('sha256').update(seed).digest('hex').slice(0, 16).toUpperCase()}`; }
function contractNumber(row: any) { const month = String((row.contractDataJson as any)?.startDate || new Date().toISOString().slice(0, 7)).replace(/-/g, '').slice(0, 6); return `CTR-${month}-${String(row.sourceRow).padStart(6, '0')}-${createHash('sha1').update(row.id).digest('hex').slice(0, 4).toUpperCase()}`; }
function json(value: unknown) { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function positiveInt(value: unknown, fallback: number) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
