import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateOcrTaskDto {
  @IsString()
  @IsNotEmpty()
  taskName: string;

  @IsUrl()
  @IsNotEmpty()
  webhookUrl: string;

  @IsUrl()
  @IsNotEmpty()
  callbackUrl: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  fileNames: string[];
}
