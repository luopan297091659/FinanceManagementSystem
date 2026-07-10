import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  projectName!: string;

  @IsString()
  buildingName!: string;

  @IsOptional()
  @IsString()
  buildingLatitude?: string;

  @IsOptional()
  @IsString()
  buildingLongitude?: string;

  @IsString()
  roomNumber!: string;

  @IsString()
  houseNumber!: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  roomLatitude?: string;

  @IsOptional()
  @IsString()
  roomLongitude?: string;

  @IsOptional()
  @IsIn(['VACANT', 'OCCUPIED', 'OVERDUE', 'INACTIVE', 'MAINTENANCE'])
  status?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
