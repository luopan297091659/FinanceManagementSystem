import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateCustomerDto {
  @IsIn(['tenant', 'owner'])
  kind!: 'tenant' | 'owner';

  @IsOptional()
  @IsIn(['PERSON', 'COMPANY'])
  ownerType?: 'PERSON' | 'COMPANY';

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  kana?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  annualIncome?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  attachments?: string;
}
