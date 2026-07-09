import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateBindingDto {
  @IsIn(['tenant', 'owner'])
  kind!: 'tenant' | 'owner';

  @IsString()
  roomId!: string;

  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'ENDED', 'PENDING'])
  status?: string;
}
