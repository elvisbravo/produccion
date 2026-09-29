import { SetMetadata } from '@nestjs/common';
import type { PermisoCodigo } from '@grupoes/shared';

export const PERMISO_KEY = 'permiso';

/**
 * Exige un permiso para acceder al endpoint.
 * El alcance concedido queda en `req.alcance` para filtrar los datos.
 */
export const RequierePermiso = (permiso: PermisoCodigo) => SetMetadata(PERMISO_KEY, permiso);
