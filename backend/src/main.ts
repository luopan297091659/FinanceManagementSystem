import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const projectRoot = join(__dirname, '..', '..');

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? true,
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useStaticAssets(join(projectRoot, 'src'), { prefix: '/src' });

  const express = app.getHttpAdapter().getInstance() as {
    get(path: string, handler: (request: unknown, response: { sendFile(path: string): void }) => void): void;
  };
  express.get('/', (_request, response) => {
    response.sendFile(join(projectRoot, 'index.html'));
  });

  await app.listen(config.get<number>('PORT') ?? 3000);
}

void bootstrap();
