/**
 * Pruebas e2e de la reasignación del responsable de un prospecto (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type PendientesUsuario, type ProspectoDetalle, type ResultadoReasignarLote, type UsuarioResumen } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { datosAcademicos } from './datos-academicos.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'ana' | 'beto' | 'prod' | 'aux' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', beto: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', admin: 'ADMIN' };

describe('Reasignar prospectos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let catalogos: CatalogosProspecto;
  let p1: ProspectoDetalle;
  let p2: ProspectoDetalle;
  let convertido: ProspectoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const reasignar = (q: Quien, prospectoId: string, usuarioId: string, motivo?: string) => http().post(`/api/prospectos/${prospectoId}/reasignar`).set(como(q)).send({ usuarioId, motivo });
  const nuevo = async (n: number) =>
    (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Monografía')!.id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(n), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.ra.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Reasignar', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    p1 = await nuevo(1);
    p2 = await nuevo(2);
    convertido = await nuevo(3);
    await http()
      .post(`/api/prospectos/${convertido.id}/convertir`)
      .set(como('ana'))
      .send({
        integrantes: [{ personaId: convertido.contactos[0].id, nombres: 'Cliente', apellidos: 'Reasignar', email: `ra.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `3${sufijo}1`, esTitular: true }],
        trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 60) },
        contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
      })
      .expect(201);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('quienes pueden recibir un prospecto: personas activas con permiso para verlos', async () => {
    await http().get('/api/prospectos/posibles-responsables').set(como('ana')).expect(403);
    const lista = (await http().get('/api/prospectos/posibles-responsables').set(como('admin')).expect(200)).body as UsuarioResumen[];
    const quienes = lista.map((u) => u.id);
    expect(quienes).toEqual(expect.arrayContaining([ids.ana, ids.beto, ids.prod, ids.admin]));
    expect(quienes).not.toContain(ids.aux);
  });

  it('reasigna un prospecto: queda en su línea de tiempo y se avisa a ambos', async () => {
    await reasignar('ana', p1.id, ids.beto).expect(403);
    const r = (await reasignar('admin', p1.id, ids.beto, 'Se va de vacaciones').expect(200)).body as ProspectoDetalle;
    expect(r.responsable.id).toBe(ids.beto);
    expect(r.eventos[0]).toMatchObject({ tipo: 'reasignado' });
    expect(r.eventos[0].detalle).toBe('Responsable: E2E ana Reasignar → E2E beto Reasignar — Se va de vacaciones');
    expect(await prisma.notificacion.findFirst({ where: { usuarioId: ids.beto, tipo: 'prospecto.reasignado', titulo: { contains: p1.codigo } } })).not.toBeNull();
    expect(await prisma.notificacion.findFirst({ where: { usuarioId: ids.ana, tipo: 'prospecto.reasignado', titulo: { contains: p1.codigo } } })).not.toBeNull();
    // Ahora lo ve quien lo recibe y deja de verlo quien lo tenía (alcance "propios").
    await http().get(`/api/prospectos/${p1.id}`).set(como('beto')).expect(200);
    await http().get(`/api/prospectos/${p1.id}`).set(como('ana')).expect(404);
  });

  it('valida: otra persona, que pueda seguir prospectos y que el prospecto esté abierto', async () => {
    expect((await reasignar('admin', p1.id, ids.beto).expect(400)).body.errores[0].campo).toBe('usuarioId');
    await reasignar('admin', p2.id, ids.aux).expect(400);
    await reasignar('admin', convertido.id, ids.beto).expect(400);
    await reasignar('admin', '0199a000-0000-7000-8000-000000000000', ids.beto).expect(404);
  });

  it('por lote: pasa todos los prospectos abiertos de una persona a otra, sin tocar los ya convertidos', async () => {
    const antes = (await http().get(`/api/usuarios/${ids.ana}/pendientes`).set(como('admin')).expect(200)).body as PendientesUsuario;
    expect(antes.prospectos).toBe(1);
    await http().post('/api/prospectos/reasignar-lote').set(como('ana')).send({ desdeUsuarioId: ids.ana, aUsuarioId: ids.prod }).expect(403);
    await http().post('/api/prospectos/reasignar-lote').set(como('admin')).send({ desdeUsuarioId: ids.ana, aUsuarioId: ids.ana }).expect(400);
    await http().post('/api/prospectos/reasignar-lote').set(como('admin')).send({ desdeUsuarioId: ids.ana, aUsuarioId: ids.aux }).expect(400);

    const r = (await http().post('/api/prospectos/reasignar-lote').set(como('admin')).send({ desdeUsuarioId: ids.ana, aUsuarioId: ids.prod, motivo: 'Dejó la empresa' }).expect(200)).body as ResultadoReasignarLote;
    expect(r).toEqual({ reasignados: 1, tareasPendientes: 0 });
    const movido = (await http().get(`/api/prospectos/${p2.id}`).set(como('prod')).expect(200)).body as ProspectoDetalle;
    expect(movido.responsable.id).toBe(ids.prod);
    expect(movido.eventos[0].detalle).toContain('Dejó la empresa');
    // El convertido sigue con quien lo captó y ya no queda nada abierto a su cargo.
    const intacto = await prisma.prospecto.findUniqueOrThrow({ where: { id: convertido.id } });
    expect(intacto.responsableId).toBe(ids.ana);
    expect(((await http().get(`/api/usuarios/${ids.ana}/pendientes`).set(como('admin')).expect(200)).body as PendientesUsuario).prospectos).toBe(0);
    // Sin nada abierto, el lote no hace nada.
    expect((await http().post('/api/prospectos/reasignar-lote').set(como('admin')).send({ desdeUsuarioId: ids.ana, aUsuarioId: ids.prod }).expect(200)).body).toEqual({ reasignados: 0, tareasPendientes: 0 });
  });
});
