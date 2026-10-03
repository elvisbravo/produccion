import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env.js';

/** Configuración común de la app (la usan main.ts y las pruebas e2e). */
export function configurarApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService<Env, true>);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // Detrás de uno o más proxies (Nginx, Caddy) para que req.ip sea la IP real del cliente.
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));

  if (config.get('NODE_ENV', { infer: true }) === 'production') {
    app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });
  }
}
