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
    expect(vacio.body.errores.map((e: { campo: string }) => e.campo)).toEqual(expect.arrayContaining(['integrantes', 'tipoTrabajoId', 'prioridadId', 'responsableId', 'trabajo']));
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

  it('el contrato y el monto total no son obligatorios: sin monto no hay contrato y se registra después', async () => {
    const { contrato: _c, pagos: _p, ...sinMonto } = cuerpo as Record<string, unknown>;
    const celular = `9${sufijo}72`;
    const integrantes = [{ celular, nombres: 'Sin', apellidos: 'Monto', email: `sin.monto.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `6${sufijo}1`, esTitular: true }];
    // Pagos sin contrato no tienen sentido
    await http().post('/api/trabajos/cliente-directo').set(como('prod')).send({ ...sinMonto, integrantes, pagos: [{ monto: 50, fecha: hoy, metodo: 'yape' }] }).expect(400);
    const creado = (await http().post('/api/trabajos/cliente-directo').set(como('prod')).send({ ...sinMonto, integrantes }).expect(201)).body as TrabajoDetalle;
    const t = (await http().get(`/api/trabajos/${creado.id}`).set(como('admin')).expect(200)).body as TrabajoDetalle;
    expect(t.contrato).toBeNull();
    expect(t.clienteDirecto).toBe(true);
    expect(t.eventos.map((e) => e.tipo)).not.toContain('contrato');
    // Después se registra el cobro (con la garantía del tipo de trabajo) y no se puede repetir
    const cobro = { montoTotal: 500, formaPago: 'contado', cuotas: [{ monto: 500, vencimiento: hoy }] };
    await http().post(`/api/trabajos/${t.id}/cobro`).set(como('aux')).send(cobro).expect(403);
    const conCobro = (await http().post(`/api/trabajos/${t.id}/cobro`).set(como('admin')).send(cobro).expect(200)).body as TrabajoDetalle;
    expect(conCobro.contrato).toMatchObject({ montoContrato: 500 });
    expect(conCobro.contrato!.diasGarantia).toBeGreaterThan(0);
    await http().post(`/api/trabajos/${t.id}/cobro`).set(como('admin')).send(cobro).expect(409);
    // Un trabajo de cliente que sí nació con contrato no se cobra por esta vía
    await http().post(`/api/trabajos/${trabajo.id}/cobro`).set(como('admin')).send(cobro).expect(409);
  });

  it('el trabajo del cliente puede ser de un proveedor: el proveedor entrega y paga', async () => {
    const proveedor = await prisma.proveedor.create({ data: { nombres: `E2E${sufijo}`, apellidos: 'Proveedora', creadoPor: ids.admin } });
    const inactivo = await prisma.proveedor.create({ data: { nombres: `E2E${sufijo}`, apellidos: 'Inactivo', activo: false, creadoPor: ids.admin } });
    const integrantes = [{ celular: `9${sufijo}73`, nombres: 'Con', apellidos: 'Proveedor', email: `con.prov.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `5${sufijo}1`, esTitular: true }];
    await enviar('prod', { integrantes, proveedorId: inactivo.id }).expect(400);
    await enviar('prod', { integrantes, proveedorId: '0199a000-0000-7000-8000-000000000009' }).expect(400);
    const creado = (await enviar('prod', { integrantes, proveedorId: proveedor.id, pagos: [{ monto: 400, fecha: sumarDias(hoy, -20), metodo: 'yape' }] }).expect(201)).body as TrabajoDetalle;
    const t = (await http().get(`/api/trabajos/${creado.id}`).set(como('admin')).expect(200)).body as TrabajoDetalle;
    // Es del cliente (titular) y a la vez de un proveedor
    expect(t.proveedor).toMatchObject({ id: proveedor.id });
    expect(t.integrantes[0]).toMatchObject({ nombres: 'Con', esTitular: true });
    expect(t.clienteDirecto).toBe(true);
    expect(t.eventos.map((e) => e.detalle).join(' ')).toContain('trabajo del proveedor');
    // Aparece en los trabajos del proveedor y en los del cliente
    const delProveedor = (await http().get(`/api/trabajos?proveedorId=${proveedor.id}`).set(como('admin')).expect(200)).body.datos as { id: string }[];
    expect(delProveedor.map((x) => x.id)).toContain(t.id);
    const delCliente = (await http().get(`/api/trabajos?personaId=${t.integrantes[0].id}`).set(como('admin')).expect(200)).body.datos as { id: string }[];
    expect(delCliente.map((x) => x.id)).toContain(t.id);
    // El recibo sale a nombre del proveedor
    const recibo = (await http().get(`/api/documentos/recibo/${t.contrato!.pagos![0].id}`).set(como('admin')).expect(200)).body;
    expect(recibo.cliente.nombre).toBe(`E2E${sufijo} Proveedora`);
    // No lleva contrato impreso (el proveedor paga)
    await http().get(`/api/documentos/contrato/${t.id}`).set(como('admin')).expect(400);
    // La ficha de la persona y la búsqueda de clientes
    expect(((await http().get(`/api/personas?q=Con%20Proveedor&clientes=1`).set(como('prod')).expect(200)).body as { id: string }[]).map((p) => p.id)).toContain(t.integrantes[0].id);
    expect((await http().get(`/api/personas/${t.integrantes[0].id}`).set(como('prod')).expect(200)).body).toMatchObject({ nombres: 'Con' });
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
    await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
    await prisma.proveedor.deleteMany({ where: { id: { in: [proveedor.id, inactivo.id] } } });
  });

  it('un trabajo con título largo (más de 150 caracteres) también se programa', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const elaboracion = actividades.find((a) => a.nombre === 'Elaboración')!;
    const integrantes = [{ celular: `9${sufijo}77`, nombres: 'Con', apellidos: 'TituloLargo', email: `con.largo.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `8${sufijo}1`, esTitular: true }];
    const titulo = 'Estrategias de marketing digital y su influencia en el posicionamiento de las micro y pequeñas empresas del sector turismo de la región, periodo 2023 - 2025, un estudio descriptivo correlacional'.padEnd(250, ' x');
    const programacion = { actividadId: elaboracion.id, minutosEstimados: 60, hora: '10:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe };
    const base = { integrantes, trabajo: { ...(cuerpo.trabajo as object), titulo, fechaInicio: hoy, fechaLimite: sumarDias(hoy, 30) }, contrato: undefined, pagos: [] };
    const creado = (await enviar('prod', { ...base, programacion }).expect(201)).body as TrabajoDetalle;
    expect(creado.entregables[0].tareas[0].titulo?.length).toBeLessThanOrEqual(150);
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
  });

  it('si el trabajo es de un proveedor, los integrantes son opcionales', async () => {
    const proveedor = await prisma.proveedor.create({ data: { nombres: `E2E${sufijo}`, apellidos: 'SinCliente', creadoPor: ids.admin } });
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const elaboracion = actividades.find((a) => a.nombre === 'Elaboración')!;
    const programacion = { actividadId: elaboracion.id, minutosEstimados: 60, hora: '10:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe };
    // Sin proveedor siguen siendo obligatorios
    await enviar('prod', { integrantes: [] }).expect(400);
    const creado = (await enviar('prod', { integrantes: [], proveedorId: proveedor.id, programacion, pagos: [], contrato: undefined }).expect(201)).body as TrabajoDetalle;
    expect(creado.integrantes).toHaveLength(0);
    expect(creado.proveedor).toMatchObject({ id: proveedor.id });
    expect(creado.entregables[0].tareas).toHaveLength(1);
    // Se puede abrir su ficha
    await http().get(`/api/trabajos/${creado.id}`).set(como('prod')).expect(200);
    const lista = (await http().get(`/api/trabajos?proveedorId=${proveedor.id}`).set(como('admin')).expect(200)).body.datos as { id: string }[];
    expect(lista.map((x) => x.id)).toContain(creado.id);
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
    await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
    await prisma.proveedor.deleteMany({ where: { id: proveedor.id } });
  });

  it('el listado de trabajos se filtra por asistente administrativa', async () => {
    const integrantes = [{ celular: `9${sufijo}79`, nombres: 'Con', apellidos: 'Filtro', email: `con.filtro.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `9${sufijo}1`, esTitular: true }];
    const creado = (await enviar('prod', { integrantes, pagos: [] }).expect(201)).body as TrabajoDetalle;
    const asistentes = (await http().get('/api/trabajos/asistentes-administrativas').set(como('prod')).expect(200)).body as { id: string }[];
    expect(asistentes.map((a) => a.id)).toContain(ids.ana);
    const deAna = (await http().get(`/api/trabajos?responsableId=${ids.ana}`).set(como('admin')).expect(200)).body.datos as { id: string }[];
    expect(deAna.map((t) => t.id)).toContain(creado.id);
    const deOtra = (await http().get(`/api/trabajos?responsableId=${ids.jefe}`).set(como('admin')).expect(200)).body.datos as { id: string }[];
    expect(deOtra.map((t) => t.id)).not.toContain(creado.id);
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
  });

  it('acepta una hora de inicio de hoy que ya pasó: la actividad arranca desde ahora', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const elaboracion = actividades.find((a) => a.nombre === 'Elaboración')!;
    const integrantes = [{ celular: `9${sufijo}75`, nombres: 'Con', apellidos: 'HoraPasada', email: `con.pasada.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `3${sufijo}1`, esTitular: true }];
    const programacion = { actividadId: elaboracion.id, minutosEstimados: 90, hora: '06:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe };
    const base = { integrantes, trabajo: { ...(cuerpo.trabajo as object), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 30) }, contrato: undefined, pagos: [] };
    const creado = (await enviar('prod', { ...base, programacion }).expect(201)).body as TrabajoDetalle;
    expect(creado.entregables[0].tareas[0]).toMatchObject({ minutos: 90 });
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
  });

  it('con fecha y hora de inicio anteriores, la actividad se programa desde ese momento y se ve en la agenda', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const elaboracion = actividades.find((a) => a.nombre === 'Elaboración')!;
    // Último día de lunes a jueves anterior a hoy
    let pasado = sumarDias(hoy, -1);
    while (![1, 2, 3, 4].includes(new Date(`${pasado}T12:00:00Z`).getUTCDay())) pasado = sumarDias(pasado, -1);
    const integrantes = [{ celular: `9${sufijo}76`, nombres: 'Con', apellidos: 'Retroactivo', email: `con.retro.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `2${sufijo}1`, esTitular: true }];
    const programacion = { actividadId: elaboracion.id, minutosEstimados: 120, hora: '10:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe };
    const base = { integrantes, trabajo: { ...(cuerpo.trabajo as object), fechaInicio: pasado, fechaLimite: sumarDias(hoy, 30) }, contrato: undefined, pagos: [] };
    const creado = (await enviar('prod', { ...base, programacion }).expect(201)).body as TrabajoDetalle;
    const tarea = creado.entregables[0].tareas[0];
    const cola = (await http().get('/api/produccion/colas/mia').set(como('aux')).expect(200)).body as { items: { tareaId: string; plan: { inicio: string } | null }[] };
    const plan = cola.items.find((i) => i.tareaId === tarea.id)!.plan!;
    const [dia, hora] = new Date(Date.parse(plan.inicio) - 5 * 3_600_000).toISOString().split('T');
    expect(dia).toBe(pasado);
    expect(hora.slice(0, 5) >= '10:00').toBe(true);
    // Si el auxiliar ya tiene actividades, la siguiente empieza cuando termina la anterior (aunque pida la misma hora pasada)
    const otros = [{ celular: `9${sufijo}78`, nombres: 'Con', apellidos: 'Segundo', email: `con.segundo.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `1${sufijo}1`, esTitular: true }];
    const segundo = (await enviar('prod', { ...base, integrantes: otros, programacion: { ...programacion, minutosEstimados: 60 } }).expect(201)).body as TrabajoDetalle;
    const cola2 = (await http().get('/api/produccion/colas/mia').set(como('aux')).expect(200)).body as { items: { tareaId: string; plan: { inicio: string; fin: string } | null }[] };
    const primero = cola2.items.find((i) => i.tareaId === tarea.id)!.plan!;
    const siguiente = cola2.items.find((i) => i.tareaId === segundo.entregables[0].tareas[0].id)!.plan!;
    expect(Date.parse(siguiente.inicio)).toBeGreaterThanOrEqual(Date.parse(primero.fin) - 60_000);
    await prisma.trabajo.deleteMany({ where: { id: segundo.id } });
    // Aparece en la agenda de ese día
    const agenda = (await http().get(`/api/agenda/mia?desde=${pasado}&hasta=${pasado}`).set(como('aux')).expect(200)).body as { dias: { fecha: string; tareas: { tareaId?: string; id?: string }[] }[] };
    expect(JSON.stringify(agenda)).toContain(tarea.id);
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
  });

  it('programa la primera actividad desde la fecha y hora de inicio, con su tiempo estimado editable', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string; minutosEstimados: number }[];
    const elaboracion = actividades.find((a) => a.nombre === 'Elaboración')!;
    // Próximo lunes (día laborable) a las 10:30
    let inicio = sumarDias(hoy, 1);
    while (new Date(`${inicio}T12:00:00Z`).getUTCDay() !== 1) inicio = sumarDias(inicio, 1);
    const integrantes = [{ celular: `9${sufijo}74`, nombres: 'Con', apellidos: 'Programa', email: `con.prog.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `4${sufijo}1`, esTitular: true }];
    const programacion = { actividadId: elaboracion.id, minutosEstimados: 150, hora: '10:30', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe };
    const base = { integrantes, trabajo: { ...(cuerpo.trabajo as object), fechaInicio: inicio, fechaLimite: sumarDias(inicio, 30) }, contrato: undefined, pagos: [] };
    // Validaciones
    await enviar('prod', { ...base, programacion: { ...programacion, hora: '25:00' } }).expect(400);
    await enviar('prod', { ...base, programacion: { ...programacion, minutosEstimados: 5 } }).expect(400);
    await enviar('prod', { ...base, programacion: { ...programacion, jefeResponsableId: ids.aux } }).expect(400);
    const creado = (await enviar('prod', { ...base, programacion }).expect(201)).body as TrabajoDetalle;
    expect(creado.estado).toBe('asignado');
    expect(creado.entregables).toHaveLength(1);
    const tarea = creado.entregables[0].tareas[0];
    expect(tarea).toMatchObject({ minutos: 150, actividad: { nombre: 'Elaboración' } });
    // La tarea de la cola del auxiliar arranca el lunes a las 10:30 (o después), nunca antes
    const cola = (await http().get('/api/produccion/colas/mia').set(como('aux')).expect(200)).body as { items: { tareaId: string; noAntesDe: string; plan: { inicio: string } | null }[] };
    const item = cola.items.find((i) => i.tareaId === tarea.id)!;
    expect(item.noAntesDe).toBe(inicio);
    expect(item.plan).not.toBeNull();
    const [dia, hora] = new Date(Date.parse(item.plan!.inicio) - 5 * 3_600_000).toISOString().split('T');
    expect(dia >= inicio).toBe(true);
    if (dia === inicio) expect(hora.slice(0, 5) >= '10:30').toBe(true);
    const fila = await prisma.tarea.findUniqueOrThrow({ where: { id: tarea.id } });
    expect(fila.noAntesDeMinuto).toBe(10 * 60 + 30);
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
  });

  it('desde ahí sigue el flujo normal: armar equipo y el trabajo se ve con su cuenta', async () => {
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    const t = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('admin')).expect(200)).body as TrabajoDetalle;
    expect(t.estado).toBe('asignado');
  });
});
