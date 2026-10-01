import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdministracionModule } from './administracion/administracion.module.js';
import { AgendaModule } from './agenda/agenda.module.js';
import { AuthModule } from './auth/auth.module.js';
import { NotificacionesModule } from './notificaciones/notificaciones.module.js';
import { RecordatoriosModule } from './recordatorios/recordatorios.module.js';
import { ReportesModule } from './reportes/reportes.module.js';
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
    NotificacionesModule,
    ScheduleModule.forRoot(),
    CatalogosModule,
    PersonasModule,
    ProspectosModule,
    TrabajosModule,
    AgendaModule,
    RecordatoriosModule,
    AdministracionModule,
    ReportesModule,
  ],
  controllers: [SaludController],
})
export class AppModule {}
