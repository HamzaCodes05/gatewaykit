import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '1mb' }));
  // The dashboard origin is restricted; API-key clients are server-side and unaffected by CORS.
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', exposedHeaders: ['Retry-After'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(4000);
}
bootstrap();
