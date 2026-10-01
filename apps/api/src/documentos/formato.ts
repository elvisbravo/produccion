import { formatearCelular, NOMBRE_TIPO_DOCUMENTO, type TipoDocumento } from '@grupoes/shared';

/** Nombre completo; si aún no se registró, el celular. */
export const nombrePersona = (p: { nombres: string | null; apellidos: string | null; celular: string }) =>
  [p.nombres, p.apellidos].filter(Boolean).join(' ') || formatearCelular(p.celular);

/** "DNI 45678912" o null si no tiene documento. */
export const documentoPersona = (p: { tipoDocumento: TipoDocumento | null; numeroDocumento: string | null }) =>
  p.tipoDocumento && p.numeroDocumento ? `${NOMBRE_TIPO_DOCUMENTO[p.tipoDocumento]} ${p.numeroDocumento}` : null;
