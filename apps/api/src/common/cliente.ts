import type { Request } from 'express';

export interface InfoCliente {
  ip: string | null;
  dispositivo: string | null;
}

export function infoCliente(req: Request): InfoCliente {
  return {
    ip: req.ip ?? null,
    dispositivo: req.headers['user-agent']?.slice(0, 255) ?? null,
  };
}
