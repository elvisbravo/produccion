/**
 * Pruebas e2e de notificaciones: canal en vivo (Socket.IO), campanita y recordatorios automáticos (base produccion_test).
 */
import { EVENTO_NOTIFICACION, RUTA_SOCKET, sumarDias, type BandejaNotificaciones, type NotificacionItem, type ProspectoDetalle } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { NotificacionesService } from '../src/notificaciones/notificaciones.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RecordatoriosService } from '../src/recordatorios/recordatorios.service.js';
import { proximoDiaHabil } from './dias.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';

type Quien = 'ana' | 'prod' | 'aux';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR' };

describe('Notificaciones (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let url: string;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  const sockets: Socket[] = [];
  let enfoqueId: string;
  let dia: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const bandeja = async (q: Quien) => (await http().get('/api/notificaciones').set(como(q)).expect(200)).body as BandejaNotificaciones;
  const conectar = (token?: string) => {
    const s = io(url, { path: RUTA_SOCKET, auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    return s;
  };
  const esperar = <T>(s: Socket, evento: string, ms = 3000) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`No llegó "${evento}"`)), ms);
      s.once(evento, (dato: T) => {
        clearTimeout(t);
        resolve(dato);
      });
    });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.listen(0);
    const direccion = app.getHttpServer().address() as { port: number };
    url = `http://127.0.0.1:${direccion.port}`;
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.n.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Avisos', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    dia = await proximoDiaHabil(prisma);
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    const usuarios = Object.values(ids);
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuarioPermiso.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('el canal en vivo exige un token válido', async () => {
    const sinToken = conectar();
    await esperar(sinToken, 'disconnect');
    const falso = conectar('no-es-un-token');
    await esperar(falso, 'disconnect');
    const bueno = conectar(tokens.aux);
    await esperar(bueno, 'connect');
    expect(bueno.connected).toBe(true);
  });

  it('un enfoque por asignar avisa al coordinador y, al asignarse, al responsable en vivo', async () => {
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const actividades = (await http().get('/api/actividades?aplicaA=prospecto').set(como('ana')).expect(200)).body;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo[0].id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), esPrincipal: true }],
          primeraActividad: { actividadId: actividades.find((a: { nombre: string }) => a.nombre === 'Enfoque').id, fecha: dia, hora: '10:00', modalidad: 'virtual' },
        })
        .expect(201)
    ).body as ProspectoDetalle;
    enfoqueId = p.tareas[0].id;
    expect((await bandeja('prod')).items.some((n) => n.tipo === 'tarea.por_asignar' && n.mensaje?.includes(p.codigo) && n.titulo === 'Reunión por programar' && n.enlace === '/reuniones')).toBe(true);
    // Quien hizo la acción no se avisa a sí misma.
    expect((await bandeja('ana')).items.some((n) => n.tipo === 'tarea.por_asignar')).toBe(false);

    const socketAux = sockets.find((s) => s.connected)!;
    const enVivo = esperar<NotificacionItem>(socketAux, EVENTO_NOTIFICACION);
    const cand = (await http().get(`/api/tareas/${enfoqueId}/candidatos`).set(como('prod')).expect(200)).body;
    const quienDa = cand.participaciones.find((x: { obligatoria: boolean }) => x.obligatoria);
    await http().post(`/api/tareas/${enfoqueId}/asignar`).set(como('prod')).send({ responsables: [{ participacionId: quienDa.id, usuarioId: ids.aux }] }).expect(201);
    const recibida = await enVivo;
    expect(recibida).toMatchObject({ tipo: 'tarea.asignada', leida: false, enlace: '/tareas' });
  });

  it('la campanita cuenta las no leídas y cada uno marca solo las suyas', async () => {
    const antes = await bandeja('aux');
    expect(antes.noLeidas).toBeGreaterThan(0);
    const id = antes.items[0].id;
    await http().post(`/api/notificaciones/${id}/leer`).set(como('prod')).expect(204);
    expect((await bandeja('aux')).noLeidas).toBe(antes.noLeidas);
    await http().post(`/api/notificaciones/${id}/leer`).set(como('aux')).expect(204);
    expect((await bandeja('aux')).noLeidas).toBe(antes.noLeidas - 1);
    await http().post('/api/notificaciones/leer-todas').set(como('aux')).expect(204);
    expect((await bandeja('aux')).noLeidas).toBe(0);
  });

  it('recordatorios: reunión próxima y tarea vencida, sin repetirse', async () => {
    const recordatorios = app.get(RecordatoriosService);
    const tarea = await prisma.tarea.findUniqueOrThrow({ where: { id: enfoqueId } });
    const diezAntes = new Date(tarea.inicio!.getTime() - 10 * 60_000);
    await recordatorios.reunionesProximas(diezAntes);
    await recordatorios.reunionesProximas(diezAntes);
    const reunion = (await bandeja('aux')).items.filter((n) => n.tipo === 'recordatorio.reunion');
    expect(reunion).toHaveLength(1);
    expect(reunion[0].titulo).toBe('"Enfoque" empieza a las 10:00');

    const despues = new Date(tarea.inicio!.getTime() + 3 * 3_600_000);
    await recordatorios.vencimientos(sumarDias(dia, 1), despues);
    await recordatorios.vencimientos(sumarDias(dia, 1), despues);
    expect((await bandeja('aux')).items.filter((n) => n.tipo === 'recordatorio.tarea_vencida')).toHaveLength(1);
  });

  it('los destinatarios por permiso respetan las denegaciones', async () => {
    const notificaciones = app.get(NotificacionesService);
    expect(await notificaciones.conPermiso('programacion.reasignar')).toContain(ids.prod);
    const accion = await prisma.accion.findFirstOrThrow({ where: { codigo: 'reasignar', modulo: { codigo: 'programacion' } } });
    await prisma.usuarioPermiso.create({ data: { usuarioId: ids.prod, accionId: accion.id, tipo: 'denegar' } });
    expect(await notificaciones.conPermiso('programacion.reasignar')).not.toContain(ids.prod);
  });
});
