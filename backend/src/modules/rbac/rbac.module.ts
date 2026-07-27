import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RbacService } from './rbac.service';
import { RbacController } from './rbac.controller';
import { RbacGuard } from './rbac.guard';
import { AuthMiddleware } from './auth.middleware';
import { EmailSettingsService } from './email-settings.service';

@Module({
  controllers: [RbacController],
  providers: [RbacService, EmailSettingsService, { provide: APP_GUARD, useClass: RbacGuard }],
  exports: [RbacService],
})
export class RbacModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes('*');
  }
}
