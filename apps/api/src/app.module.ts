import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { validarEnv } from './config/env.js';
import { ParametrosModule } from './parametros/parametros.module.js';
import { PermisosModule } from './permisos/permisos.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SaludController } from './salud/salud.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnv }),
    PrismaModule,
    ParametrosModule,
    PermisosModule,
    AuthModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
