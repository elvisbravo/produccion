/**
 * Pruebas e2e de la agenda de reuniones por días: tabla con datos del cliente y del equipo, enlace, cambio de hora y cancelación (base produccion_test).
 */
import type { CatalogosProspecto, ProspectoDetalle, ReunionFila } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { proximoDiaHabil } from './dias.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';

type Quien = 'ana' | 'otra' | 'prod' | 'jefe' | 'aux';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', otra: 'ASIST_ADM', prod: 'ASIST_PROD', jefe: 'JEFE_PROD', aux: 'AUXILIAR' };

describe('Agenda de reuniones (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let dia: string;
  let tareaId: string;
  let prospecto: ProspectoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const reuniones = async (q: Quien, consulta = '') => (await http().get(`/api/reuniones?desde=${dia}&hasta=${dia}${consulta}`).set(como(q)).expect(200)).body as ReunionFila[];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.reu.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Reuniones', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    dia = await proximoDiaHabil(prisma);
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const actividades = (await http().get('/api/actividades?aplicaA=prospecto').set(como('ana')).expect(200)).body as { id: string; nombre: string }[];
    prospecto = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo[0].id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), nombres: 'Lucía', apellidos: 'Prospecto', esPrincipal: true }],
          primeraActividad: { actividadId: actividades.find((a) => a.nombre === 'Enfoque')!.id, fecha: dia, hora: '10:00', modalidad: 'virtual' },
        })
        .expect(201)
    ).body as ProspectoDetalle;
    tareaId = prospecto.tareas[0].id;
    // El jefe de producción da el enfoque
    const cand = (await http().get(`/api/tareas/${tareaId}/candidatos`).set(como('prod')).expect(200)).body;
    const quienDa = cand.participaciones.find((x: { obligatoria: boolean }) => x.obligatoria);
    await http().post(`/api/tareas/${tareaId}/asignar`).set(como('prod')).send({ responsables: [{ participacionId: quienDa.id, usuarioId: ids.jefe }], motivoForzado: 'prueba' }).expect(201);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('arma la fila con el cliente, el equipo y la asistente administrativa', async () => {
    const f = (await reuniones('prod')).find((x) => x.tarea.id === tareaId)!;
    expect(f).toBeDefined();
    expect(f.tarea.actividad.nombre).toBe('Enfoque');
    expect(f.cliente).toMatchObject({ nombres: 'Lucía', apellidos: 'Prospecto' });
    expect(f.asistente?.id).toBe(ids.ana);
    expect(f.jefe?.id).toBe(ids.jefe);
    expect(f.condicion).toBe('potencial_cliente');
    expect(f.motivo).toBeNull();
    expect(f.enlace).toBeNull();
  });

  it('cada quien ve lo suyo: la asistente solo sus reuniones; producción, todas', async () => {
    expect((await reuniones('ana')).some((x) => x.tarea.id === tareaId)).toBe(true);
    expect((await reuniones('otra')).some((x) => x.tarea.id === tareaId)).toBe(false);
    expect((await reuniones('prod')).some((x) => x.tarea.id === tareaId)).toBe(true);
    // El jefe asignado la ve (alcance «todos» para el jefe de producción)
    expect((await reuniones('jefe')).some((x) => x.tarea.id === tareaId)).toBe(true);
  });

  it('filtra por asistente administrativa y por estado', async () => {
    expect((await reuniones('prod', `&responsableId=${ids.ana}`)).some((x) => x.tarea.id === tareaId)).toBe(true);
    expect((await reuniones('prod', `&responsableId=${ids.otra}`)).some((x) => x.tarea.id === tareaId)).toBe(false);
    expect((await reuniones('prod', '&estado=cancelada')).some((x) => x.tarea.id === tareaId)).toBe(false);
    await http().get(`/api/reuniones?desde=${dia}&hasta=2000-01-01`).set(como('prod')).expect(400);
  });

  it('el listado de prospectos se filtra por responsable sin romper el alcance «propios»', async () => {
    const lista = async (q: Quien, consulta: string) => (await http().get(`/api/prospectos?${consulta}`).set(como(q)).expect(200)).body as { total: number; datos: { id: string }[] };
    expect((await lista('ana', `responsableId=${ids.ana}`)).datos.map((p) => p.id)).toContain(prospecto.id);
    // Con alcance «propios» no se puede ver lo de otro pidiendo su id
    expect((await lista('otra', `responsableId=${ids.ana}`)).total).toBe(0);
    expect((await lista('ana', `responsableId=${ids.otra}`)).total).toBe(0);
    const responsables = (await http().get('/api/prospectos/responsables').set(como('ana')).expect(200)).body as { id: string }[];
    expect(responsables.map((u) => u.id)).toContain(ids.ana);
  });

  it('se elige el jefe de producción y, opcionalmente, un auxiliar de apoyo', async () => {
    const equipo = (q: Quien, cuerpo: Record<string, unknown>) => http().put(`/api/tareas/${tareaId}/equipo-reunion`).set(como(q)).send({ motivoForzado: 'prueba', ...cuerpo });
    await equipo('aux', { jefeId: ids.jefe }).expect(403);
    await equipo('prod', {}).expect(400); // al menos uno
    await equipo('prod', { jefeId: ids.jefe, auxiliarId: ids.jefe }).expect(400); // otra persona
    await equipo('prod', { jefeId: ids.aux }).expect(400); // un auxiliar no puede ir como jefe
    // Con una sola plaza en «Quien da el enfoque», jefe y auxiliar a la vez piden subir «Personas»
    const plaza = await prisma.actividadParticipacion.findFirstOrThrow({ where: { nombre: 'Quien da el enfoque', actividad: { nombre: 'Enfoque' } } });
    await prisma.actividadParticipacion.update({ where: { id: plaza.id }, data: { cantidad: 1 } });
    const r = await equipo('prod', { jefeId: ids.jefe, auxiliarId: ids.aux }).expect(400);
    expect(JSON.stringify(r.body)).toContain('Personas');
    await prisma.actividadParticipacion.update({ where: { id: plaza.id }, data: { cantidad: 2 } });
    try {
      await equipo('prod', { jefeId: ids.jefe, auxiliarId: ids.aux }).expect(200);
      let f = (await reuniones('prod')).find((x) => x.tarea.id === tareaId)!;
      expect(f.jefe?.id).toBe(ids.jefe);
      expect(f.auxiliar?.id).toBe(ids.aux);
      // El auxiliar es opcional: se puede quitar dejando solo al jefe
      await equipo('prod', { jefeId: ids.jefe }).expect(200);
      f = (await reuniones('prod')).find((x) => x.tarea.id === tareaId)!;
      expect(f.jefe?.id).toBe(ids.jefe);
      expect(f.auxiliar).toBeNull();
    } finally {
      await prisma.actividadParticipacion.update({ where: { id: plaza.id }, data: { cantidad: plaza.cantidad } });
    }
  });

  it('la reunión de un prospecto por asignar no entra al calendario del equipo hasta que se asigna', async () => {
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const actividades = (await http().get('/api/actividades?aplicaA=prospecto').set(como('ana')).expect(200)).body as { id: string; nombre: string }[];
    const nuevo = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo[0].id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(2), nombres: 'Pía', apellidos: 'PorAsignar', esPrincipal: true }],
          primeraActividad: { actividadId: actividades.find((a) => a.nombre === 'Enfoque')!.id, fecha: dia, hora: '16:00', modalidad: 'virtual' },
        })
        .expect(201)
    ).body as ProspectoDetalle;
    const idPorAsignar = nuevo.tareas[0].id;
    const equipo = async () => (await http().get(`/api/agenda/equipo?desde=${dia}&hasta=${dia}`).set(como('prod')).expect(200)).body as { personas: { usuario: { id: string }; dias: { tareas: { id: string }[] }[] }[]; porAsignar: { tarea: { id: string } }[] };
    // Sigue en la bandeja de producción, pero no en el calendario
    expect((await equipo()).porAsignar.some((x) => x.tarea.id === idPorAsignar)).toBe(false);
    // Al escoger jefe y auxiliar, recién entra al calendario de ellos
    await http().put(`/api/tareas/${idPorAsignar}/equipo-reunion`).set(como('prod')).send({ jefeId: ids.jefe, motivoForzado: 'prueba' }).expect(200);
    const despues = await equipo();
    expect(despues.porAsignar.some((x) => x.tarea.id === idPorAsignar)).toBe(false);
    expect(despues.personas.find((p) => p.usuario.id === ids.jefe)!.dias.some((d) => d.tareas.some((t) => t.id === idPorAsignar))).toBe(true);
  });

  it('guarda el enlace de la reunión (solo http/https) y quien no la ve no puede cambiarlo', async () => {
    await http().put(`/api/tareas/${tareaId}/enlace-reunion`).set(como('ana')).send({ enlace: 'no es un enlace' }).expect(400);
    const r = await http().put(`/api/tareas/${tareaId}/enlace-reunion`).set(como('ana')).send({ enlace: 'https://meet.google.com/abc-defg-hij' }).expect(200);
    expect(r.body.enlaceReunion).toBe('https://meet.google.com/abc-defg-hij');
    await http().put(`/api/tareas/${tareaId}/enlace-reunion`).set(como('otra')).send({ enlace: 'https://meet.google.com/zzz' }).expect(404);
    const f = (await reuniones('prod')).find((x) => x.tarea.id === tareaId)!;
    expect(f.enlace).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('cambiar la hora y cancelar con motivo se reflejan en la tabla', async () => {
    await http().post(`/api/tareas/${tareaId}/reprogramar`).set(como('ana')).send({ fecha: dia, hora: '11:00', motivo: 'El cliente pidió otra hora' }).expect(201);
    let f = (await reuniones('prod')).find((x) => x.tarea.id === tareaId)!;
    expect(f.tarea.vecesReprogramada).toBe(1);
    expect(new Date(f.tarea.inicio!).getUTCHours()).toBe(16); // 11:00 en Lima
    await http().post(`/api/tareas/${tareaId}/cancelar`).set(como('ana')).send({ motivo: 'El cliente ya no quiere reunión' }).expect(201);
    f = (await reuniones('prod')).find((x) => x.tarea.id === tareaId)!;
    expect(f.tarea.estado).toBe('cancelada');
    expect(f.motivo).toBe('El cliente ya no quiere reunión');
  });
});
