/**
 * Pruebas e2e de los adicionales del contrato (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type DocumentoContrato, type DocumentoRecibo, type ProspectoDetalle, type TrabajoDetalle } from '@grupoes/shared';
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

type Quien = 'ana' | 'prod' | 'aux' | 'jefe' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD', admin: 'ADMIN' };

describe('Adicionales del contrato (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const contratoId = () => trabajo.contrato!.id;
  const proponer = (q: Quien, datos: object) => http().post(`/api/contratos/${contratoId()}/adicionales`).set(como(q)).send(datos);
  const accion = (q: Quien, id: string, que: 'aceptar' | 'rechazar' | 'anular', motivo?: string) => http().post(`/api/adicionales/${id}/${que}`).set(como(q)).send(motivo ? { motivo } : {});
  const ultimo = (t: TrabajoDetalle) => t.contrato!.adicionales!.at(-1)!;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.a.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Adicionales', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Monografía')!.id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    // Contrato de S/ 1 000 al contado, pagado completo.
    trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Adicionales', email: `a.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `7${sufijo}1`, esTitular: true }],
          trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 60) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
          pagoInicial: { monto: 1000, fecha: hoy, metodo: 'yape' },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('se propone con cuotas que suman el monto; aún no cambia la cuenta', async () => {
    await proponer('ana', { descripcion: 'Capítulo adicional', monto: 600, cuotas: [{ monto: 500, vencimiento: hoy }] }).expect(400);
    await proponer('aux', { descripcion: 'Capítulo adicional', monto: 600, cuotas: [{ monto: 600, vencimiento: hoy }] }).expect(403);

    trabajo = (
      await proponer('ana', {
        descripcion: 'Capítulo adicional de antecedentes',
        monto: 600,
        cuotas: [
          { monto: 300, vencimiento: sumarDias(hoy, 7) },
          { monto: 300, vencimiento: sumarDias(hoy, 37) },
        ],
      }).expect(201)
    ).body;
    const a = ultimo(trabajo);
    expect(a).toMatchObject({ numero: 1, estado: 'propuesto', monto: 600, respondido: null });
    expect(a.cuotas.map((q) => q.numero)).toEqual([null, null]);
    expect(trabajo.contrato!.cuenta).toMatchObject({ total: 1000, saldo: 0 });
    expect(trabajo.contrato!.montoContrato).toBe(1000);
  });

  it('al aceptarlo, sus cuotas entran a la cuenta y se avisa a producción y al jefe', async () => {
    const id = ultimo(trabajo).id;
    trabajo = (await accion('ana', id, 'aceptar').expect(201)).body;
    const a = ultimo(trabajo);
    expect(a.estado).toBe('aceptado');
    expect(a.cuotas.map((q) => q.numero)).toEqual([2, 3]);
    expect(trabajo.contrato!.cuenta).toMatchObject({ total: 1600, saldo: 600 });
    expect(trabajo.contrato!.cuotas!.filter((q) => q.adicional === 1).map((q) => q.numero)).toEqual([2, 3]);
    expect(trabajo.eventos[0].tipo).toBe('adicional');
    await accion('ana', id, 'aceptar').expect(409);

    // El contrato impreso sigue siendo lo firmado: ni sus cuotas ni su total incluyen el adicional.
    const impreso = (await http().get(`/api/documentos/contrato/${trabajo.id}`).set(como('ana')).expect(200)).body as DocumentoContrato;
    expect(impreso.cuotas.map((q) => q.numero)).toEqual([1]);
    expect(impreso.montoTotal).toBe(1000);

    for (const q of ['jefe', 'prod'] as const) {
      const avisos = await prisma.notificacion.findMany({ where: { usuarioId: ids[q], tipo: 'trabajo.adicional' } });
      expect(avisos).toHaveLength(1);
      expect(avisos[0].enlace).toBe(`/trabajos/${trabajo.id}`);
    }
  });

  it('se cobra como cualquier cuota; con pagos ya no se anula', async () => {
    trabajo = (await http().post(`/api/contratos/${contratoId()}/pagos`).set(como('ana')).send({ monto: 300, fecha: hoy, metodo: 'transferencia' }).expect(201)).body;
    expect(trabajo.contrato!.cuenta).toMatchObject({ total: 1600, pagado: 1300, saldo: 300 });
    const pago = trabajo.contrato!.pagos![0];
    expect(pago.cuotas).toEqual([{ numero: 2, monto: 300 }]);

    const recibo = (await http().get(`/api/documentos/recibo/${pago.id}`).set(como('ana')).expect(200)).body as DocumentoRecibo;
    expect(recibo).toMatchObject({ totalContrato: 1600, saldo: 300 });

    await accion('ana', ultimo(trabajo).id, 'anular', 'Ya no lo quiere').expect(403);
    const r = await accion('admin', ultimo(trabajo).id, 'anular', 'Ya no lo quiere').expect(400);
    expect(r.body.message).toContain('pagos');
  });

  it('rechazar deja constancia; anular un aceptado sin pagos quita sus cuotas', async () => {
    trabajo = (await proponer('ana', { descripcion: 'Encuesta extra', monto: 200, cuotas: [{ monto: 200, vencimiento: hoy }] }).expect(201)).body;
    const rechazado = ultimo(trabajo);
    await accion('ana', rechazado.id, 'rechazar').expect(400);
    trabajo = (await accion('ana', rechazado.id, 'rechazar', 'Le parece caro').expect(201)).body;
    expect(ultimo(trabajo)).toMatchObject({ numero: 2, estado: 'rechazado', motivo: 'Le parece caro' });
    expect(trabajo.contrato!.cuenta!.total).toBe(1600);
    await accion('ana', rechazado.id, 'aceptar').expect(409);

    trabajo = (await proponer('ana', { descripcion: 'Cambio de asesor', monto: 400, cuotas: [{ monto: 400, vencimiento: hoy }] }).expect(201)).body;
    const id = ultimo(trabajo).id;
    trabajo = (await accion('ana', id, 'aceptar').expect(201)).body;
    expect(trabajo.contrato!.cuenta!.total).toBe(2000);
    trabajo = (await accion('admin', id, 'anular', 'Se registró por error').expect(201)).body;
    expect(ultimo(trabajo)).toMatchObject({ numero: 3, estado: 'anulado', motivo: 'Se registró por error' });
    expect(trabajo.contrato!.cuenta).toMatchObject({ total: 1600, saldo: 300 });
    expect(trabajo.contrato!.cuotas!.some((q) => q.adicional === 3)).toBe(false);
  });
});
