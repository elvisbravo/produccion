import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CatalogosModule } from './catalogos/catalogos.module.js';
import { CommonModule } from './common/common.module.js';
import { validarEnv } from './config/env.js';
import { ParametrosModule } from './parametros/parametros.module.js';
import { PermisosModule } from './permisos/permisos.module.js';
import { PersonasModule } from './personas/personas.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProspectosModule } from './prospectos/prospectos.module.js';
import { TrabajosModule } from './trabajos/trabajos.module.js';
import { SaludController } from './salud/salud.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validarEnv }),
    PrismaModule,
    CommonModule,
    ParametrosModule,
    PermisosModule,
    AuthModule,
    CatalogosModule,
    PersonasModule,
    ProspectosModule,
    TrabajosModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
