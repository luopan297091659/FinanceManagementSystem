import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type TranslationImportRow = {
  key?: string;
  module?: string;
  description?: string;
  enabled?: boolean | string;
  'ja-JP'?: string;
  'zh-CN'?: string;
};

const SUPPORTED_LOCALES = ['ja-JP', 'zh-CN'] as const;
const BUILTIN_VERSION = 'builtin';

@Injectable()
export class I18nService {
  constructor(private readonly prisma: PrismaService) {}

  locales() {
    return {
      defaultLocale: 'ja-JP',
      locales: SUPPORTED_LOCALES,
      fallbackOrder: ['user-locale', 'ja-JP', 'builtin'],
    };
  }

  async publishedTranslations(locale: string, version?: string) {
    const targetLocale = this.normalizeLocale(locale);
    const publishedVersion = version || await this.safeLatestPublishedVersion();
    if (!publishedVersion) return { locale: targetLocale, version: BUILTIN_VERSION, translations: {} };

    const entries = await this.safeTranslationEntries(() => this.prisma.translationEntry.findMany({
      where: {
        locale: targetLocale,
        version: publishedVersion,
        status: 'PUBLISHED',
        enabled: true,
      },
      orderBy: { key: 'asc' },
    }), []);

    return {
      locale: targetLocale,
      version: publishedVersion,
      translations: Object.fromEntries(entries.map((entry) => [entry.key, entry.value])),
    };
  }

  async listAdmin(query: { locale?: string; module?: string; key?: string; status?: string }) {
    return this.safeTranslationEntries(() => this.prisma.translationEntry.findMany({
      where: {
        locale: query.locale || undefined,
        module: query.module || undefined,
        status: this.normalizeStatus(query.status),
        key: query.key ? { contains: query.key, mode: 'insensitive' } : undefined,
      },
      orderBy: [{ updatedAt: 'desc' }, { key: 'asc' }],
      take: 500,
    }), []);
  }

  async createEntry(body: any, actorUserId?: string) {
    const payload = this.normalizeEntryPayload(body);
    const entry = await this.prisma.translationEntry.create({
      data: {
        ...payload,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    await this.log(actorUserId, 'i18n.translation.create', entry.id, undefined, entry);
    return entry;
  }

  async updateEntry(id: string, body: any, actorUserId?: string) {
    const before = await this.prisma.translationEntry.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Translation entry not found');
    const payload = this.normalizeEntryPatch(body);
    const after = await this.prisma.translationEntry.update({
      where: { id },
      data: { ...payload, updatedBy: actorUserId },
    });
    await this.log(actorUserId, 'i18n.translation.update', id, before, after);
    return after;
  }

  async importPreview(rows: TranslationImportRow[], version = this.createVersion()) {
    if (!rows.length) throw new BadRequestException('No translation rows provided');
    const duplicates = new Set<string>();
    const seen = new Set<string>();
    const normalized = rows.map((row, index) => {
      const key = String(row.key || '').trim();
      const module = String(row.module || '').trim();
      const errors: string[] = [];
      if (!key) errors.push('key is required');
      if (!module) errors.push('module is required');
      for (const locale of SUPPORTED_LOCALES) {
        if (!String(row[locale as keyof TranslationImportRow] || '').trim()) errors.push(`${locale} is required`);
      }
      for (const locale of SUPPORTED_LOCALES) {
        const signature = `${key}:${locale}:${version}`;
        if (seen.has(signature)) duplicates.add(signature);
        seen.add(signature);
      }
      return { rowNumber: index + 1, key, module, version, errors, row };
    });

    return {
      version,
      rows: normalized,
      duplicateCount: duplicates.size,
      validCount: normalized.filter((row) => !row.errors.length).length,
      failedCount: normalized.filter((row) => row.errors.length).length,
    };
  }

  async importCommit(rows: TranslationImportRow[], options: { version?: string; mode?: 'create' | 'overwrite' | 'skip'; publish?: boolean } = {}, actorUserId?: string) {
    const version = options.version || this.createVersion();
    const mode = options.mode || 'skip';
    const preview = await this.importPreview(rows, version);
    if (preview.failedCount) throw new BadRequestException('Import contains invalid rows; preview and fix before committing');

    const result = { inserted: 0, updated: 0, skipped: 0, failed: 0, version };
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const key = String(row.key).trim();
        const module = String(row.module).trim();
        for (const locale of SUPPORTED_LOCALES) {
          const value = String(row[locale as keyof TranslationImportRow] || '').trim();
          const existing = await tx.translationEntry.findUnique({
            where: { key_locale_version: { key, locale, version } },
          });
          if (existing && mode === 'skip') {
            result.skipped += 1;
            continue;
          }
          if (existing && mode === 'overwrite') {
            await tx.translationEntry.update({
              where: { id: existing.id },
              data: {
                value,
                module,
                description: row.description,
                enabled: this.parseEnabled(row.enabled),
                updatedBy: actorUserId,
              },
            });
            result.updated += 1;
            continue;
          }
          if (!existing) {
            await tx.translationEntry.create({
              data: {
                key,
                module,
                locale,
                value,
                version,
                description: row.description,
                enabled: this.parseEnabled(row.enabled),
                status: 'DRAFT',
                createdBy: actorUserId,
                updatedBy: actorUserId,
              },
            });
            result.inserted += 1;
          }
        }
      }
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: 'i18n.translation.import',
          entityType: 'TranslationEntry',
          after: result,
        },
      });
    });
    if (options.publish) await this.publish(version, actorUserId);
    return { ...result, published: Boolean(options.publish) };
  }

  async exportEntries(query: { locale?: string; module?: string; version?: string }) {
    return this.safeTranslationEntries(() => this.prisma.translationEntry.findMany({
      where: {
        locale: query.locale || undefined,
        module: query.module || undefined,
        version: query.version || undefined,
      },
      orderBy: [{ key: 'asc' }, { locale: 'asc' }],
    }), []);
  }

  async publish(version: string, actorUserId?: string) {
    if (!version) throw new BadRequestException('version is required');
    const count = await this.prisma.translationEntry.count({ where: { version } });
    if (!count) throw new NotFoundException('Translation version not found');
    await this.prisma.$transaction([
      this.prisma.translationEntry.updateMany({ where: { status: 'PUBLISHED' }, data: { status: 'DRAFT' } }),
      this.prisma.translationEntry.updateMany({ where: { version, enabled: true }, data: { status: 'PUBLISHED', updatedBy: actorUserId } }),
      this.prisma.auditLog.create({
        data: {
          actorUserId,
          action: 'i18n.translation.publish',
          entityType: 'TranslationEntry',
          entityId: version,
          after: { version },
        },
      }),
    ]);
    return { ok: true, version };
  }

  async versions() {
    const versions = await this.safeTranslationEntries(() => this.prisma.translationEntry.groupBy({
      by: ['version', 'status'],
      _count: { _all: true },
      orderBy: { version: 'desc' },
    }), []);
    return versions.map((item) => ({ version: item.version, status: item.status, count: item._count._all }));
  }

  async rollback(version: string, actorUserId?: string) {
    return this.publish(version, actorUserId);
  }

  private normalizeEntryPayload(body: any) {
    const payload = this.normalizeEntryPatch(body);
    if (!payload.key || !payload.module || !payload.locale || !payload.value) {
      throw new BadRequestException('key, module, locale, and value are required');
    }
    return {
      key: payload.key,
      module: payload.module,
      locale: payload.locale,
      value: payload.value,
      description: payload.description,
      version: payload.version || this.createVersion(),
      status: payload.status || 'DRAFT',
      enabled: payload.enabled ?? true,
    };
  }

  private normalizeEntryPatch(body: any) {
    return {
      key: body.key ? String(body.key).trim() : undefined,
      module: body.module ? String(body.module).trim() : undefined,
      locale: body.locale ? this.normalizeLocale(String(body.locale)) : undefined,
      value: body.value !== undefined ? String(body.value) : undefined,
      description: body.description !== undefined ? String(body.description) : undefined,
      version: body.version ? String(body.version).trim() : undefined,
      status: this.normalizeStatus(body.status),
      enabled: body.enabled !== undefined ? this.parseEnabled(body.enabled) : undefined,
    };
  }

  private normalizeLocale(locale: string): (typeof SUPPORTED_LOCALES)[number] {
    const aliases: Record<string, string> = { ja: 'ja-JP', zh: 'zh-CN' };
    const normalized = aliases[locale] || locale;
    return SUPPORTED_LOCALES.includes(normalized as (typeof SUPPORTED_LOCALES)[number])
      ? normalized as (typeof SUPPORTED_LOCALES)[number]
      : 'ja-JP';
  }

  private normalizeStatus(status?: string) {
    if (!status) return undefined;
    return ['DRAFT', 'PUBLISHED', 'DISABLED'].includes(status) ? status as any : undefined;
  }

  private parseEnabled(value: unknown) {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'boolean') return value;
    return String(value).toLowerCase() !== 'false';
  }

  private createVersion() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '.') + '.1';
  }

  private async latestPublishedVersion() {
    const latest = await this.prisma.translationEntry.findFirst({
      where: { status: 'PUBLISHED', enabled: true },
      orderBy: { updatedAt: 'desc' },
      select: { version: true },
    });
    return latest?.version;
  }

  private isMissingDatabaseObject(error: unknown) {
    const code = (error as { code?: string })?.code;
    return code === 'P2021' || code === 'P2022';
  }

  private async safeTranslationEntries<T>(query: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await query();
    } catch (error) {
      if (this.isMissingDatabaseObject(error)) return fallback;
      throw error;
    }
  }

  private async safeLatestPublishedVersion() {
    return this.safeTranslationEntries(() => this.latestPublishedVersion(), undefined);
  }

  private async log(actorUserId: string | undefined, action: string, entityId: string, before: unknown, after: unknown) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId,
        action,
        entityType: 'TranslationEntry',
        entityId,
        before: before ? this.toJson(before) : undefined,
        after: this.toJson(after),
      },
    });
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
