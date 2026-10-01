import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { capitalizarNombre, fechaDeConsultaDni, type DatosDni, type ResultadoConsultaDni } from '@grupoes/shared';
import type { Env } from '../config/env.js';
import { AuditoriaService } from '../common/auditoria.service.js';

/** El servicio externo llega a tardar minutos en fallar: aquí se espera poco y se deja completar a mano. */
const TIEMPO_MAXIMO_MS = 8_000;
/** Por persona: evita usar el sistema como buscador de DNI ajenos. */
const MAX_CONSULTAS = 30;
const VENTANA_MS = 10 * 60_000;

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Busca un DNI en el servicio externo de la empresa. Nunca lanza por fallas del servicio:
 * devuelve "no_disponible" o "no_encontrado" y el formulario se completa a mano.
 */
@Injectable()
export class ConsultaDniService {
  private readonly logger = new Logger(ConsultaDniService.name);
  private readonly usos = new Map<string, number[]>();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly auditoria: AuditoriaService,
  ) {}

  private limitar(usuarioId: string) {
    const ahora = Date.now();
    const recientes = (this.usos.get(usuarioId) ?? []).filter((t) => ahora - t < VENTANA_MS);
    if (recientes.length >= MAX_CONSULTAS) {
      throw new HttpException(`Hiciste demasiadas consultas de DNI. Espera unos minutos o ingresa los datos a mano.`, HttpStatus.TOO_MANY_REQUESTS);
    }
    this.usos.set(usuarioId, [...recientes, ahora]);
  }

  async consultar(dni: string, actor: { usuarioId: string; ip: string | null }): Promise<ResultadoConsultaDni> {
    this.limitar(actor.usuarioId);
    const resultado = await this.pedir(dni);
    // Se deja constancia de que se consultó, sin guardar el número.
    await this.auditoria.registrar({ usuarioId: actor.usuarioId, accion: 'consultar_dni', entidad: 'persona', despues: { resultado: resultado.estado }, ip: actor.ip });
    return resultado;
  }

  private async pedir(dni: string): Promise<ResultadoConsultaDni> {
    const base = this.config.get('DNI_API_URL', { infer: true }).replace(/\/+$/, '');
    let cuerpo: unknown;
    try {
      const respuesta = await fetch(`${base}/${dni}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
      cuerpo = await respuesta.json();
    } catch (e) {
      this.logger.warn(`Consulta de DNI sin respuesta: ${(e as Error).name}`);
      return { estado: 'no_disponible' };
    }
    return this.interpretar(cuerpo, dni);
  }

  /** Solo se confía en una respuesta "ok" que trae el mismo DNI y nombres; el resto, según el tipo de falla. */
  private interpretar(cuerpo: unknown, dni: string): ResultadoConsultaDni {
    const r = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>;
    const d = (r.data && typeof r.data === 'object' ? r.data : null) as Record<string, unknown> | null;

    if (r.respuesta === 'ok' && r.encontrado === true && d) {
      const api = (d.api && typeof d.api === 'object' ? d.api : {}) as Record<string, unknown>;
      const nombres = texto(d.nombres);
      const apellidos = [texto(d.ap_paterno), texto(d.ap_materno)].filter(Boolean).join(' ');
      if (texto(d.dni) !== dni || !nombres || !apellidos) {
        this.logger.warn('Consulta de DNI: la respuesta no coincide con lo pedido');
        return { estado: 'no_disponible' };
      }
      const datos: DatosDni = {
        nombres: capitalizarNombre(nombres),
        apellidos: capitalizarNombre(apellidos),
        fechaNacimiento: fechaDeConsultaDni(d.fecha_nacimiento) ?? fechaDeConsultaDni(api.fec_nacimiento),
      };
      return { estado: 'encontrado', datos };
    }
    // El proveedor respondió pero no tiene ese documento. Si falló nuestra llamada (errores_curl) o el tipo, no es "no encontrado".
    if (r.encontrado === false && 'data_resp' in r && !('errores_curl' in r)) return { estado: 'no_encontrado' };
    if (r.respuesta === 'ok' && r.encontrado === false) return { estado: 'no_encontrado' };
    return { estado: 'no_disponible' };
  }
}
