import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class CreateTransactionDetailDto {
  @IsString()
  feeItemId!: string;

  @IsString()
  value!: string;
}

export class CreateTransactionDto {
  @IsIn(['income', 'expense'])
  type!: 'income' | 'expense';

  @IsString()
  date!: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  counterparty?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sequenceNo?: number;

  @IsOptional()
  @IsString()
  fileType?: string;

  @IsOptional()
  @IsString()
  counterpartyRaw?: string;

  @IsOptional()
  @IsString()
  contentSummary?: string;

  @IsOptional()
  @IsString()
  fileAmount?: string;

  @IsOptional()
  @IsString()
  transferFeeAmount?: string;

  @IsOptional()
  @IsString()
  statisticalAmount?: string;

  @IsOptional()
  @IsString()
  evidenceDateType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourcePageStart?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sourcePageEnd?: number;

  @IsOptional()
  @IsIn(['INCLUDED', 'DETAIL_ONLY', 'DUPLICATE_EXCLUDED'])
  processingStatus?: 'INCLUDED' | 'DETAIL_ONLY' | 'DUPLICATE_EXCLUDED';

  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'REJECTED'])
  confirmationStatus?: 'PENDING' | 'CONFIRMED' | 'REJECTED';

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionDetailDto)
  details!: CreateTransactionDetailDto[];
}
