import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EMPRESA_POR_DEFECTO,
  empresaSchema,
  fechaLarga,
  formatearSoles,
  montoEnLetras,
  NOMBRE_METODO_PAGO,
  PLANTILLAS_POR_DEFECTO,
  rellenarPlantilla,
  TIPOS_PLANTILLA,
  validaHasta,
  type ConfiguracionDocumentos,
  type ConfiguracionDocumentosDatos,
  type DocumentoContrato,
  type DocumentoCotizacion,
  type DocumentoRecibo,
  type EmpresaDatos,
  type TipoPlantilla,
} from '@grupoes/shared';
import { AuditoriaService } from '../common/auditoria.service.js';
import { PermisosService } from '../permisos/permisos.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TrabajosService } from '../trabajos/trabajos.service.js';
import { CotizacionesService } from './cotizaciones.service.js';
import { documentoPersona, nombrePersona } from './formato.js';

const CLAVE_EMPRESA = 'empresa.datos';
const CAMPOS_USUARIO = { id: true, nombres: true, apellidos: true } as const;
const soloFecha = (d: Date) => d.toISOString().slice(0, 10);
const centimos = (v: { toString(): string }) => Math.round(Number(v.toString()) * 100);
/** Dato que falta: se imprime una línea para completarlo a mano. */
const VACIO = '__________';
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

@Injectable()
export class DocumentosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permisos: PermisosService,
    private readonly auditoria: AuditoriaService,
    private readonly trabajos: TrabajosService,
    private readonly cotizaciones: CotizacionesService,
  ) {}

  // ─── Configuración ───────────────────────────────────────

  async empresa(): Promise<EmpresaDatos> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: CLAVE_EMPRESA } });
    const leido = empresaSchema.safeParse({ ...EMPRESA_POR_DEFECTO, ...(fila?.valor as object | null) });
    return leido.success ? leido.data : EMPRESA_POR_DEFECTO;
  }

  private async plantilla(tipo: TipoPlantilla): Promise<string> {
    return (await this.prisma.plantillaDocumento.findUnique({ where: { tipo } }))?.contenido ?? PLANTILLAS_POR_DEFECTO[tipo];
  }

  async configuracion(): Promise<ConfiguracionDocumentos> {
    const filas = await this.prisma.plantillaDocumento.findMany();
    return {
      empresa: await this.empresa(),
      plantillas: TIPOS_PLANTILLA.map((tipo) => {
        const fila = filas.find((f) => f.tipo === tipo);
        return { tipo, contenido: fila?.contenido ?? PLANTILLAS_POR_DEFECTO[tipo], personalizada: !!fila, actualizadoEn: fila?.actualizadoEn.toISOString() ?? null };
      }),
    };
  }

  /** Guarda el membrete y las plantillas; una plantilla igual a la provisional vuelve a ser la provisional. */
  async guardar(datos: ConfiguracionDocumentosDatos, actor: { usuarioId: string; ip: string | null }): Promise<ConfiguracionDocumentos> {
    await this.prisma.$transaction(async (tx) => {
      await tx.parametro.upsert({
        where: { clave: CLAVE_EMPRESA },
        create: { clave: CLAVE_EMPRESA, valor: datos.empresa, descripcion: 'Datos de la empresa para el membrete de los documentos' },
        update: { valor: datos.empresa },
      });
      for (const p of datos.plantillas) {
        if (p.contenido === PLANTILLAS_POR_DEFECTO[p.tipo].trim()) await tx.plantillaDocumento.deleteMany({ where: { tipo: p.tipo } });
        else
          await tx.plantillaDocumento.upsert({
            where: { tipo: p.tipo },
            create: { tipo: p.tipo, contenido: p.contenido, actualizadoPor: actor.usuarioId },
            update: { contenido: p.contenido, actualizadoPor: actor.usuarioId },
          });
      }
      await this.auditoria.registrar(
        { usuarioId: actor.usuarioId, accion: 'editar', entidad: 'documentos', despues: { empresa: datos.empresa, plantillas: datos.plantillas.map((p) => p.tipo) }, ip: actor.ip },
        tx,
      );
    });
    return this.configuracion();
  }

  private comunes(e: EmpresaDatos): Record<string, string> {
    return { empresa: e.razonSocial, ruc: e.ruc || VACIO, direccion_empresa: e.direccion || VACIO, telefono_empresa: e.telefono || VACIO, correo_empresa: e.correo || VACIO };
  }

  // ─── Cotización ──────────────────────────────────────────

  async cotizacion(id: string, usuarioId: string): Promise<DocumentoCotizacion> {
    const c = await this.prisma.cotizacion.findFirst({
      where: { id, prospecto: { eliminadoEn: null, ...(await this.cotizaciones.filtroVisibles(usuarioId)) } },
      include: {
        items: { orderBy: { orden: 'asc' } },
        creadoPor: { select: CAMPOS_USUARIO },
        prospecto: {
          include: {
            tipoTrabajo: true,
            nivelAcademico: true,
            universidad: true,
            carrera: true,
            contactos: { orderBy: [{ esPrincipal: 'desc' }, { orden: 'asc' }], take: 1, include: { persona: true } },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Cotización no encontrada');
    const empresa = await this.empresa();
    const p = c.prospecto;
    const fecha = soloFecha(c.fecha);
    const hasta = validaHasta(fecha, c.validezDias);
    const contacto = p.contactos[0]?.persona;
    const total = Number(c.total);
    const asesor = `${c.creadoPor.nombres} ${c.creadoPor.apellidos}`;
    const texto = rellenarPlantilla(await this.plantilla('cotizacion'), {
      ...this.comunes(empresa),
      numero: c.numero,
      fecha: fechaLarga(fecha),
      valido_hasta: fechaLarga(hasta),
      validez_dias: String(c.validezDias),
      cliente: contacto ? nombrePersona(contacto) : '',
      tipo_trabajo: p.tipoTrabajo.nombre,
      titulo: p.titulo ?? 'por definir',
      total: formatearSoles(total),
      total_letras: montoEnLetras(total),
      forma_pago: c.formaPago ?? 'a convenir',
      asesor,
    });
    return {
      empresa,
      texto,
      numero: c.numero,
      fecha,
      validaHasta: hasta,
      estado: c.estado,
      prospecto: { id: p.id, codigo: p.codigo },
      cliente: { nombre: contacto ? nombrePersona(contacto) : '—', celular: contacto?.celular ?? null },
      trabajo: { tipo: p.tipoTrabajo.nombre, titulo: p.titulo, nivel: p.nivelAcademico?.nombre ?? null, universidad: p.universidad?.nombre ?? null, carrera: p.carrera?.nombre ?? null },
      items: c.items.map((i) => ({ descripcion: i.descripcion, cantidad: Number(i.cantidad), precio: Number(i.precio), subtotal: Number(i.subtotal) })),
      total,
      totalLetras: montoEnLetras(total),
      formaPago: c.formaPago,
      observaciones: c.observaciones,
      asesor: c.creadoPor,
    };
  }

  // ─── Contrato y recibo ───────────────────────────────────

  /** Imprimir montos exige además poder verlos, y el trabajo tiene que estar al alcance de la persona. */
  private async verificarMontos(trabajoId: string, usuarioId: string) {
    if (!('contratos.ver_montos' in (await this.permisos.efectivos(usuarioId)))) throw new ForbiddenException('No tienes permiso para ver los montos del contrato');
    await this.trabajos.verificarVisible(trabajoId, usuarioId);
  }

  async contrato(trabajoId: string, usuarioId: string): Promise<DocumentoContrato> {
    await this.verificarMontos(trabajoId, usuarioId);
    const t = await this.prisma.trabajo.findUniqueOrThrow({
      where: { id: trabajoId },
      include: {
        tipoTrabajo: true,
        nivelAcademico: true,
        universidad: true,
        carrera: true,
        integrantes: { orderBy: [{ esTitular: 'desc' }, { orden: 'asc' }], include: { persona: true } },
        // El contrato impreso es lo firmado: las cuotas de los adicionales van en su propia adenda.
        contrato: { include: { cuotas: { where: { adicionalId: null }, orderBy: { numero: 'asc' } } } },
      },
    });
    if (t.proveedorId) throw new BadRequestException('Los trabajos de proveedores no llevan contrato impreso');
    if (!t.contrato) throw new NotFoundException('El trabajo no tiene contrato');
    const c = t.contrato;
    const empresa = await this.empresa();
    const titular = t.integrantes[0]?.persona;
    const monto = Number(c.montoTotal);
    const integrantes = t.integrantes.map((i) => ({
      nombre: nombrePersona(i.persona),
      documento: documentoPersona(i.persona),
      celular: i.persona.celular,
      email: i.persona.email,
      esTitular: i.esTitular,
    }));
    const texto = rellenarPlantilla(await this.plantilla('contrato'), {
      ...this.comunes(empresa),
      codigo: t.codigo,
      fecha_firma: fechaLarga(soloFecha(c.fechaFirma)),
      cliente: titular ? nombrePersona(titular) : '',
      documento_cliente: (titular && documentoPersona(titular)) ?? VACIO,
      integrantes: integrantes.map((i) => (i.documento ? `${i.nombre} (${i.documento})` : i.nombre)).join(', '),
      tipo_trabajo: t.tipoTrabajo.nombre,
      titulo: t.titulo ?? VACIO,
      nivel: t.nivelAcademico?.nombre ?? VACIO,
      universidad: t.universidad?.nombre ?? VACIO,
      carrera: t.carrera?.nombre ?? VACIO,
      fecha_inicio: fechaLarga(soloFecha(t.fechaInicio)),
      fecha_limite: fechaLarga(soloFecha(t.fechaLimite)),
      monto: formatearSoles(monto),
      monto_letras: montoEnLetras(monto),
      forma_pago: c.formaPago === 'contado' ? 'al contado' : `en ${plural(c.cuotas.length, 'cuota', 'cuotas')}`,
      dias_garantia: String(c.diasGarantia),
    });
    return {
      empresa,
      texto,
      trabajo: {
        id: t.id,
        codigo: t.codigo,
        tipo: t.tipoTrabajo.nombre,
        titulo: t.titulo,
        nivel: t.nivelAcademico?.nombre ?? null,
        universidad: t.universidad?.nombre ?? null,
        carrera: t.carrera?.nombre ?? null,
        fechaInicio: soloFecha(t.fechaInicio),
        fechaLimite: soloFecha(t.fechaLimite),
      },
      fechaFirma: soloFecha(c.fechaFirma),
      estado: c.estado,
      integrantes,
      montoTotal: monto,
      montoLetras: montoEnLetras(monto),
      formaPago: c.formaPago,
      cuotas: c.cuotas.map((q) => ({ numero: q.numero, monto: Number(q.monto), vencimiento: soloFecha(q.vencimiento) })),
      diasGarantia: c.diasGarantia,
    };
  }

  async recibo(pagoId: string, usuarioId: string): Promise<DocumentoRecibo> {
    const pago = await this.prisma.pago.findUnique({
      where: { id: pagoId },
      include: {
        registradoPor: { select: CAMPOS_USUARIO },
        aplicaciones: { include: { cuota: { select: { numero: true } } } },
        contrato: {
          include: {
            cuotas: { select: { id: true, monto: true } },
            pagos: { where: { anuladoEn: null }, select: { id: true, monto: true, registradoEn: true } },
            trabajo: { include: { tipoTrabajo: true, proveedor: true, integrantes: { orderBy: [{ esTitular: 'desc' }, { orden: 'asc' }], take: 1, include: { persona: true } } } },
          },
        },
      },
    });
    if (!pago) throw new NotFoundException('Pago no encontrado');
    const t = pago.contrato.trabajo;
    await this.verificarMontos(t.id, usuarioId);

    const empresa = await this.empresa();
    const titular = t.integrantes[0]?.persona;
    // En un trabajo de proveedor, quien paga es el proveedor.
    const nombrePagador = titular ? nombrePersona(titular) : t.proveedor ? `${t.proveedor.nombres} ${t.proveedor.apellidos}` : '';
    const monto = Number(pago.monto);
    // Total de la cuenta: el contrato más los adicionales aceptados (sus cuotas).
    const totalCentimos = pago.contrato.cuotas.reduce((s, q) => s + centimos(q.monto), 0);
    const total = totalCentimos / 100;
    // Saldo justo después de este pago: lo pagado hasta él (inclusive), sin los anulados.
    const pagadoHasta = pago.contrato.pagos.filter((x) => x.registradoEn <= pago.registradoEn).reduce((s, x) => s + centimos(x.monto), 0);
    const saldo = Math.max(0, totalCentimos - pagadoHasta) / 100;
    const cuotas = pago.aplicaciones.map((a) => ({ numero: a.cuota.numero, montoAplicado: Number(a.montoAplicado) })).sort((a, b) => a.numero - b.numero);
    const totalCuotas = pago.contrato.cuotas.length;
    const concepto =
      pago.contrato.formaPago === 'contado'
        ? 'pago al contado'
        : cuotas.length === 1
          ? `cuota ${cuotas[0].numero} de ${totalCuotas}`
          : `cuotas ${cuotas.map((q) => q.numero).join(', ')} de ${totalCuotas}`;
    const texto = rellenarPlantilla(await this.plantilla('recibo'), {
      ...this.comunes(empresa),
      numero: pago.numeroRecibo,
      fecha: fechaLarga(soloFecha(pago.fecha)),
      cliente: nombrePagador,
      documento_cliente: (titular && documentoPersona(titular)) ?? VACIO,
      monto: formatearSoles(monto),
      monto_letras: montoEnLetras(monto),
      metodo: NOMBRE_METODO_PAGO[pago.metodo],
      concepto,
      codigo_trabajo: t.codigo,
      tipo_trabajo: t.tipoTrabajo.nombre,
      saldo: formatearSoles(saldo),
    });
    return {
      empresa,
      texto,
      numero: pago.numeroRecibo,
      fecha: soloFecha(pago.fecha),
      monto,
      montoLetras: montoEnLetras(monto),
      metodo: NOMBRE_METODO_PAGO[pago.metodo],
      numeroOperacion: pago.numeroOperacion,
      cliente: { nombre: nombrePagador || '—', documento: titular ? documentoPersona(titular) : null },
      trabajo: { id: t.id, codigo: t.codigo, tipo: t.tipoTrabajo.nombre, titulo: t.titulo },
      cuotas,
      totalContrato: total,
      saldo,
      registradoPor: pago.registradoPor,
      anulado: pago.anuladoEn ? { motivo: pago.motivoAnulacion } : null,
    };
  }
}
