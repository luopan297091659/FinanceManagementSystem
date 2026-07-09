import { Module } from '@nestjs/common';
import { FrontendApiController } from './frontend-api.controller';
import { FrontendApiService } from './frontend-api.service';

@Module({
  controllers: [FrontendApiController],
  providers: [FrontendApiService],
})
export class FrontendApiModule {}
