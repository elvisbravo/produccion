/**
 * Pruebas e2e del registro directo de clientes que ya trabajan con nosotros (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type ReporteConversion, type TrabajoDetalle, type UsuarioResumen } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { datosAcademicos } from './datos-academicos.js';

const sufijo = Date.now().toString().slice(-6);
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'admin' | 'prod' | 'ana' | 'aux' | 'jefe';
const ROL: Record<Quien, string> = { admin: 'ADMIN', prod: 'ASIST_PROD', ana: 'ASIST_ADM', aux: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Cliente directo (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let cuerpo: Record<string, unknown>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const enviar = (q: Quien, extra: Record<string, unknown> = {}) => http().post('/api/trabajos/cliente-directo').set(como(q)).send({ ...cuerpo, ...extra });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.cd.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Directo', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const academicos = await datosAcademicos(prisma);
    cuerpo = {
      integrantes: [{ celular: `9${sufijo}71`, nombres: 'Rocío', apellidos: 'Valdivia', email: `rocio.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `7${sufijo}1`, esTitular: true }],
      tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
      prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
      responsableId: ids.ana,
      trabajo: { titulo: 'Tesis ya contratada', fechaInicio: sumarDias(hoy, -20), fechaLimite: sumarDias(hoy, 40), ...academicos },
      contrato: { fechaFirma: sumarDias(hoy, -20), montoTotal: 1200, formaPago: 'cuotas', cuotas: [{ monto: 400, vencimiento: sumarDias(hoy, -20) }, { monto: 400, vencimiento: sumarDias(hoy, -5) }, { monto: 400, vencimiento: sumarDias(hoy, 20) }] },
      pagos: [{ monto: 400, fecha: sumarDias(hoy, -20), metodo: 'yape' }, { monto: 100, fecha: sumarDias(hoy, -3), metodo: 'efectivo' }],
    };
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { creadoPor: { in: usuarios } } });
    await prisma.prospecto.deleteMany({ where: { creadoPor: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('solo lo registra quien tiene el permiso (configurable): administrador y asistente de producción', async () => {
    await enviar('aux').expect(403);
    await enviar('ana').expect(403);
    await http().get('/api/trabajos/cliente-directo/responsables').set(como('aux')).expect(403);
  });

  it('ofrece como responsables a quienes pueden seguir clientes', async () => {
    const lista = (await http().get('/api/trabajos/cliente-directo/responsables').set(como('prod')).expect(200)).body as UsuarioResumen[];
    expect(lista.map((u) => u.id)).toEqual(expect.arrayContaining([ids.ana, ids.prod, ids.jefe]));
    expect(lista.map((u) => u.id)).not.toContain(ids.aux);
  });

  it('exige los datos completos', async () => {
    const vacio = await http().post('/api/trabajos/cliente-directo').set(como('prod')).send({}).expect(400);
    expect(vacio.body.errores.map((e: { campo: string }) => e.campo)).toEqual(expect.arrayContaining(['integrantes', 'tipoTrabajoId', 'prioridadId', 'responsableId', 'trabajo', 'contrato']));
    const sinDoc = await enviar('prod', { integrantes: [{ celular: `9${sufijo}71`, nombres: 'A', apellidos: 'B', email: 'a@b.com', esTitular: true }] }).expect(400);
    expect(sinDoc.body.errores.map((e: { campo: string }) => e.campo)).toEqual(expect.arrayContaining(['integrantes.0.tipoDocumento', 'integrantes.0.numeroDocumento']));
    const sinCorreo = await enviar('prod', { integrantes: [{ celular: `9${sufijo}71`, nombres: 'A', apellidos: 'B', tipoDocumento: 'DNI', numeroDocumento: `7${sufijo}1`, esTitular: true }] }).expect(400);
    expect(sinCorreo.body.errores[0].mensaje).toContain('un correo');
    await enviar('prod', { responsableId: ids.aux }).expect(400); // un auxiliar no sigue clientes
    await enviar('prod', { pagos: [{ monto: 5000, fecha: hoy, metodo: 'yape' }] }).expect(400); // supera el contrato
    await enviar('prod', { pagos: [{ monto: 100, fecha: sumarDias(hoy, -40), metodo: 'yape' }] }).expect(400); // antes de la firma
  });

  it('registra al cliente con su contrato firmado en el pasado y los pagos ya recibidos', async () => {
    const registrado = (await enviar('prod').expect(201)).body as TrabajoDetalle;
    // El asistente de producción no ve contratos ni montos: se lee con el administrador.
    expect(registrado.contrato).toBeNull();
    trabajo = (await http().get(`/api/trabajos/${registrado.id}`).set(como('admin')).expect(200)).body;
    expect(trabajo.codigo).toMatch(/^T-\d{4}-\d{4}$/);
    expect(trabajo.estado).toBe('sin_asignar');
    expect(trabajo.integrantes[0]).toMatchObject({ nombres: 'Rocío', esTitular: true });
    expect(trabajo.contrato).toMatchObject({ montoContrato: 1200, formaPago: 'cuotas' });
    expect(trabajo.contrato!.cuotas).toHaveLength(3);
    expect(trabajo.contrato!.pagos).toHaveLength(2);
    expect(trabajo.contrato!.cuenta).toMatchObject({ pagado: 500, saldo: 700 });
    // La cuota 2 ya venció y solo está parcialmente pagada
    expect(trabajo.contrato!.cuenta!.vencido).toBeGreaterThan(0);
    expect(trabajo.seguimiento.etiquetas.concat(trabajo.seguimiento.principal)).toContain('pendiente_pago');
    // Se avisa a quien arma equipos
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.prod, tipo: 'trabajo.nuevo' } })).toBe(0); // quien lo registra no se avisa a sí mismo
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.admin, tipo: 'trabajo.nuevo' } })).toBe(1);
  });

  it('queda marcado como cliente directo: el responsable es el elegido y no cuenta en la conversión', async () => {
    const origen = await prisma.prospecto.findFirstOrThrow({ where: { trabajo: { id: trabajo.id } }, include: { origen: true, etapa: true } });
    expect(origen).toMatchObject({ clienteDirecto: true, responsableId: ids.ana });
    expect(origen.origen.nombre).toBe('Cliente directo');
    expect(origen.etapa.clase).toBe('ganada');
    const reporte = (await http().get(`/api/reportes/conversion?desde=${sumarDias(hoy, -1)}&hasta=${hoy}`).set(como('admin')).expect(200)).body as ReporteConversion;
    expect(reporte.porOrigen.map((o) => o.nombre)).not.toContain('Cliente directo');
    // La asistente administrativa lo ve entre sus clientes y recibe los avisos de cobro
    const visible = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('ana')).expect(200)).body as TrabajoDetalle;
    expect(visible.id).toBe(trabajo.id);
  });

  it('un mismo cliente puede tener otro trabajo: se reutiliza la persona (mismo celular y documento)', async () => {
    const creado = (await enviar('prod', { trabajo: { ...(cuerpo.trabajo as object), titulo: 'Segundo trabajo del mismo cliente' }, pagos: [] }).expect(201)).body as TrabajoDetalle;
    const otro = (await http().get(`/api/trabajos/${creado.id}`).set(como('admin')).expect(200)).body as TrabajoDetalle;
    expect(otro.codigo).not.toBe(trabajo.codigo);
    expect(otro.integrantes[0].id).toBe(trabajo.integrantes[0].id);
    expect(otro.contrato!.pagos).toHaveLength(0);
  });

  it('desde ahí sigue el flujo normal: armar equipo y el trabajo se ve con su cuenta', async () => {
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    const t = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('admin')).expect(200)).body as TrabajoDetalle;
    expect(t.estado).toBe('asignado');
  });
});
