import { Global, Module } from '@nestjs/common';
import { PermisosService } from './permisos.service.js';

@Global()
@Module({
  providers: [PermisosService],
  exports: [PermisosService],
})
export class PermisosModule {}
