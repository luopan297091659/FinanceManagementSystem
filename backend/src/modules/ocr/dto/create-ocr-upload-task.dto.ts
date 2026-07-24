import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateOcrUploadTaskDto {
  @IsString()
  @IsNotEmpty()
  taskName: string;

  @IsUrl()
  @IsNotEmpty()
  webhookUrl: string;

  @IsUrl()
  @IsNotEmpty()
  callbackUrl: string;
}
