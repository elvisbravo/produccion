/**
 * Pruebas e2e: quien no puede gestionar administradores no ve ni toca sus cuentas (base produccion_test).
 */
import { diaEnLima, type AuditoriaItem, type Paginado, type RolItem, type UsuarioDetalle, type UsuarioListadoItem, type UsuarioResumen } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

/** "prod": asistente de producción con casi toda la administración de usuarios; "sup": igual, pero puede gestionar administradores. */
type Quien = 'admin' | 'admin2' | 'prod' | 'sup' | 'aux';
const ROL: Record<Quien, string> = { admin: 'ADMIN', admin2: 'ADMIN', prod: 'ASIST_PROD', sup: 'ASIST_PROD', aux: 'AUXILIAR' };
const PERMISOS_DELEGADOS = [
  'usuarios.ver',
  'usuarios.crear',
  'usuarios.editar',
  'usuarios.desactivar',
  'usuarios.asignar_roles',
  'usuarios.asignar_permisos',
  'usuarios.restablecer_clave',
  'usuarios.ver_costo_hora',
  'roles.ver',
  'roles.editar',
  'auditoria.ver',
  'prospectos.reasignar',
];

describe('Administradores ocultos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let rolAdminId: string;
  let rolJefeId: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  // Cada caso lleva un DNI distinto de 8 dígitos (el índice y el sufijo de la corrida).
  const datosUsuario = (n: string, i: number) => ({ nombres: `Nuevo ${n}`, apellidos: 'Admin', email: `nuevo.${n}.${sufijo}@grupoes.local`, tipoDocumento: 'DNI', numeroDocumento: `${6 + i}${sufijo}1` });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    rolAdminId = (await prisma.rol.findUniqueOrThrow({ where: { codigo: 'ADMIN' } })).id;
    rolJefeId = (await prisma.rol.findUniqueOrThrow({ where: { codigo: 'JEFE_PROD' } })).id;

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.ad.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Ocultos', email, tipoDocumento: 'DNI', numeroDocumento: `${['admin', 'admin2', 'prod', 'sup', 'aux'].indexOf(q)}${sufijo}1`.slice(0, 8), passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
    }
    // Permisos individuales: "prod" los tiene todos menos gestionar administradores; "sup" también ese.
    const acciones = await prisma.accion.findMany({ where: { vigente: true }, include: { modulo: { select: { codigo: true } } } });
    const conceder = async (q: Quien, permisos: string[]) => {
      for (const a of acciones.filter((x) => permisos.includes(`${x.modulo.codigo}.${x.codigo}`))) {
        await prisma.usuarioPermiso.create({ data: { usuarioId: ids[q], accionId: a.id, tipo: 'conceder', alcance: a.usaAlcance ? 'todos' : null, otorgadoPor: ids.admin } });
      }
    };
    await conceder('prod', PERMISOS_DELEGADOS);
    await conceder('sup', [...PERMISOS_DELEGADOS, 'usuarios.gestionar_administradores']);
    for (const q of Object.keys(ROL) as Quien[]) {
      tokens[q] = (await http().post('/api/auth/login').send({ email: `e2e.ad.${q}.${sufijo}@grupoes.local`, password: PASSWORD }).expect(200)).body.accessToken;
    }
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    const creados = await prisma.usuario.findMany({ where: { email: { contains: `.${sufijo}@grupoes.local` } }, select: { id: true } });
    const todos = [...new Set([...usuarios, ...creados.map((c) => c.id)])];
    await prisma.auditoria.deleteMany({ where: { OR: [{ usuarioId: { in: todos } }, { entidadId: { in: todos } }] } });
    await prisma.rol.deleteMany({ where: { nombre: { startsWith: `Rol ocultos ${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: todos } } });
    await app.close();
  });

  it('el listado y la búsqueda no incluyen administradores para quien no puede gestionarlos', async () => {
    const lista = async (q: Quien, consulta = '') => ((await http().get(`/api/usuarios?estado=todos${consulta}`).set(como(q)).expect(200)).body as UsuarioListadoItem[]).map((u) => u.id);
    const deProd = await lista('prod');
    expect(deProd).toEqual(expect.arrayContaining([ids.aux, ids.prod, ids.sup]));
    expect(deProd).not.toContain(ids.admin);
    expect(deProd).not.toContain(ids.admin2);
    expect(await lista('prod', '&q=E2E%20admin')).not.toContain(ids.admin);
    // El administrador y quien puede gestionarlos los ven.
    for (const q of ['admin', 'sup'] as const) expect(await lista(q)).toEqual(expect.arrayContaining([ids.admin, ids.admin2]));
  });

  it('la ficha y cualquier acción sobre un administrador responden "no encontrado"', async () => {
    const id = ids.admin2;
    const como_ = como('prod');
    const llamadas = [
      () => http().get(`/api/usuarios/${id}`).set(como_),
      () => http().put(`/api/usuarios/${id}`).set(como_).send({ ...datosUsuario('x', 0), celular: '', fechaNacimiento: '' }),
      () => http().post(`/api/usuarios/${id}/desactivar`).set(como_),
      () => http().post(`/api/usuarios/${id}/activar`).set(como_),
      () => http().put(`/api/usuarios/${id}/roles`).set(como_).send({ rolIds: [rolJefeId] }),
      () => http().post(`/api/usuarios/${id}/excepciones`).set(como_).send({ permiso: 'prospectos.ver', tipo: 'conceder', motivo: 'prueba' }),
      () => http().post(`/api/usuarios/${id}/restablecer-clave`).set(como_),
      () => http().post(`/api/usuarios/${id}/desbloquear`).set(como_),
      () => http().put(`/api/usuarios/${id}/topes-horas-extra`).set(como_).send({ semanal: 1, mensual: 2 }),
      () => http().get(`/api/usuarios/${id}/pendientes`).set(como_),
      () => http().get(`/api/usuarios/${id}/costos-hora`).set(como_),
      () => http().post(`/api/usuarios/${id}/costos-hora`).set(como_).send({ costo: 10, vigenteDesde: hoy }),
      () => http().post('/api/prospectos/reasignar-lote').set(como_).send({ desdeUsuarioId: id, aUsuarioId: ids.aux }),
    ];
    for (const enviar of llamadas) expect((await enviar()).status).toBe(404);
    // Nada cambió.
    const intacto = (await http().get(`/api/usuarios/${id}`).set(como('admin')).expect(200)).body as UsuarioDetalle;
    expect(intacto).toMatchObject({ activo: true, roles: [{ codigo: 'ADMIN' }] });
    // Quien puede gestionar administradores sí los ve.
    await http().get(`/api/usuarios/${id}`).set(como('sup')).expect(200);
  });

  it('gestiona con normalidad a los demás usuarios', async () => {
    await http()
      .put(`/api/usuarios/${ids.aux}`)
      .set(como('prod'))
      .send({ ...datosUsuario('aux', 1), celular: '', fechaNacimiento: '' })
      .expect(200);
    expect(((await http().get(`/api/usuarios/${ids.aux}`).set(como('prod')).expect(200)).body as UsuarioDetalle).nombres).toBe('Nuevo aux');
  });

  it('no puede escalar privilegios: ni el rol Administrador, ni roles con más permisos, ni sobre sí mismo', async () => {
    await http().post('/api/usuarios').set(como('prod')).send({ ...datosUsuario('a1', 2), rolIds: [rolAdminId] }).expect(403);
    await http().put(`/api/usuarios/${ids.aux}/roles`).set(como('prod')).send({ rolIds: [rolAdminId] }).expect(403);
    // El jefe de producción aprueba entregables y "prod" no tiene ese permiso.
    await http().put(`/api/usuarios/${ids.aux}/roles`).set(como('prod')).send({ rolIds: [rolJefeId] }).expect(403);
    // Sobre sí mismo.
    await http().put(`/api/usuarios/${ids.prod}/roles`).set(como('prod')).send({ rolIds: [rolJefeId] }).expect(403);
    await http().post(`/api/usuarios/${ids.prod}/excepciones`).set(como('prod')).send({ permiso: 'prospectos.ver', tipo: 'denegar', motivo: 'prueba' }).expect(403);
    // Conceder solo lo que se tiene.
    await http().post(`/api/usuarios/${ids.aux}/excepciones`).set(como('prod')).send({ permiso: 'roles.eliminar', tipo: 'conceder', motivo: 'prueba' }).expect(403);
    await http().post(`/api/usuarios/${ids.aux}/excepciones`).set(como('prod')).send({ permiso: 'usuarios.gestionar_administradores', tipo: 'conceder', motivo: 'prueba' }).expect(403);
    await http().post(`/api/usuarios/${ids.aux}/excepciones`).set(como('prod')).send({ permiso: 'prospectos.ver', tipo: 'conceder', alcance: 'propios', motivo: 'prueba' }).expect(201);
  });

  it('los roles: el de administrador no aparece y no se puede dar a un rol un permiso que no se tiene', async () => {
    const codigos = async (q: Quien) => ((await http().get('/api/roles').set(como(q)).expect(200)).body as RolItem[]).map((r) => r.codigo);
    expect(await codigos('prod')).not.toContain('ADMIN');
    expect(await codigos('admin')).toContain('ADMIN');
    expect(await codigos('sup')).toContain('ADMIN');
    await http().get(`/api/roles/${rolAdminId}`).set(como('prod')).expect(404);

    const rol = (await http().post('/api/roles').set(como('admin')).send({ nombre: `Rol ocultos ${sufijo}`, descripcion: 'prueba', activo: true }).expect(201)).body as RolItem;
    await http().put(`/api/roles/${rol.id}/permisos`).set(como('prod')).send({ permisos: [{ permiso: 'roles.eliminar', alcance: null }] }).expect(403);
    await http().put(`/api/roles/${rol.id}/permisos`).set(como('prod')).send({ permisos: [{ permiso: 'usuarios.ver', alcance: null }] }).expect(200);
  });

  it('la auditoría no muestra los cambios a cuentas de administradores', async () => {
    await http().put(`/api/usuarios/${ids.admin2}`).set(como('admin')).send({ ...datosUsuario('b', 3), celular: '', fechaNacimiento: '' }).expect(200);
    const entidades = async (q: Quien) =>
      ((await http().get('/api/auditoria?entidad=usuario').set(como(q)).expect(200)).body as Paginado<AuditoriaItem>).datos.map((a) => a.entidadId);
    const deProd = await entidades('prod');
    expect(deProd).toContain(ids.aux);
    expect(deProd).not.toContain(ids.admin2);
    expect(await entidades('admin')).toContain(ids.admin2);
    expect(await entidades('sup')).toContain(ids.admin2);
  });

  it('al reasignar prospectos, los administradores no se ofrecen a quien no los ve', async () => {
    const lista = async (q: Quien) => ((await http().get('/api/prospectos/posibles-responsables').set(como(q)).expect(200)).body as UsuarioResumen[]).map((u) => u.id);
    const deProd = await lista('prod');
    expect(deProd).toContain(ids.sup);
    expect(deProd).not.toContain(ids.admin);
    expect(await lista('admin')).toContain(ids.admin);
  });
});
