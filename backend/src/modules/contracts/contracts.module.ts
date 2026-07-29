import { Module } from '@nestjs/common';
import { ContractsController, IntegratedImportController, LinkedContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  controllers: [ContractsController, IntegratedImportController, LinkedContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
