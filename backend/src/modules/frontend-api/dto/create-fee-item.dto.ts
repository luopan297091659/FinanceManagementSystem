import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateFeeItemDto {
  @IsString()
  name!: string;

  @IsIn(['income', 'expense', 'both'])
  category!: 'income' | 'expense' | 'both';

  @IsIn(['Money', 'Number', 'Text', 'Date'])
  valueType!: 'Money' | 'Number' | 'Text' | 'Date';

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
