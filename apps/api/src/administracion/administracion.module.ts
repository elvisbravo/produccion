import { Module } from '@nestjs/common';
import { AuditoriaController, ModulosController, ParametrosController, RolesController, UsuariosController } from './administracion.controller.js';
import { ModulosService } from './modulos.service.js';
import { RolesService } from './roles.service.js';
import { UsuariosService } from './usuarios.service.js';

/** Usuarios, roles y permisos, parámetros y auditoría. */
@Module({
  controllers: [UsuariosController, RolesController, ModulosController, ParametrosController, AuditoriaController],
  providers: [UsuariosService, RolesService, ModulosService],
})
export class AdministracionModule {}
