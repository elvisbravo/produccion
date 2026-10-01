/**
 * Pruebas e2e de cotizaciones y documentos imprimibles (base produccion_test).
 */
import {
  diaEnLima,
  fechaLarga,
  formatearSoles,
  PLANTILLAS_POR_DEFECTO,
  sumarDias,
  type CatalogosProspecto,
  type ConfiguracionDocumentos,
  type CotizacionListadoItem,
  type CotizacionResumen,
  type DocumentoContrato,
  type DocumentoCotizacion,
  type DocumentoRecibo,
  type Paginado,
  type ProspectoDetalle,
  type TrabajoDetalle,
} from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'ana' | 'otra' | 'prod' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', otra: 'ASIST_ADM', prod: 'ASIST_PROD', admin: 'ADMIN' };

describe('Cotizaciones y documentos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let catalogos: CatalogosProspecto;
  let prospecto: ProspectoDetalle;
  let cotizacion: CotizacionResumen;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const crearProspecto = async (n: number) =>
    (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Monografía')!.id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          titulo: 'Gestión del talento humano',
          contactos: [{ celular: celular(n), nombres: 'Lucía', apellidos: 'Paredes', esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
  const cotizar = (q: Quien, prospectoId: string) =>
    http()
      .post(`/api/prospectos/${prospectoId}/cotizaciones`)
      .set(como(q))
      .send({
        fecha: hoy,
        validezDias: 15,
        formaPago: 'tres cuotas mensuales',
        items: [
          { descripcion: 'Asesoría de monografía', cantidad: 1, precio: 3000 },
          { descripcion: 'Revisión de estilo', cantidad: 2, precio: 250 },
        ],
      });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.d.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Documentos', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    prospecto = await crearProspecto(1);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.plantillaDocumento.deleteMany();
    await prisma.parametro.deleteMany({ where: { clave: 'empresa.datos' } });
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('emite la cotización: total, monto cotizado y pasa a "Cotizado"', async () => {
    cotizacion = (await cotizar('ana', prospecto.id).expect(201)).body;
    expect(cotizacion.numero).toMatch(/^C-\d{4}-\d{4}$/);
    expect(cotizacion.total).toBe(3500);
    expect(cotizacion.items.map((i) => i.subtotal)).toEqual([3000, 500]);
    expect(cotizacion.validaHasta).toBe(sumarDias(hoy, 15));

    const p = (await http().get(`/api/prospectos/${prospecto.id}`).set(como('ana')).expect(200)).body as ProspectoDetalle;
    expect(p.etapa.nombre).toBe('Cotizado');
    expect(p.montoCotizado).toBe(3500);
    expect(p.eventos.some((e) => e.tipo === 'cotizacion' && e.detalle.includes(cotizacion.numero))).toBe(true);
  });

  it('respeta el alcance y los permisos', async () => {
    await http().get(`/api/prospectos/${prospecto.id}/cotizaciones`).set(como('otra')).expect(404);
    await cotizar('otra', prospecto.id).expect(404);
    await http().get(`/api/documentos/cotizacion/${cotizacion.id}`).set(como('otra')).expect(404);
    await http().get(`/api/prospectos/${prospecto.id}/cotizaciones`).set(como('prod')).expect(403);
    const lista = (await http().get(`/api/cotizaciones?q=${cotizacion.numero}`).set(como('otra')).expect(200)).body as Paginado<CotizacionListadoItem>;
    expect(lista.total).toBe(0);
  });

  it('el documento de la cotización rellena la plantilla', async () => {
    const d = (await http().get(`/api/documentos/cotizacion/${cotizacion.id}`).set(como('ana')).expect(200)).body as DocumentoCotizacion;
    expect(d.totalLetras).toBe('TRES MIL QUINIENTOS CON 00/100 SOLES');
    expect(d.cliente.nombre).toBe('Lucía Paredes');
    expect(d.texto).toContain(`válida hasta el ${fechaLarga(sumarDias(hoy, 15))}`);
    expect(d.texto).toContain('tres cuotas mensuales');
    expect(d.texto).not.toMatch(/\{[a-z_]+\}/);
  });

  it('lista con búsqueda y estado', async () => {
    const vigentes = (await http().get(`/api/cotizaciones?q=${cotizacion.numero}&estado=vigente`).set(como('ana')).expect(200)).body as Paginado<CotizacionListadoItem>;
    expect(vigentes.datos.map((c) => c.id)).toEqual([cotizacion.id]);
    expect(vigentes.datos[0].prospecto.cliente).toBe('Lucía Paredes');
    const vencidas = (await http().get(`/api/cotizaciones?q=${cotizacion.numero}&estado=vencida`).set(como('ana')).expect(200)).body as Paginado<CotizacionListadoItem>;
    expect(vencidas.total).toBe(0);
  });

  it('anular deja el monto cotizado de la última vigente', async () => {
    const anulada = (await http().post(`/api/cotizaciones/${cotizacion.id}/anular`).set(como('ana')).send({ motivo: 'Cambió el alcance' }).expect(201)).body as CotizacionResumen;
    expect(anulada.estado).toBe('anulada');
    expect(anulada.anulada?.motivo).toBe('Cambió el alcance');
    await http().post(`/api/cotizaciones/${cotizacion.id}/anular`).set(como('ana')).send({ motivo: 'Otra vez' }).expect(409);
    const p = (await http().get(`/api/prospectos/${prospecto.id}`).set(como('ana')).expect(200)).body as ProspectoDetalle;
    expect(p.montoCotizado).toBeNull();
  });

  it('el membrete y las plantillas se configuran (solo con permiso)', async () => {
    await http().get('/api/documentos/configuracion').set(como('ana')).expect(403);
    const inicial = (await http().get('/api/documentos/configuracion').set(como('admin')).expect(200)).body as ConfiguracionDocumentos;
    expect(inicial.plantillas.find((p) => p.tipo === 'cotizacion')?.personalizada).toBe(false);

    const empresa = { ...inicial.empresa, razonSocial: 'GRUPO ES S.A.C.', ruc: '20601234567' };
    await http()
      .put('/api/documentos/configuracion')
      .set(como('admin'))
      .send({ empresa: { ...empresa, ruc: '123' }, plantillas: [] })
      .expect(400);
    const guardada = (
      await http()
        .put('/api/documentos/configuracion')
        .set(como('admin'))
        .send({ empresa, plantillas: [{ tipo: 'cotizacion', contenido: 'Estimada {cliente}: {empresa} ({ruc}) le cotiza {total}.' }] })
        .expect(200)
    ).body as ConfiguracionDocumentos;
    expect(guardada.plantillas.find((p) => p.tipo === 'cotizacion')?.personalizada).toBe(true);

    const nueva = (await cotizar('ana', prospecto.id).expect(201)).body as CotizacionResumen;
    const d = (await http().get(`/api/documentos/cotizacion/${nueva.id}`).set(como('ana')).expect(200)).body as DocumentoCotizacion;
    expect(d.texto).toBe(`Estimada Lucía Paredes: GRUPO ES S.A.C. (20601234567) le cotiza ${formatearSoles(3500)}.`);
    expect(d.empresa.ruc).toBe('20601234567');

    // Volver al texto provisional lo deja como "no personalizado".
    const restaurada = (
      await http()
        .put('/api/documentos/configuracion')
        .set(como('admin'))
        .send({ empresa, plantillas: [{ tipo: 'cotizacion', contenido: PLANTILLAS_POR_DEFECTO.cotizacion }] })
        .expect(200)
    ).body as ConfiguracionDocumentos;
    expect(restaurada.plantillas.find((p) => p.tipo === 'cotizacion')?.personalizada).toBe(false);
  });

  it('contrato y recibo imprimibles; no se cotiza a un prospecto convertido', async () => {
    const p = await crearProspecto(2);
    const trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Lucía', apellidos: 'Paredes', email: `d.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `5${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: hoy, fechaLimite: sumarDias(hoy, 60) },
          contrato: {
            fechaFirma: hoy,
            montoTotal: 1500,
            formaPago: 'cuotas',
            cuotas: [
              { monto: 1000, vencimiento: hoy },
              { monto: 500, vencimiento: sumarDias(hoy, 30) },
            ],
          },
          pagoInicial: { monto: 200, fecha: hoy, metodo: 'yape' },
        })
        .expect(201)
    ).body as TrabajoDetalle;
    await cotizar('ana', p.id).expect(400);

    const contrato = (await http().get(`/api/documentos/contrato/${trabajo.id}`).set(como('ana')).expect(200)).body as DocumentoContrato;
    expect(contrato.montoLetras).toBe('MIL QUINIENTOS CON 00/100 SOLES');
    expect(contrato.cuotas).toHaveLength(2);
    expect(contrato.integrantes[0]).toMatchObject({ nombre: 'Lucía Paredes', documento: `DNI 5${sufijo}1`, esTitular: true });
    expect(contrato.texto).toContain(`Lucía Paredes, identificado(a) con DNI 5${sufijo}1`);
    expect(contrato.texto).toContain('en 2 cuotas');
    expect(contrato.texto).not.toMatch(/\{[a-z_]+\}/);

    const pagoId = trabajo.contrato!.pagos![0].id;
    const recibo = (await http().get(`/api/documentos/recibo/${pagoId}`).set(como('ana')).expect(200)).body as DocumentoRecibo;
    expect(recibo).toMatchObject({ monto: 200, montoLetras: 'DOSCIENTOS CON 00/100 SOLES', saldo: 1300, metodo: 'Yape', cuotas: [{ numero: 1, montoAplicado: 200 }] });
    expect(recibo.texto).toContain('cuota 1 de 2');

    // Producción no imprime contratos.
    await http().get(`/api/documentos/contrato/${trabajo.id}`).set(como('prod')).expect(403);
    await http().get(`/api/documentos/recibo/${pagoId}`).set(como('prod')).expect(403);
  });
});
