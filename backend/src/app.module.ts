import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { BankTransactionsModule } from './modules/bank-transactions/bank-transactions.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { AnomaliesModule } from './modules/anomalies/anomalies.module';
import { GisModule } from './modules/gis/gis.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { FilesModule } from './modules/files/files.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { AuditModule } from './modules/audit/audit.module';
import { FrontendApiModule } from './modules/frontend-api/frontend-api.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    PropertiesModule,
    RoomsModule,
    TenantsModule,
    ContractsModule,
    TransactionsModule,
    BankTransactionsModule,
    ReconciliationModule,
    AnomaliesModule,
    GisModule,
    StatisticsModule,
    FilesModule,
    OcrModule,
    AuditModule,
    FrontendApiModule,
    RbacModule,
    I18nModule,
    DashboardModule,
  ],
})
export class AppModule {}
