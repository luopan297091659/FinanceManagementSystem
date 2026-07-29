import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateRoomDto {
  @IsOptional()
  @IsString()
  buildingId?: string;

  @IsOptional()
  @IsString()
  projectName?: string;

  @IsString()
  buildingName!: string;

  @IsOptional()
  @IsString()
  propertyCode?: string;

  @IsOptional()
  @IsString()
  buildingNameKana?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  prefecture?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsString()
  buildingType?: string;

  @IsOptional()
  @IsString()
  propertyUsageType?: string;

  @IsOptional()
  @IsString()
  managementStatus?: string;

  @IsOptional()
  @IsString()
  propertyRemark?: string;

  @IsOptional()
  @IsString()
  buildingLatitude?: string;

  @IsOptional()
  @IsString()
  buildingLongitude?: string;

  @IsString()
  roomNumber!: string;

  @IsOptional()
  @IsString()
  roomCode?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  unitType?: string;

  @IsOptional()
  @IsString()
  roomUsageType?: string;

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
  floorLabel?: string;

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

  @IsOptional()
  @IsString()
  roomRemark?: string;
}
