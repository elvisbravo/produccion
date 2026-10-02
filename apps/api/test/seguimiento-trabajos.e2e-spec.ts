/**
 * Pruebas e2e del seguimiento de los trabajos con sus colores (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type Paginado, type ProspectoDetalle, type TrabajoDetalle, type TrabajoListadoItem } from '@grupoes/shared';
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

type Quien = 'ana' | 'prod' | 'aux' | 'jefe' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD', admin: 'ADMIN' };

describe('Seguimiento de los trabajos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  /** El trabajo de la prueba, tal como lo ve cada persona en el listado y en su ficha. */
  const enListado = async (q: Quien) => ((await http().get(`/api/trabajos?q=${trabajo.codigo}`).set(como(q)).expect(200)).body as Paginado<TrabajoListadoItem>).datos.find((t) => t.id === trabajo.id)!;
  const enFicha = async (q: Quien) => ((await http().get(`/api/trabajos/${trabajo.id}`).set(como(q)).expect(200)).body as TrabajoDetalle).seguimiento;
  const filtrados = async (q: Quien, seguimiento: string) =>
    ((await http().get(`/api/trabajos?q=${trabajo.codigo}&seguimiento=${seguimiento}`).set(como(q)).expect(200)).body as Paginado<TrabajoListadoItem>).datos.map((t) => t.id);

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.sg.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Seguimiento', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } });
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
          prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    // Contrato de S/ 1 000 en dos cuotas: la primera vencida hace 40 días y sin pagar.
    trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Seguimiento', email: `sg.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `2${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: sumarDias(hoy, -45), fechaLimite: sumarDias(hoy, 60) },
          contrato: {
            fechaFirma: sumarDias(hoy, -45),
            montoTotal: 1000,
            formaPago: 'cuotas',
            cuotas: [
              { monto: 500, vencimiento: sumarDias(hoy, -40) },
              { monto: 500, vencimiento: sumarDias(hoy, 30) },
            ],
          },
        })
        .expect(201)
    ).body;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('sin equipo y con una cuota vencida: pendiente de pago, y "sin asignar" como etiqueta', async () => {
    expect((await enListado('admin')).seguimiento).toEqual({ principal: 'pendiente_pago', etiquetas: ['sin_asignar'] });
    expect(await enFicha('admin')).toEqual({ principal: 'pendiente_pago', etiquetas: ['sin_asignar'] });
  });

  it('el pago pendiente solo lo ve quien puede ver montos', async () => {
    // Producción no ve los montos: para ella el trabajo solo está sin asignar.
    expect((await enListado('prod')).seguimiento).toEqual({ principal: 'sin_asignar', etiquetas: [] });
    expect(await enFicha('prod')).toEqual({ principal: 'sin_asignar', etiquetas: [] });
    await http().get(`/api/trabajos?seguimiento=pendiente_pago`).set(como('prod')).expect(403);
  });

  it('con equipo pasa a programado; al pagar la cuota vencida deja de estar pendiente de pago', async () => {
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    expect((await enListado('admin')).seguimiento).toEqual({ principal: 'pendiente_pago', etiquetas: ['programado'] });
    expect((await enListado('prod')).seguimiento).toEqual({ principal: 'programado', etiquetas: [] });

    expect(await filtrados('admin', 'pendiente_pago')).toEqual([trabajo.id]);
    expect(await filtrados('admin', 'programado')).toEqual([trabajo.id]);
    expect(await filtrados('admin', 'abordando')).toEqual([]);

    await http().post(`/api/contratos/${trabajo.contrato!.id}/pagos`).set(como('ana')).send({ monto: 500, fecha: hoy, metodo: 'yape' }).expect(201);
    expect((await enListado('admin')).seguimiento).toEqual({ principal: 'programado', etiquetas: [] });
    expect(await filtrados('admin', 'pendiente_pago')).toEqual([]);
  });

  it('urgente pasa por delante; abordando es el avance; entregado cierra el trabajo', async () => {
    const urgente = await prisma.prioridadTrabajo.findFirstOrThrow({ where: { permiteInsercionUrgente: true } });
    await prisma.trabajo.update({ where: { id: trabajo.id }, data: { prioridadId: urgente.id, estado: 'en_proceso' } });
    expect((await enListado('prod')).seguimiento).toEqual({ principal: 'urgente', etiquetas: ['abordando'] });
    expect(await filtrados('prod', 'urgente')).toEqual([trabajo.id]);
    expect(await filtrados('prod', 'abordando')).toEqual([trabajo.id]);

    await prisma.trabajo.update({ where: { id: trabajo.id }, data: { estado: 'finalizado' } });
    expect((await enFicha('admin')).principal).toBe('entregado');
    expect(await filtrados('admin', 'entregado')).toEqual([trabajo.id]);
    // Terminado, ya no es urgente.
    expect(await filtrados('admin', 'urgente')).toEqual([]);

    await prisma.trabajo.update({ where: { id: trabajo.id }, data: { estado: 'cancelado' } });
    expect((await enListado('admin')).seguimiento).toEqual({ principal: 'cancelado', etiquetas: [] });
  });
});
