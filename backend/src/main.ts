import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Request, Response } from 'express';
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
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/api/v1/health', (_req: any, res: any) => {
    res.json({
      status: 'ok',
      service: 'finance-management-backend',
      timestamp: new Date().toISOString(),
    });
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useStaticAssets(join(projectRoot, 'dist', 'assets'), {
    prefix: '/assets',
    maxAge: '1y',
    immutable: true,
  });
  app.useStaticAssets(join(projectRoot, 'dist'), {
    prefix: '/',
    index: false,
    setHeaders: (response: Response, filePath: string) => {
      if (filePath.endsWith('index.html')) {
        response.setHeader('Cache-Control', 'no-store');
      }
    },
  });
  app.useStaticAssets(join(projectRoot, 'src'), { prefix: '/src' });

  const express = app.getHttpAdapter().getInstance();
  const sendIndex = (_request: Request, response: Response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.sendFile(join(projectRoot, 'dist/index.html'));
  };
  express.get('/', sendIndex);
  express.get(/^\/(?!api\/v1\/|assets\/|src\/).*/, sendIndex);

  await app.listen(config.get<number>('PORT') ?? 8006);
}

void bootstrap();
