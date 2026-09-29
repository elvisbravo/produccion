import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configurarApp } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configurarApp(app);
  app.enableShutdownHooks();

  const puerto = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(puerto);
  Logger.log(`API escuchando en http://localhost:${puerto}/api`, 'Bootstrap');
}
await bootstrap();
