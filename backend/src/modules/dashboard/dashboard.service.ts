import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RbacService } from '../rbac/rbac.service';

type DateRange = { startDate: Date | null; endDate: Date | null; label: string };
type CardConfig = {
  id: string;
  moduleKey: string;
  titleKey: string;
  metricKey: string;
  icon: string;
  enabled: boolean;
  priority: number;
  showAbnormalCount: boolean;
  route: string;
  visibleRoles: string[];
  isDefault: boolean;
};

const DEFAULT_CARDS: CardConfig[] = [
  { id: 'unpaid-rent', moduleKey: 'finance', titleKey: 'unpaidRent', metricKey: 'unpaidRentCount', icon: 'finance', enabled: true, priority: 1, showAbnormalCount: true, route: '/finance', visibleRoles: [], isDefault: true },
  { id: 'bank-reconciliation', moduleKey: 'reconciliation', titleKey: 'pendingReconciliation', metricKey: 'pendingReconciliationCount', icon: 'search', enabled: true, priority: 2, showAbnormalCount: true, route: '/ai-reconciliation/bank', visibleRoles: [], isDefault: true },
  { id: 'active-contracts', moduleKey: 'contract', titleKey: 'activeContracts', metricKey: 'activeContractCount', icon: 'users', enabled: true, priority: 3, showAbnormalCount: true, route: '/contracts', visibleRoles: [], isDefault: true },
  { id: 'managed-properties', moduleKey: 'property', titleKey: 'managedProperties', metricKey: 'propertyCount', icon: 'building', enabled: true, priority: 4, showAbnormalCount: true, route: '/resources', visibleRoles: [], isDefault: true },
];

const MODULE_PERMISSIONS: Record<string, string[]> = {
  finance: ['payment:view'],
  reconciliation: ['reconciliation.bank.view', 'reconciliation:view'],
  contract: ['contract.view'],
  property: ['property.view', 'property:view'],
  ocr: ['reconciliation.ocr.view', 'ocr:execute'],
  audit: ['audit_log:view'],
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService) {}

  parseRange(start?: string, end?: string): DateRange {
    const parse = (value?: string) => {
      if (!value) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Dates must use YYYY-MM-DD');
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
      return date;
    };
    const startDate = parse(start);
    const endDate = parse(end);
    if (endDate) endDate.setUTCHours(23, 59, 59, 999);
    if (startDate && endDate && startDate > endDate) throw new BadRequestException('Start date cannot be later than end date');
    return {
      startDate,
      endDate,
      label: startDate || endDate
        ? `${startDate?.toISOString().slice(0, 10) || '…'} – ${endDate?.toISOString().slice(0, 10) || '…'}`
        : 'all',
    };
  }

  private dateWhere(range: DateRange, field = 'date') {
    const value: Record<string, Date> = {};
    if (range.startDate) value.gte = range.startDate;
    if (range.endDate) value.lte = range.endDate;
    return Object.keys(value).length ? { [field]: value } : {};
  }

  private async context(userId: string) {
    const [user, permissions] = await Promise.all([
      this.rbac.getCurrentUser(userId),
      this.rbac.getUserPermissions(userId),
    ]);
    const roles = user?.userRoles.map((item: any) => item.role.code) ?? [];
    return { user, permissions, roles, isSuperAdmin: roles.includes('SUPER_ADMIN') };
  }

  private hasModule(permissions: string[], moduleKey: string) {
    const required = MODULE_PERMISSIONS[moduleKey];
    return !required || required.some((permission) => permissions.includes(permission));
  }

  private async rawConfig(): Promise<CardConfig[]> {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key: 'dashboard.cards' } });
    if (!Array.isArray(setting?.value)) return DEFAULT_CARDS;
    const cards = setting.value as unknown as CardConfig[];
    return this.validateCards(cards, false);
  }

  private validateCards(value: unknown[], strict: boolean): CardConfig[] {
    const cards = value
      .filter((card): card is Record<string, unknown> => !!card && typeof card === 'object')
      .map((card, index) => ({
        id: String(card.id || `dashboard-card-${index + 1}`),
        moduleKey: String(card.moduleKey || 'property'),
        titleKey: String(card.titleKey || 'managedProperties'),
        metricKey: String(card.metricKey || 'propertyCount'),
        icon: String(card.icon || 'dashboard'),
        enabled: card.enabled !== false,
        priority: Number.isFinite(Number(card.priority)) ? Number(card.priority) : index + 1,
        showAbnormalCount: card.showAbnormalCount !== false,
        route: String(card.route || '/'),
        visibleRoles: Array.isArray(card.visibleRoles) ? card.visibleRoles.map(String) : [],
        isDefault: !!card.isDefault,
      }));
    if (strict && cards.filter((card) => card.enabled).length > 4) {
      throw new BadRequestException('The Business Overview page can display a maximum of 4 summary cards. Disable another card first.');
    }
    return cards.length ? cards : DEFAULT_CARDS;
  }

  async getConfigForUser(userId: string) {
    const context = await this.context(userId);
    const cards = await this.rawConfig();
    return {
      cards: cards
        .filter((card) => this.hasModule(context.permissions, card.moduleKey))
        .filter((card) => !card.visibleRoles.length || card.visibleRoles.some((role) => context.roles.includes(role)))
        .sort((a, b) => a.priority - b.priority),
      canEdit: context.permissions.includes('dashboard:config'),
      availableRoles: context.isSuperAdmin ? await this.prisma.role.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { name: 'asc' } }) : [],
    };
  }

  async updateConfig(userId: string, rawCards: unknown[]) {
    const cards = this.validateCards(rawCards, true);
    await this.prisma.systemSetting.upsert({
      where: { key: 'dashboard.cards' },
      update: { value: cards as any },
      create: { key: 'dashboard.cards', value: cards as any, description: 'Business Overview summary card configuration' },
    });
    await this.rbac.logAction(userId, 'update', 'dashboard', 'cards', undefined, `${cards.filter((card) => card.enabled).length} cards enabled`);
    return { success: true, cards };
  }

  async updateReminderState(userId: string, reminderId: string, state: 'read' | 'ignored') {
    const key = `dashboard.reminders.${userId}`;
    const current = await this.prisma.systemSetting.findUnique({ where: { key } });
    const value = current?.value && typeof current.value === 'object' && !Array.isArray(current.value) ? current.value as Record<string, string> : {};
    value[reminderId] = state;
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value, description: 'Per-user dashboard reminder state' },
    });
    return { success: true, id: reminderId, state };
  }

  async getOverview(userId: string, range: DateRange) {
    const context = await this.context(userId);
    const companyId = context.isSuperAdmin ? undefined : context.user?.companyId || undefined;
    const propertyWhere: any = { deletedAt: null, ...(companyId ? { companyId } : {}) };
    const contractWhere: any = { deletedAt: null, ...(companyId ? { property: { companyId } } : {}) };
    const transactionWhere: any = { ...this.dateWhere(range), ...(companyId ? { room: { property: { companyId } } } : {}) };
    const dueRange: any = {};
    if (range.startDate) dueRange.gte = range.startDate;
    if (range.endDate) dueRange.lte = range.endDate;
    const now = new Date();
    const expiringEnd = new Date(now);
    expiringEnd.setDate(expiringEnd.getDate() + 30);

    const [
      propertyCount,
      abnormalPropertyCount,
      abnormalProperties,
      activeContractCount,
      expiringContractCount,
      pendingReconciliationCount,
      pendingOcrCount,
      transactions,
      settlements,
      dueContracts,
      expiringContracts,
      alerts,
      pendingBankTransactions,
      pendingOcrTasks,
      activities,
      config,
      reminderSetting,
    ] = await Promise.all([
      this.hasModule(context.permissions, 'property') ? this.prisma.property.count({ where: propertyWhere }) : 0,
      this.hasModule(context.permissions, 'property') ? this.prisma.property.count({ where: { ...propertyWhere, managementStatus: { not: 'ACTIVE' } } }) : 0,
      this.hasModule(context.permissions, 'property') ? this.prisma.property.findMany({
        where: { ...propertyWhere, managementStatus: { not: 'ACTIVE' } },
        select: { id: true, name: true, managementStatus: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }) : [],
      this.hasModule(context.permissions, 'contract') ? this.prisma.contract.count({ where: { ...contractWhere, status: 'ACTIVE' } }) : 0,
      this.hasModule(context.permissions, 'contract') ? this.prisma.contract.count({ where: { ...contractWhere, status: 'ACTIVE', endDate: { gte: now, lte: expiringEnd } } }) : 0,
      this.hasModule(context.permissions, 'reconciliation') ? this.prisma.bankTransaction.count({ where: { reconciliationStatus: { not: 'MATCHED' }, ...this.dateWhere(range, 'bookedAt') } }) : 0,
      this.hasModule(context.permissions, 'ocr') ? this.prisma.ocrTask.count({ where: { state: { in: ['PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'FAILED'] }, ...this.dateWhere(range, 'createdAt') } }) : 0,
      this.hasModule(context.permissions, 'finance') ? this.prisma.transaction.findMany({ where: transactionWhere, select: { type: true, roomId: true, date: true, totalAmount: true, confirmationStatus: true, processingStatus: true } }) : [],
      this.hasModule(context.permissions, 'finance') && context.isSuperAdmin ? this.prisma.ownerSettlement.findMany({ where: this.dateWhere(range, 'periodStart'), select: { remittanceAmount: true, status: true } }) : [],
      this.hasModule(context.permissions, 'contract') ? this.prisma.contract.findMany({
        where: { ...contractWhere, status: 'ACTIVE', ...(Object.keys(dueRange).length ? { nextDueDate: dueRange } : { nextDueDate: { lte: now } }) },
        select: { id: true, roomId: true, contractorName: true, nextDueDate: true, monthlyRent: true, room: { select: { roomNumber: true, property: { select: { name: true } } } } },
        orderBy: { nextDueDate: 'asc' },
        take: 25,
      }) : [],
      this.hasModule(context.permissions, 'contract') ? this.prisma.contract.findMany({
        where: { ...contractWhere, status: 'ACTIVE', endDate: { gte: now, lte: expiringEnd } },
        select: { id: true, contractorName: true, endDate: true, room: { select: { roomNumber: true, property: { select: { name: true } } } } },
        orderBy: { endDate: 'asc' },
        take: 25,
      }) : [],
      this.hasModule(context.permissions, 'property') ? this.prisma.anomalyAlert.findMany({
        where: { status: 'OPEN', ...this.dateWhere(range, 'createdAt'), ...(companyId ? { OR: [{ property: { companyId } }, { room: { property: { companyId } } }] } : {}) },
        select: { id: true, alertType: true, severity: true, occurredOn: true, createdAt: true, property: { select: { name: true } }, room: { select: { roomNumber: true } } },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        take: 20,
      }) : [],
      this.hasModule(context.permissions, 'reconciliation') ? this.prisma.bankTransaction.findMany({
        where: { reconciliationStatus: { not: 'MATCHED' }, ...this.dateWhere(range, 'bookedAt') },
        select: { id: true, bookedAt: true, amount: true, description: true, accountName: true, reconciliationStatus: true },
        orderBy: { bookedAt: 'desc' },
        take: 25,
      }) : [],
      this.hasModule(context.permissions, 'ocr') ? this.prisma.ocrTask.findMany({
        where: { state: { in: ['PENDING', 'PROCESSING', 'REVIEW_REQUIRED', 'FAILED'] }, ...this.dateWhere(range, 'createdAt') },
        select: { id: true, taskId: true, taskName: true, fileNames: true, state: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }) : [],
      this.prisma.auditLog.findMany({ where: this.dateWhere(range, 'createdAt'), orderBy: { createdAt: 'desc' }, take: 5 }),
      this.rawConfig(),
      this.prisma.systemSetting.findUnique({ where: { key: `dashboard.reminders.${userId}` } }),
    ]);

    const income = transactions.filter((item: any) => item.type === 'INCOME' && item.processingStatus === 'INCLUDED').reduce((sum: number, item: any) => sum + Number(item.totalAmount), 0);
    const expense = transactions.filter((item: any) => item.type === 'EXPENSE' && item.processingStatus === 'INCLUDED').reduce((sum: number, item: any) => sum + Number(item.totalAmount), 0);
    const unconfirmedIncome = transactions.filter((item: any) => item.type === 'INCOME' && item.confirmationStatus === 'PENDING').reduce((sum: number, item: any) => sum + Number(item.totalAmount), 0);
    const pendingPayment = transactions.filter((item: any) => item.type === 'EXPENSE' && item.confirmationStatus === 'PENDING').reduce((sum: number, item: any) => sum + Number(item.totalAmount), 0);
    const ownerRemittance = settlements.reduce((sum: number, item: any) => sum + Number(item.remittanceAmount), 0);
    const reminderStates = reminderSetting?.value && typeof reminderSetting.value === 'object' ? reminderSetting.value as Record<string, string> : {};

    const unpaidContracts = dueContracts.filter((contract: any) => {
      if (!this.hasModule(context.permissions, 'finance')) return true;
      const dueDate = contract.nextDueDate ? new Date(contract.nextDueDate) : now;
      const paidForDueMonth = transactions
        .filter((item: any) => item.type === 'INCOME' && item.roomId === contract.roomId && item.confirmationStatus === 'CONFIRMED')
        .filter((item: any) => {
          const transactionDate = new Date(item.date);
          return transactionDate.getUTCFullYear() === dueDate.getUTCFullYear() && transactionDate.getUTCMonth() === dueDate.getUTCMonth();
        })
        .reduce((sum: number, item: any) => sum + Number(item.totalAmount), 0);
      return paidForDueMonth < Number(contract.monthlyRent || 0);
    });
    const rentReminders = unpaidContracts.map((contract: any) => ({
      id: `rent-${contract.id}`,
      type: contract.nextDueDate && contract.nextDueDate < now ? 'rentOverdue' : 'rentUnpaid',
      severity: contract.nextDueDate && contract.nextDueDate < now ? 'overdue' : 'warning',
      titleKey: contract.nextDueDate && contract.nextDueDate < now ? 'rentOverdue' : 'rentUnpaid',
      object: [contract.room.property.name, contract.room.roomNumber, contract.contractorName].filter(Boolean).join(' · '),
      dueDate: contract.nextDueDate,
      route: '/finance',
      state: reminderStates[`rent-${contract.id}`] || 'unread',
    }));
    const anomalyReminders = alerts.map((alert: any) => ({
      id: `alert-${alert.id}`,
      type: alert.alertType,
      severity: String(alert.severity).toLowerCase(),
      titleKey: 'propertyAbnormal',
      object: [alert.property?.name, alert.room?.roomNumber].filter(Boolean).join(' · ') || alert.alertType,
      dueDate: alert.occurredOn || alert.createdAt,
      route: '/resources',
      state: reminderStates[`alert-${alert.id}`] || 'unread',
    }));
    const propertyReminders = abnormalProperties.map((property: any) => ({
      id: `property-${property.id}`,
      type: 'propertyStatusAbnormal',
      severity: 'warning',
      titleKey: 'propertyStatusAbnormal',
      object: [property.name, property.managementStatus].filter(Boolean).join(' · '),
      dueDate: property.updatedAt,
      timeKey: 'updatedAt',
      route: '/resources',
      state: reminderStates[`property-${property.id}`] || 'unread',
    }));
    const contractReminders = expiringContracts.map((contract: any) => ({
      id: `contract-${contract.id}`,
      type: 'contractExpiring',
      severity: 'warning',
      titleKey: 'contractExpiring',
      object: [contract.room.property.name, contract.room.roomNumber, contract.contractorName].filter(Boolean).join(' · '),
      dueDate: contract.endDate,
      timeKey: 'due',
      route: '/contracts',
      state: reminderStates[`contract-${contract.id}`] || 'unread',
    }));
    const bankReminders = pendingBankTransactions.map((transaction: any) => ({
      id: `bank-${transaction.id}`,
      type: 'bankReconciliationPending',
      severity: transaction.reconciliationStatus === 'UNMATCHED' ? 'warning' : 'info',
      titleKey: 'bankReconciliationPending',
      object: [transaction.description, transaction.accountName, `¥${Number(transaction.amount).toLocaleString('ja-JP')}`].filter(Boolean).join(' · '),
      dueDate: transaction.bookedAt,
      timeKey: 'bookedAt',
      route: '/ai-reconciliation/bank',
      state: reminderStates[`bank-${transaction.id}`] || 'unread',
    }));
    const ocrReminders = pendingOcrTasks.map((task: any) => ({
      id: `ocr-${task.id}`,
      type: 'ocrTaskPending',
      severity: task.state === 'FAILED' ? 'critical' : task.state === 'REVIEW_REQUIRED' ? 'warning' : 'info',
      titleKey: task.state === 'FAILED' ? 'ocrTaskFailed' : task.state === 'REVIEW_REQUIRED' ? 'ocrReviewRequired' : 'ocrTaskPending',
      object: task.taskName || task.fileNames?.[0] || task.taskId,
      dueDate: task.updatedAt || task.createdAt,
      timeKey: 'updatedAt',
      route: '/ai-reconciliation/ocr',
      state: reminderStates[`ocr-${task.id}`] || 'unread',
    }));
    const severityRank: Record<string, number> = { overdue: 0, critical: 1, warning: 2, info: 3 };
    const reminders = [...rentReminders, ...propertyReminders, ...anomalyReminders, ...contractReminders, ...bankReminders, ...ocrReminders]
      .filter((item) => item.state !== 'ignored')
      .sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || new Date(a.dueDate || 0).getTime() - new Date(b.dueDate || 0).getTime());

    const metrics: Record<string, number> = {
      propertyCount,
      unpaidRentCount: rentReminders.length,
      activeContractCount,
      pendingReconciliationCount,
      pendingOcrCount,
    };
    const abnormalMetrics: Record<string, number> = {
      unpaidRentCount: rentReminders.length,
      pendingReconciliationCount,
      activeContractCount: expiringContractCount,
      propertyCount: abnormalPropertyCount,
      pendingOcrCount,
    };
    const cards = config
      .filter((card) => card.enabled && this.hasModule(context.permissions, card.moduleKey))
      .filter((card) => !card.visibleRoles.length || card.visibleRoles.some((role) => context.roles.includes(role)))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 4)
      .map((card) => ({
        ...card,
        value: metrics[card.metricKey] ?? 0,
        abnormalCount: card.showAbnormalCount ? abnormalMetrics[card.metricKey] ?? 0 : null,
      }));

    return {
      success: true,
      data: {
        dateRange: { startDate: range.startDate?.toISOString().slice(0, 10) || null, endDate: range.endDate?.toISOString().slice(0, 10) || null, label: range.label },
        cards,
        reminders,
        businessStatus: [
          ...(this.hasModule(context.permissions, 'property') ? [{ key: 'abnormalProperties', count: abnormalPropertyCount, route: '/resources', severity: abnormalPropertyCount ? 'warning' : 'normal', icon: 'building' }] : []),
          ...(this.hasModule(context.permissions, 'contract') ? [{ key: 'expiringContracts', count: expiringContractCount, route: '/contracts', severity: expiringContractCount ? 'warning' : 'normal', icon: 'users' }] : []),
          ...(this.hasModule(context.permissions, 'finance') ? [{ key: 'unpaidRent', count: rentReminders.length, route: '/finance', severity: rentReminders.length ? 'critical' : 'normal', icon: 'finance' }] : []),
          ...(this.hasModule(context.permissions, 'reconciliation') ? [{ key: 'pendingBank', count: pendingReconciliationCount, route: '/ai-reconciliation/bank', severity: pendingReconciliationCount ? 'warning' : 'normal', icon: 'search' }] : []),
          ...(this.hasModule(context.permissions, 'ocr') ? [{ key: 'pendingOcr', count: pendingOcrCount, route: '/ai-reconciliation/ocr', severity: pendingOcrCount ? 'warning' : 'normal', icon: 'search' }] : []),
        ],
        financialSummary: this.hasModule(context.permissions, 'finance') ? { income, expense, balance: income - expense, ownerRemittance, unconfirmedIncome, pendingPayment } : null,
        recentActivities: context.permissions.includes('audit_log:view') ? activities.map((item: any) => ({ id: item.id, type: item.action, object: `${item.entityType}${item.entityId ? ` · ${item.entityId}` : ''}`, operator: item.actorUserId || '—', timestamp: item.createdAt, route: '/' })) : [],
        canEditConfig: context.permissions.includes('dashboard:config'),
      },
    };
  }
}
