import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const EMAIL_SETTINGS_KEY = 'email_settings';
const MASKED_PASSWORD = '********';
const nodemailer = require('nodemailer');

type EmailSettings = {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: boolean;
  from_name: string;
  daily_limit: number;
};

type PublicEmailSettings = Omit<EmailSettings, 'smtp_pass'> & {
  smtp_pass: string;
};

@Injectable()
export class EmailSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private defaults(): EmailSettings {
    return {
      smtp_host: process.env.SMTP_HOST || 'smtp.aliyun.com',
      smtp_port: Number(process.env.SMTP_PORT || 465),
      smtp_user: process.env.SMTP_USER || '',
      smtp_pass: process.env.SMTP_PASS || '',
      smtp_secure: (process.env.SMTP_SECURE || 'true') !== 'false',
      from_name: process.env.SMTP_FROM_NAME || '房产管理平台',
      daily_limit: Number(process.env.SMTP_DAILY_LIMIT || 200),
    };
  }

  private cleanString(value: unknown, fallback = '') {
    return String(value ?? fallback).trim();
  }

  private normalize(raw: unknown): EmailSettings {
    const defaults = this.defaults();
    const value = raw && typeof raw === 'object' ? raw as Partial<EmailSettings> : {};
    return {
      smtp_host: this.cleanString(value.smtp_host, defaults.smtp_host),
      smtp_port: Number(value.smtp_port || defaults.smtp_port),
      smtp_user: this.cleanString(value.smtp_user, defaults.smtp_user),
      smtp_pass: this.cleanString(value.smtp_pass, defaults.smtp_pass),
      smtp_secure: value.smtp_secure ?? defaults.smtp_secure,
      from_name: this.cleanString(value.from_name, defaults.from_name),
      daily_limit: Number(value.daily_limit || defaults.daily_limit),
    };
  }

  private toPublic(settings: EmailSettings): PublicEmailSettings {
    return {
      ...settings,
      smtp_pass: settings.smtp_pass ? MASKED_PASSWORD : '',
    };
  }

  async getSettings() {
    const row = await this.safeSystemSetting();
    const settings = this.normalize(row?.value);
    const sentToday = await this.safePasswordResetCount();
    return { email_settings: this.toPublic(settings), sent_today: sentToday };
  }

  async saveSettings(payload: Partial<EmailSettings>) {
    const current = await this.getRawSettings();
    const next = this.normalize({
      ...current,
      ...payload,
      smtp_pass: payload.smtp_pass && payload.smtp_pass !== MASKED_PASSWORD ? payload.smtp_pass : current.smtp_pass,
    });
    if (!next.smtp_host) throw new BadRequestException('SMTP 主机不能为空');
    if (!next.smtp_port || next.smtp_port < 1) throw new BadRequestException('SMTP 端口无效');

    await this.prisma.systemSetting.upsert({
      where: { key: EMAIL_SETTINGS_KEY },
      update: { value: next },
      create: { key: EMAIL_SETTINGS_KEY, value: next, description: 'SMTP email settings' },
    });
    return { success: true, email_settings: this.toPublic(next) };
  }

  async getRawSettings() {
    const row = await this.safeSystemSetting();
    return this.normalize(row?.value);
  }

  private isMissingDatabaseObject(error: unknown) {
    const code = (error as { code?: string })?.code;
    return code === 'P2021' || code === 'P2022';
  }

  private async safeSystemSetting() {
    try {
      return await this.prisma.systemSetting.findUnique({ where: { key: EMAIL_SETTINGS_KEY } });
    } catch (error) {
      if (this.isMissingDatabaseObject(error)) return null;
      throw error;
    }
  }

  private async safePasswordResetCount() {
    try {
      return await this.countPasswordResetTokensToday();
    } catch (error) {
      if (this.isMissingDatabaseObject(error)) return 0;
      throw error;
    }
  }

  private async countPasswordResetTokensToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.passwordResetToken.count({ where: { createdAt: { gte: today } } });
  }

  private formatMailError(error: unknown) {
    const mailError = error as { code?: string; responseCode?: number; response?: string; message?: string };
    const detail = mailError.response || mailError.message || '未知错误';
    if (mailError.code === 'EAUTH' || mailError.responseCode === 535 || /authentication failed|invalid login/i.test(detail)) {
      return new BadRequestException('SMTP 认证失败：请检查 SMTP 账号和授权码/密码是否正确。注意多数邮箱需要使用“客户端授权码”，不是登录密码。');
    }
    return new BadRequestException(`邮件发送失败：${detail}`);
  }

  private async createTransporter() {
    const settings = await this.getRawSettings();
    if (!settings.smtp_user || !settings.smtp_pass) {
      throw new BadRequestException('邮件服务未配置，请先设置 SMTP 账号和密码');
    }
    const sentToday = await this.countPasswordResetTokensToday();
    if (sentToday >= settings.daily_limit) {
      throw new BadRequestException('今日邮件发送已达上限，请明日再试');
    }
    return {
      settings,
      transporter: nodemailer.createTransport({
        host: settings.smtp_host,
        port: settings.smtp_port,
        secure: settings.smtp_secure,
        auth: { user: settings.smtp_user, pass: settings.smtp_pass },
      }),
    };
  }

  async sendPasswordResetEmail(to: string, token: string) {
    const { settings, transporter } = await this.createTransporter();
    try {
      await transporter.sendMail({
        from: `"${settings.from_name}" <${settings.smtp_user}>`,
        to: to.trim(),
        subject: '【房产管理平台】密码重置',
        text: `您正在重置房产管理平台密码。\n\n重置令牌：${token}\n\n令牌 30 分钟内有效。如非本人操作，请忽略此邮件。`,
        html: `
          <div style="max-width:520px;margin:0 auto;font-family:Arial,sans-serif;color:#1f2937;">
            <h2 style="color:#0f766e;">房产管理平台 - 密码重置</h2>
            <p>您正在重置房产管理平台密码，请使用下方令牌完成验证。</p>
            <div style="font-size:18px;font-weight:700;word-break:break-all;background:#ecfdf5;padding:14px 16px;border-radius:8px;margin:16px 0;color:#0f766e;">${token}</div>
            <p>令牌 30 分钟内有效。如非本人操作，请忽略此邮件。</p>
          </div>
        `,
      });
    } catch (error) {
      throw this.formatMailError(error);
    }
  }

  async sendTestEmail(to: string) {
    const recipient = to.trim();
    if (!recipient) throw new BadRequestException('测试邮箱不能为空');
    const { settings, transporter } = await this.createTransporter();
    try {
      await transporter.sendMail({
        from: `"${settings.from_name}" <${settings.smtp_user}>`,
        to: recipient,
        subject: '【房产管理平台】邮件配置测试',
        text: '如果您收到这封邮件，说明 SMTP 邮件配置已经生效。',
        html: '<div style="font-family:Arial,sans-serif;color:#1f2937;"><h2 style="color:#0f766e;">邮件配置测试成功</h2><p>如果您收到这封邮件，说明 SMTP 邮件配置已经生效。</p></div>',
      });
    } catch (error) {
      throw this.formatMailError(error);
    }
    return { success: true };
  }
}
