import { Module } from '@nestjs/common';
import { AuditoriaController, ParametrosController, RolesController, UsuariosController } from './administracion.controller.js';
import { RolesService } from './roles.service.js';
import { UsuariosService } from './usuarios.service.js';

/** Usuarios, roles y permisos, parámetros y auditoría. */
@Module({
  controllers: [UsuariosController, RolesController, ParametrosController, AuditoriaController],
  providers: [UsuariosService, RolesService],
})
export class AdministracionModule {}
