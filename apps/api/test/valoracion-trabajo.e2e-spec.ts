/**
 * Pruebas e2e de la valoración de un trabajo en una reunión (base produccion_test).
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

type Quien = 'ana' | 'prod' | 'aux' | 'jefe';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Valoración del trabajo (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.val.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Valoracion', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } });
      ids[q] = u.id;
    }
    // El asistente de producción valora (aquí se le concede por si el rol de la base de pruebas no lo trae).
    const accion = await prisma.accion.findFirstOrThrow({ where: { codigo: 'valorar', modulo: { codigo: 'trabajos' } } });
    await prisma.usuarioPermiso.upsert({
      where: { usuarioId_accionId: { usuarioId: ids.prod, accionId: accion.id } },
      create: { usuarioId: ids.prod, accionId: accion.id, tipo: 'conceder', otorgadoPor: ids.prod },
      update: { tipo: 'conceder' },
    });
    for (const q of Object.keys(ROL) as Quien[]) {
      tokens[q] = (await http().post('/api/auth/login').send({ email: `e2e.val.${q}.${sufijo}@grupoes.local`, password: PASSWORD }).expect(200)).body.accessToken;
    }

    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
          prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Valorado', email: `val.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `1${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: hoy, fechaLimite: sumarDias(hoy, 20) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body as TrabajoDetalle;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  const lista = async (seguimiento: string) =>
    ((await http().get(`/api/trabajos?seguimiento=${seguimiento}&q=${trabajo.codigo}`).set(como('prod')).expect(200)).body as Paginado<TrabajoListadoItem>).datos.map((t) => t.id);

  it('sin valorar el trabajo figura como "sin asignar"', async () => {
    expect(trabajo.valoracion).toBeNull();
    expect(trabajo.seguimiento.principal).toBe('sin_asignar');
    expect(await lista('sin_asignar')).toContain(trabajo.id);
    expect(await lista('valorado')).not.toContain(trabajo.id);
  });

  it('valorar exige permiso y datos válidos', async () => {
    const datos = { fechaReunion: hoy, diasEstimados: 5 };
    await http().post(`/api/trabajos/${trabajo.id}/valoracion`).set(como('aux')).send(datos).expect(403);
    await http().post(`/api/trabajos/${trabajo.id}/valoracion`).set(como('prod')).send({ ...datos, diasEstimados: 0 }).expect(400);
    await http().post(`/api/trabajos/${trabajo.id}/valoracion`).set(como('prod')).send({ diasEstimados: 5 }).expect(400);
  });

  it('valorado: cambia el seguimiento, avisa al vendedor y deja la estimación a la vista', async () => {
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/valoracion`).set(como('prod')).send({ fechaReunion: hoy, diasEstimados: 5, nota: 'Con la tutora' }).expect(200)).body;
    expect(trabajo.seguimiento.principal).toBe('valorado');
    expect(trabajo.valoracion).toMatchObject({ diasEstimados: 5, nota: 'Con la tutora', alcanza: true });
    expect(trabajo.valoracion!.por.id).toBe(ids.prod);
    expect(trabajo.eventos[0].detalle).toContain('Valorado en la reunión');
    expect(await lista('valorado')).toContain(trabajo.id);
    expect(await lista('sin_asignar')).not.toContain(trabajo.id);
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.ana, tipo: 'trabajo.valorado' } })).toBe(1);
  });

  it('avisa (sin impedirlo) cuando la estimación no cabe antes de la fecha límite; la última valoración es la vigente', async () => {
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/valoracion`).set(como('prod')).send({ fechaReunion: hoy, diasEstimados: 60 }).expect(200)).body;
    expect(trabajo.valoracion).toMatchObject({ diasEstimados: 60, alcanza: false });
    expect(trabajo.valoracion!.diasDisponibles).toBeLessThan(60);
    expect(await prisma.valoracionTrabajo.count({ where: { trabajoId: trabajo.id } })).toBe(2);
  });

  it('al armar el equipo deja de figurar como "valorado"', async () => {
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    const t = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    expect(t.seguimiento.principal).toBe('programado');
    expect(t.valoracion).not.toBeNull();
  });
});
