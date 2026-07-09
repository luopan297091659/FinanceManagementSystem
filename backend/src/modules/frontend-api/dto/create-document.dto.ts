import { IsOptional, IsString } from 'class-validator';

export class CreateDocumentDto {
  @IsOptional()
  @IsString()
  roomId?: string;

  @IsString()
  documentType!: string;

  @IsString()
  fileName!: string;

  @IsOptional()
  @IsString()
  extractedText?: string;
}
