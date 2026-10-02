import { ForbiddenException } from '@nestjs/common';

/** El error de quien intenta mover algo de un trabajo con fechas fijas. */
export const errorFechasFijas = (t: { codigo: string; fechasFijasMotivo: string | null }) =>
  new ForbiddenException(`Las fechas de ${t.codigo} están fijadas (${t.fechasFijasMotivo ?? 'por prioridad'}). Si de verdad deben cambiar, libéralas primero.`);
