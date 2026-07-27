import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      console.warn('[PrismaService] DATABASE_URL is not set. Skipping database connection.');
      return;
    }

    try {
      await this.$connect();
    } catch (error) {
      console.warn('[PrismaService] Failed to connect to database:', error);
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (error) {
      console.warn('[PrismaService] Failed to disconnect from database:', error);
    }
  }
}
