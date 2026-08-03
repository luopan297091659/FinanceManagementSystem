import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateOcrUploadTaskDto {
  @IsString()
  @IsNotEmpty()
  taskName!: string;

  @IsString()
  @IsNotEmpty()
  workflowId!: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}
