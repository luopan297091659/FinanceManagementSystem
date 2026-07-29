import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { PropertyImportService } from './property-import.service';

@Module({
  controllers: [PropertiesController],
  providers: [PropertiesService, PropertyImportService],
  exports: [PropertiesService, PropertyImportService],
})
export class PropertiesModule {}
