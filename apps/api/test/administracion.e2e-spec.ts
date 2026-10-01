/**
 * Pruebas e2e de administración: usuarios, roles y permisos, contraseña, parámetros y auditoría (base produccion_test).
 */
import {
  EVENTO_SESION_ACTUALIZADA,
  EVENTO_SESION_CERRADA,
  RUTA_SOCKET,
  type AuditoriaItem,
  type ClaveTemporal,
  type ParametroItem,
  type RolDetalle,
  type UsuarioDetalle,
  type UsuarioSesion,
} from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const PASSWORD = 'Prueba-e2e-123';
const emailNuevo = `e2e.adm.nuevo.${sufijo}@grupoes.local`;
const dniNuevo = `99${sufijo}`;

describe('Administración (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let url: string;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const sockets: Socket[] = [];
  let nuevo: UsuarioDetalle;
  let claveNuevo: string;
  let rol: RolDetalle;

  const http = () => request(app.getHttpServer());
  const como = (token: string) => ({ Authorization: `Bearer ${token}` });
  const login = async (email: string, password: string) => (await http().post('/api/auth/login').send({ email, password }).expect(200)).body.accessToken as string;
  const me = async (token: string) => (await http().get('/api/auth/me').set(como(token)).expect(200)).body as UsuarioSesion;
  const escuchar = (token: string, evento: string) =>
    new Promise<void>((resolve, reject) => {
      const s = io(url, { path: RUTA_SOCKET, auth: { token }, transports: ['websocket'], reconnection: false });
      sockets.push(s);
      const t = setTimeout(() => reject(new Error(`No llegó "${evento}"`)), 4000);
      s.on(evento, () => {
        clearTimeout(t);
        resolve();
      });
    });
  const conectado = (s: Socket) => new Promise<void>((resolve) => (s.connected ? resolve() : s.once('connect', () => resolve())));

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
    prisma = app.get(PrismaService);

    for (const [q, codigo] of [['admin', 'ADMIN'], ['prod', 'ASIST_PROD']] as const) {
      const email = `e2e.adm.${q}.${sufijo}@grupoes.local`;
      const r = await prisma.rol.findUniqueOrThrow({ where: { codigo } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Admin', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: r.id } } },
      });
      ids[q] = u.id;
      tokens[q] = await login(email, PASSWORD);
    }
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    const usuarios = [...Object.values(ids), nuevo?.id].filter(Boolean);
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.rol.deleteMany({ where: { nombre: { startsWith: `Practicante ${sufijo}` } } });
    await prisma.parametro.deleteMany({ where: { clave: 'seguridad.bloqueo_minutos' } });
    await app.close();
  });

  it('el administrador crea usuarios con una contraseña temporal', async () => {
    const asistente = (await http().get('/api/roles').set(como(tokens.admin)).expect(200)).body.find((r: { codigo: string }) => r.codigo === 'AUXILIAR');
    const datos = { nombres: 'Nuevo', apellidos: 'Auxiliar', email: emailNuevo, tipoDocumento: 'DNI', numeroDocumento: dniNuevo, rolIds: [asistente.id] };
    await http().post('/api/usuarios').set(como(tokens.prod)).send(datos).expect(403);
    // El documento es obligatorio y debe tener el formato de su tipo.
    const { tipoDocumento: _t, numeroDocumento: _n, ...sinDocumento } = datos;
    await http().post('/api/usuarios').set(como(tokens.admin)).send(sinDocumento).expect(400);
    await http().post('/api/usuarios').set(como(tokens.admin)).send({ ...datos, numeroDocumento: '1234' }).expect(400);
    const r = (await http().post('/api/usuarios').set(como(tokens.admin)).send(datos).expect(201)).body as ClaveTemporal;
    nuevo = r.usuario;
    claveNuevo = r.claveTemporal!;
    expect(claveNuevo).toMatch(/^(?=.*[a-zA-Z])(?=.*\d).{12}$/);
    expect(nuevo).toMatchObject({ debeCambiarClave: true, activo: true, tipoDocumento: 'DNI', numeroDocumento: dniNuevo, roles: [{ codigo: 'AUXILIAR' }] });
    // El correo y el documento no se repiten.
    await http().post('/api/usuarios').set(como(tokens.admin)).send(datos).expect(409);
    const mismoDocumento = await http()
      .post('/api/usuarios')
      .set(como(tokens.admin))
      .send({ ...datos, email: `otro.${emailNuevo}` })
      .expect(409);
    expect(mismoDocumento.body.errores[0].campo).toBe('numeroDocumento');
    // Se busca por documento.
    const buscados = (await http().get(`/api/usuarios?q=${dniNuevo}`).set(como(tokens.admin)).expect(200)).body as { id: string }[];
    expect(buscados.map((u) => u.id)).toEqual([nuevo.id]);
  });

  it('en el primer ingreso debe cambiar la contraseña, con la política mínima', async () => {
    tokens.nuevo = await login(emailNuevo, claveNuevo);
    expect((await me(tokens.nuevo)).debeCambiarClave).toBe(true);
    await http().post('/api/auth/cambiar-clave').set(como(tokens.nuevo)).send({ actual: 'otra-cosa-123', nueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' }).expect(400);
    await http().post('/api/auth/cambiar-clave').set(como(tokens.nuevo)).send({ actual: claveNuevo, nueva: 'corta1', confirmacion: 'corta1' }).expect(400);
    await http().post('/api/auth/cambiar-clave').set(como(tokens.nuevo)).send({ actual: claveNuevo, nueva: 'NuevaClave2026', confirmacion: 'NuevaClave2026' }).expect(204);
    expect((await me(tokens.nuevo)).debeCambiarClave).toBe(false);
    claveNuevo = 'NuevaClave2026';
  });

  it('un rol nuevo con su matriz de permisos; el usuario lo ve al instante', async () => {
    rol = (await http().post('/api/roles').set(como(tokens.admin)).send({ nombre: `Practicante ${sufijo}`, descripcion: 'Apoyo temporal' }).expect(201)).body;
    expect(rol.codigo).toMatch(/^PRACTICANTE_/);
    expect(rol.esSistema).toBe(false);

    await http().put(`/api/usuarios/${nuevo.id}/roles`).set(como(tokens.admin)).send({ rolIds: [rol.id] }).expect(200);
    expect((await me(tokens.nuevo)).permisos).toEqual({});

    const enVivo = escuchar(tokens.nuevo, EVENTO_SESION_ACTUALIZADA);
    await conectado(sockets.at(-1)!);
    rol = (
      await http()
        .put(`/api/roles/${rol.id}/permisos`)
        .set(como(tokens.admin))
        .send({ permisos: [{ permiso: 'tareas.ver', alcance: null }, { permiso: 'agenda.ver', alcance: null }] })
        .expect(200)
    ).body;
    await enVivo;
    // tareas.ver usa alcance: si no se indica, queda en "propios".
    expect(rol.matriz).toEqual([
      { permiso: 'agenda.ver', alcance: null },
      { permiso: 'tareas.ver', alcance: 'propios' },
    ]);
    const sesion = await me(tokens.nuevo);
    expect(sesion.permisos).toEqual({ 'agenda.ver': null, 'tareas.ver': 'propios' });
    expect(sesion.menu.flatMap((g) => g.hijos.map((h) => h.codigo))).toEqual(expect.arrayContaining(['agenda', 'tareas']));
  });

  it('excepciones por usuario: denegar gana sobre el rol; el detalle muestra el origen', async () => {
    await http().post(`/api/usuarios/${nuevo.id}/excepciones`).set(como(tokens.admin)).send({ permiso: 'agenda.ver', tipo: 'denegar', motivo: 'Aún en inducción' }).expect(201);
    const conceder = (
      await http()
        .post(`/api/usuarios/${nuevo.id}/excepciones`)
        .set(como(tokens.admin))
        .send({ permiso: 'prospectos.ver', tipo: 'conceder', alcance: 'propios', motivo: 'Apoya en seguimiento' })
        .expect(201)
    ).body as UsuarioDetalle;
    expect((await me(tokens.nuevo)).permisos).toEqual({ 'tareas.ver': 'propios', 'prospectos.ver': 'propios' });
    expect(conceder.efectivos).toEqual(
      expect.arrayContaining([
        { permiso: 'tareas.ver', alcance: 'propios', origen: 'rol', roles: [rol.nombre] },
        { permiso: 'prospectos.ver', alcance: 'propios', origen: 'concedido', roles: [] },
      ]),
    );
    const denegacion = conceder.excepciones.find((e) => e.tipo === 'denegar')!;
    await http().delete(`/api/usuarios/${nuevo.id}/excepciones/${denegacion.id}`).set(como(tokens.admin)).expect(200);
    expect('agenda.ver' in (await me(tokens.nuevo)).permisos).toBe(true);
  });

  it('los roles del sistema no se eliminan; uno con usuarios, tampoco', async () => {
    const roles = (await http().get('/api/roles').set(como(tokens.admin)).expect(200)).body as RolDetalle[];
    await http().delete(`/api/roles/${roles.find((r) => r.codigo === 'AUXILIAR')!.id}`).set(como(tokens.admin)).expect(400);
    const admin = roles.find((r) => r.codigo === 'ADMIN')!;
    await http().put(`/api/roles/${admin.id}/permisos`).set(como(tokens.admin)).send({ permisos: [] }).expect(400);
    await http().delete(`/api/roles/${rol.id}`).set(como(tokens.admin)).expect(400);
  });

  it('restablecer la contraseña y desactivar cierran la sesión', async () => {
    await http().post(`/api/usuarios/${ids.admin}/desactivar`).set(como(tokens.admin)).expect(400);

    const r = (await http().post(`/api/usuarios/${nuevo.id}/restablecer-clave`).set(como(tokens.admin)).expect(201)).body as ClaveTemporal;
    await http().post('/api/auth/login').send({ email: emailNuevo, password: claveNuevo }).expect(401);
    tokens.nuevo = await login(emailNuevo, r.claveTemporal!);
    expect((await me(tokens.nuevo)).debeCambiarClave).toBe(true);

    const cerrada = escuchar(tokens.nuevo, EVENTO_SESION_CERRADA);
    await conectado(sockets.at(-1)!);
    await http().post(`/api/usuarios/${nuevo.id}/desactivar`).set(como(tokens.admin)).expect(201);
    await cerrada;
    const fallo = await http().post('/api/auth/login').send({ email: emailNuevo, password: r.claveTemporal }).expect(401);
    expect(fallo.body.message).toBe('Usuario desactivado');
    // El rol ya puede eliminarse si se le quita a su único usuario.
    await http().post(`/api/usuarios/${nuevo.id}/activar`).set(como(tokens.admin)).expect(201);
    const auxiliar = (await http().get('/api/roles').set(como(tokens.admin)).expect(200)).body.find((x: { codigo: string }) => x.codigo === 'AUXILIAR');
    await http().put(`/api/usuarios/${nuevo.id}/roles`).set(como(tokens.admin)).send({ rolIds: [auxiliar.id] }).expect(200);
    await http().delete(`/api/roles/${rol.id}`).set(como(tokens.admin)).expect(204);
  });

  it('parámetros con límites y auditoría de todo lo anterior', async () => {
    await http().get('/api/parametros').set(como(tokens.prod)).expect(403);
    const lista = (await http().get('/api/parametros').set(como(tokens.admin)).expect(200)).body as ParametroItem[];
    expect(lista.find((p) => p.clave === 'notificaciones.minutos_aviso_reunion')).toMatchObject({ porDefecto: 15, unidad: 'min' });
    await http().put('/api/parametros').set(como(tokens.admin)).send({ valores: { 'seguridad.bloqueo_minutos': 0 } }).expect(400);
    await http().put('/api/parametros').set(como(tokens.admin)).send({ valores: { 'seguridad.inactividad_minutos': null } }).expect(400);
    const guardado = (await http().put('/api/parametros').set(como(tokens.admin)).send({ valores: { 'seguridad.bloqueo_minutos': 20 } }).expect(200)).body as ParametroItem[];
    expect(guardado.find((p) => p.clave === 'seguridad.bloqueo_minutos')!.valor).toBe(20);

    const auditoria = (await http().get(`/api/auditoria?entidad=rol&usuarioId=${ids.admin}`).set(como(tokens.admin)).expect(200)).body as { datos: AuditoriaItem[]; entidades: string[] };
    expect(auditoria.datos.map((a) => a.accion)).toEqual(expect.arrayContaining(['crear', 'editar_permisos', 'eliminar']));
    expect(auditoria.entidades).toContain('usuario');
  });
});
