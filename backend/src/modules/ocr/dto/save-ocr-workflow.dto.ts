import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class SaveOcrWorkflowDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUrl({ require_tld: false })
  webhookUrl!: string;

  @IsUrl({ require_tld: false })
  callbackUrl!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
