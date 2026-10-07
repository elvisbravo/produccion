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
import { proximoDiaHabil } from './dias.js';

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
    // Y no aparece en la lista de prospectos (ni siquiera pidiendo la etapa «Convertido»)
    const enLista = async (consulta: string) => ((await http().get(`/api/prospectos?${consulta}`).set(como('admin')).expect(200)).body.datos as { id: string }[]).map((p) => p.id);
    expect(await enLista('porPagina=100')).not.toContain(origen.id);
    expect(await enLista(`porPagina=100&etapaId=${origen.etapaId}`)).not.toContain(origen.id);
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

  it('el tablero de entregas muestra la actividad, el equipo y las fechas; se filtra y guarda la nota', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const integrantes = [{ celular: `9${sufijo}81`, nombres: 'Con', apellidos: 'Tablero', email: `con.tablero.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `4${sufijo}2`, esTitular: true }];
    const limite = sumarDias(hoy, 10);
    const programacion = { actividadId: actividades.find((a) => a.nombre === 'Elaboración')!.id, minutosEstimados: 180, hora: '10:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe };
    const creado = (await enviar('prod', { integrantes, pagos: [], contrato: undefined, trabajo: { ...(cuerpo.trabajo as object), fechaInicio: hoy, fechaLimite: limite }, programacion }).expect(201)).body as TrabajoDetalle;
    const tablero = async (q: Quien, consulta = '') => (await http().get(`/api/entregas?desde=${limite}&hasta=${limite}${consulta}`).set(como(q)).expect(200)).body as { dias: { fecha: string; filas: { trabajo: { id: string; jefeResponsable: { id: string } | null }; actividad: { nombre: string; minutosEstimados: number } | null; auxiliares: { id: string }[]; asistente: { id: string } | null; entregaCliente: string; entregaInterna: string; semaforo: string | null; nota: string | null; inicio: string | null }[] }[] };
    const fila = async (q: Quien, consulta = '') => (await tablero(q, consulta)).dias.flatMap((d) => d.filas).find((f) => f.trabajo.id === creado.id);
    const f = (await fila('prod'))!;
    expect(f).toBeDefined();
    expect(f.actividad).toMatchObject({ nombre: 'Elaboración', minutosEstimados: 180 });
    expect(f.auxiliares.map((x) => x.id)).toEqual([ids.aux]);
    expect(f.trabajo.jefeResponsable?.id).toBe(ids.jefe);
    expect(f.asistente?.id).toBe(ids.ana);
    expect(f.entregaCliente).toBe(limite);
    expect(f.entregaInterna).toBe(limite);
    expect(f.semaforo).not.toBeNull();
    // Filtros
    expect(await fila('prod', `&auxiliarId=${ids.aux}`)).toBeDefined();
    expect(await fila('prod', `&auxiliarId=${ids.jefe}`)).toBeUndefined();
    expect(await fila('prod', `&jefeId=${ids.jefe}`)).toBeDefined();
    expect(await fila('prod', `&asistenteId=${ids.aux}`)).toBeUndefined();
    expect(await fila('prod', '&seguimiento=sin_asignar')).toBeUndefined();
    // Otro día no aparece; el auxiliar puede ver el tablero pero no editar la nota
    expect((await http().get(`/api/entregas?desde=${sumarDias(limite, 1)}&hasta=${sumarDias(limite, 1)}`).set(como('prod')).expect(200)).body.dias.flatMap((d: { filas: unknown[] }) => d.filas)).toHaveLength(0);
    // Cambiar desde cuándo se programa la actividad: solo quien programa; la hora debe ser de jornada
    const tareaId = creado.entregables[0].tareas[0].id;
    const nuevoDia = await proximoDiaHabil(prisma, sumarDias(hoy, 3));
    await http().put(`/api/produccion/tareas/${tareaId}/inicio`).set(como('aux')).send({ fecha: nuevoDia, hora: '14:00' }).expect(403);
    await http().put(`/api/produccion/tareas/${tareaId}/inicio`).set(como('prod')).send({ fecha: nuevoDia, hora: '23:30' }).expect(400);
    await http().put(`/api/produccion/tareas/${tareaId}/inicio`).set(como('prod')).send({ fecha: nuevoDia, hora: '14:00' }).expect(204);
    const fila2 = await prisma.tarea.findUniqueOrThrow({ where: { id: tareaId } });
    expect(fila2.fecha.toISOString().slice(0, 10)).toBe(nuevoDia);
    expect(fila2.noAntesDeMinuto).toBe(14 * 60);
    const f2 = (await fila('prod'))!;
    expect(f2.inicio).not.toBeNull();
    expect(Date.parse(f2.inicio!)).toBeGreaterThanOrEqual(Date.parse(`${nuevoDia}T14:00:00-05:00`) - 60_000);
    expect((await http().get(`/api/trabajos/${creado.id}`).set(como('prod')).expect(200)).body.eventos.some((e: { detalle: string }) => e.detalle.includes('ahora se programa desde'))).toBe(true);
    await http().put(`/api/trabajos/${creado.id}/nota-entrega`).set(como('aux')).send({ nota: 'x' }).expect(403);
    await http().put(`/api/trabajos/${creado.id}/nota-entrega`).set(como('admin')).send({ nota: 'Para el lunes' }).expect(204);
    expect((await fila('prod'))!.nota).toBe('Para el lunes');
    await http().put(`/api/trabajos/${creado.id}/nota-entrega`).set(como('admin')).send({ nota: '' }).expect(204);
    expect((await fila('prod'))!.nota).toBeNull();
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
    await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
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

  it('a un cliente (trabajo) se le programan reuniones, no otras actividades ni a un trabajo cerrado', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const id = (nombre: string) => actividades.find((a) => a.nombre === nombre)!.id;
    const integrantes = [{ celular: `9${sufijo}80`, nombres: 'Con', apellidos: 'Reunion', email: `con.reunion.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `6${sufijo}2`, esTitular: true }];
    const creado = (await enviar('prod', { integrantes, pagos: [] }).expect(201)).body as TrabajoDetalle;
    const dia = await proximoDiaHabil(prisma);
    const reunion = { actividadId: id('Enfoque'), fecha: dia, hora: '10:00', modalidad: 'virtual' };
    const programar = (q: Quien, extra: Record<string, unknown> = {}) => http().post(`/api/trabajos/${creado.id}/reuniones`).set(como(q)).send({ ...reunion, ...extra });
    // Solo reuniones que apliquen a clientes
    await programar('prod', { actividadId: id('Elaboración') }).expect(400);
    await programar('prod', { actividadId: id('Reunión comercial') }).expect(400);
    await programar('prod', { personaIds: ['0199a000-0000-7000-8000-000000000009'] }).expect(400);
    await programar('aux').expect(403); // el auxiliar no crea tareas
    const r = (await programar('prod').expect(201)).body as { id: string; estado: string; trabajo: { id: string } | null; prospecto: unknown };
    expect(r).toMatchObject({ estado: 'por_asignar', trabajo: { id: creado.id }, prospecto: null });
    // Queda en la línea de tiempo del trabajo, avisa al coordinador y aparece en la agenda como cliente
    const t = (await http().get(`/api/trabajos/${creado.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
    expect(t.eventos.some((e) => e.tipo === 'reunion' && e.detalle.includes('Enfoque'))).toBe(true);
    const fila = ((await http().get(`/api/reuniones?desde=${dia}&hasta=${dia}`).set(como('prod')).expect(200)).body as { tarea: { id: string }; condicion: string; cliente: { nombres: string } | null }[]).find((f) => f.tarea.id === r.id)!;
    expect(fila).toMatchObject({ condicion: 'cliente', cliente: { nombres: 'Con' } });
    // La reunión de un cliente se ve de una vez en el calendario del equipo, como «por asignar»
    const equipo = (await http().get(`/api/agenda/equipo?desde=${dia}&hasta=${dia}`).set(como('prod')).expect(200)).body as { porAsignar: { fecha: string; tarea: { id: string; inicio: number | null } }[] };
    expect(equipo.porAsignar.find((x) => x.tarea.id === r.id)).toMatchObject({ fecha: dia, tarea: { inicio: 10 * 60 } });
    // Un trabajo cerrado ya no recibe reuniones
    await prisma.trabajo.update({ where: { id: creado.id }, data: { estado: 'cancelado' } });
    await programar('prod').expect(400);
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
    await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
  });

  it('un cliente sin título del trabajo no hereda «Trabajo de proveedor» en su tarea', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const integrantes = [{ celular: `9${sufijo}82`, nombres: 'Sin', apellidos: 'Titulo', email: `sin.titulo.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `7${sufijo}3`, esTitular: true }];
    const programacion = { actividadId: actividades.find((a) => a.nombre === 'Elaboración')!.id, minutosEstimados: 60, hora: '10:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe };
    const base = { integrantes, pagos: [], contrato: undefined, trabajo: { ...(cuerpo.trabajo as object), titulo: undefined, fechaInicio: hoy, fechaLimite: sumarDias(hoy, 30) }, programacion };
    const creado = (await enviar('prod', base).expect(201)).body as TrabajoDetalle;
    const titulo = creado.entregables[0].tareas[0].titulo;
    expect(titulo).toBe('Elaboración');
    expect(titulo).not.toContain('proveedor');
    await prisma.trabajo.deleteMany({ where: { id: creado.id } });
    await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
  });

  it('si el auxiliar ya tiene actividades: sigue a continuación o fija la hora sin cruzarse', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const elaboracion = actividades.find((a) => a.nombre === 'Elaboración')!.id;
    const dia = await proximoDiaHabil(prisma, sumarDias(hoy, 2));
    const previa = async (hora: string, fijo: boolean, minutos = 180) =>
      (await http().get(`/api/trabajos/cliente-directo/vista-previa-inicio?auxiliarId=${ids.aux}&fecha=${dia}&hora=${hora}&minutos=${minutos}&fijo=${fijo}`).set(como('prod')).expect(200)).body as { tieneActividades: boolean; inicio: string | null; fin: string | null; despuesDe: string | null; cabe: boolean; cruces: unknown[]; mensaje: string | null };
    const registrar = (n: number, hora: string, modoInicio: 'secuencial' | 'fijo') => {
      const integrantes = [{ celular: `9${sufijo}9${n}`, nombres: 'Cola', apellidos: `Num${n}`, email: `cola.${n}.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `${n}${sufijo}7`, esTitular: true }];
      const programacion = { actividadId: elaboracion, minutosEstimados: 180, hora, auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe, modoInicio };
      return enviar('prod', { integrantes, pagos: [], contrato: undefined, trabajo: { ...(cuerpo.trabajo as object), titulo: `Cola ${n}`, fechaInicio: dia, fechaLimite: sumarDias(dia, 30) }, programacion });
    };
    const horaDe = (iso: string | null) => new Date(Date.parse(iso!) - 5 * 3_600_000).toISOString().slice(11, 16);
    const creados: string[] = [];
    try {
      // Sin actividades: respeta el día y la hora pedidos
      const libre = await previa('10:00', false);
      expect(libre.tieneActividades).toBe(false);
      expect(horaDe(libre.inicio)).toBe('10:00');
      expect((await previa('10:00', true)).cabe).toBe(true);
      const primero = (await registrar(1, '10:00', 'secuencial').expect(201)).body as TrabajoDetalle;
      creados.push(primero.id);

      // Con actividades: a continuación (no antes de lo que termina) o fijo
      const sec = await previa('10:00', false);
      expect(sec.tieneActividades).toBe(true);
      expect(Date.parse(sec.inicio!)).toBeGreaterThan(Date.parse(`${dia}T12:00:00-05:00`) - 3_600_000);
      expect(sec.despuesDe).not.toBeNull();
      // Fijo a una hora que se cruza con la actividad anterior: no cabe, y no se deja registrar
      const cruza = await previa('11:00', true);
      expect(cruza.cabe).toBe(false);
      expect(cruza.mensaje).toContain('Se cruza con');
      const rechazo = await registrar(2, '11:00', 'fijo').expect(400);
      expect(JSON.stringify(rechazo.body)).toContain('Se cruza con');
      // Fijo a una hora libre: empieza exactamente ahí
      const libreTarde = await previa('17:00', true, 60);
      expect(libreTarde.cabe).toBe(true);
      const fijo = (await registrar(3, '17:00', 'fijo').expect(201)).body as TrabajoDetalle;
      creados.push(fijo.id);
      const cola = (await http().get('/api/produccion/colas/mia').set(como('aux')).expect(200)).body as { items: { tareaId: string; orden: number; plan: { inicio: string } | null }[] };
      const suyo = cola.items.find((i) => i.tareaId === fijo.entregables[0].tareas[0].id)!;
      expect(horaDe(suyo.plan!.inicio)).toBe('17:00');
      // Y no se cruzan: ninguna actividad empieza antes de que termine la anterior
      const ordenadas = cola.items.filter((i) => i.plan).sort((x, y) => x.orden - y.orden);
      for (let i = 1; i < ordenadas.length; i++) expect(Date.parse(ordenadas[i].plan!.inicio)).toBeGreaterThanOrEqual(Date.parse(ordenadas[i - 1].plan!.inicio));
    } finally {
      await prisma.trabajo.deleteMany({ where: { id: { in: creados } } });
      await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
    }
  });

  it('si no llega a la entrega en horario normal, sugiere horas extra o bono y deja la propuesta al registrar', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const elaboracion = actividades.find((a) => a.nombre === 'Elaboración')!.id;
    const dia = await proximoDiaHabil(prisma, sumarDias(hoy, 3));
    const previa = async (minutos: number) =>
      (await http().get(`/api/trabajos/cliente-directo/vista-previa-inicio?auxiliarId=${ids.aux}&fecha=${dia}&hora=08:00&minutos=${minutos}&fijo=false&limite=${dia}`).set(como('prod')).expect(200)).body as {
        faltanMinutos: number;
        extra: { fecha: string; horaInicio: string; horaFin: string; minutos: number; avisos: string[] } | null;
      };
    // Cabe en el día: no falta nada
    expect((await previa(120)).faltanMinutos).toBe(0);
    // Un día completo no alcanza: falta y se sugiere una ventana el día de la entrega
    const apretado = await previa(14 * 60);
    expect(apretado.faltanMinutos).toBeGreaterThan(0);
    expect(apretado.extra).toMatchObject({ fecha: dia });
    expect(apretado.extra!.minutos).toBeGreaterThan(0);
    const registrar = (n: number, faltante: Record<string, unknown> | undefined) => {
      const integrantes = [{ celular: `9${sufijo}6${n}`, nombres: 'Falta', apellidos: `Num${n}`, email: `falta.${n}.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `${n}${sufijo}8`, esTitular: true }];
      const programacion = { actividadId: elaboracion, minutosEstimados: 14 * 60, hora: '08:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe, modoInicio: 'secuencial', ...(faltante && { faltante }) };
      return enviar('prod', { integrantes, pagos: [], contrato: undefined, trabajo: { ...(cuerpo.trabajo as object), titulo: `Falta ${n}`, fechaInicio: dia, fechaLimite: dia }, programacion });
    };
    const creados: string[] = [];
    try {
      // Una ventana en un día pasado o con la hora al revés se rechaza antes de registrar nada
      await registrar(1, { tipo: 'horas_extra', fecha: sumarDias(hoy, -1), horaInicio: '19:00', horaFin: '21:00', acumula: false }).expect(400);
      await registrar(1, { tipo: 'horas_extra', fecha: dia, horaInicio: '21:00', horaFin: '19:00', acumula: false }).expect(400);
      expect(await prisma.trabajo.count({ where: { titulo: 'Falta 1' } })).toBe(0);
      // Horas extra que se acumulan en la bolsa
      const x = apretado.extra!;
      const conExtra = (await registrar(2, { tipo: 'horas_extra', fecha: x.fecha, horaInicio: x.horaInicio, horaFin: x.horaFin, acumula: true }).expect(201)).body as TrabajoDetalle;
      creados.push(conExtra.id);
      const propuesta = await prisma.horaExtraBono.findFirstOrThrow({ where: { trabajoId: conExtra.id } });
      expect(propuesta).toMatchObject({ usuarioId: ids.aux, modalidad: 'horas_extra', estado: 'propuesta', reasignaTarea: false, acumula: true });
      expect(propuesta.tareaId).toBe(conExtra.entregables[0].tareas[0].id);
      // Bono a mano
      const conBono = (await registrar(3, { tipo: 'bono', monto: 35.5 }).expect(201)).body as TrabajoDetalle;
      creados.push(conBono.id);
      const bono = await prisma.horaExtraBono.findFirstOrThrow({ where: { trabajoId: conBono.id } });
      expect(bono).toMatchObject({ modalidad: 'bono', usuarioId: ids.aux, reasignaTarea: false });
      expect(Number(bono.monto)).toBe(35.5);
      // Sin elegir nada, no se crea ninguna propuesta
      const sin = (await registrar(4, undefined).expect(201)).body as TrabajoDetalle;
      creados.push(sin.id);
      expect(await prisma.horaExtraBono.count({ where: { trabajoId: sin.id } })).toBe(0);
    } finally {
      await prisma.horaExtraBono.deleteMany({ where: { trabajoId: { in: creados } } });
      await prisma.trabajo.deleteMany({ where: { id: { in: creados } } });
      await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
    }
  });

  it('las horas extra acumuladas van a la bolsa y se canjean por dinero o por días libres', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const dia = await proximoDiaHabil(prisma, sumarDias(hoy, 3));
    const integrantes = [{ celular: `9${sufijo}55`, nombres: 'Bolsa', apellidos: 'Horas', email: `bolsa.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `5${sufijo}9`, esTitular: true }];
    const programacion = { actividadId: actividades.find((a) => a.nombre === 'Elaboración')!.id, minutosEstimados: 14 * 60, hora: '08:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe, modoInicio: 'secuencial', faltante: { tipo: 'horas_extra', fecha: dia, horaInicio: '19:00', horaFin: '22:00', acumula: true } };
    const creado = (await enviar('prod', { integrantes, pagos: [], contrato: undefined, trabajo: { ...(cuerpo.trabajo as object), titulo: 'Bolsa', fechaInicio: dia, fechaLimite: dia }, programacion }).expect(201)).body as TrabajoDetalle;
    try {
      const propuesta = await prisma.horaExtraBono.findFirstOrThrow({ where: { trabajoId: creado.id } });
      // El auxiliar acepta, la asistente de producción aprueba y se realiza con 12 h reales
      await http().post(`/api/horas-extra/${propuesta.id}/responder`).set(como('aux')).send({ acepta: true }).expect(201);
      await http().post(`/api/horas-extra/${propuesta.id}/aprobar`).set(como('prod')).expect(201);
      await http().post(`/api/horas-extra/${propuesta.id}/realizar`).set(como('prod')).send({ minutosReales: 720 }).expect(201);
      const bolsa = async (q: Quien) => ((await http().get('/api/horas-extra/bolsa').set(como(q)).expect(200)).body as { personas: { usuario: { id: string }; acumuladoMinutos: number; canjeadoMinutos: number; saldoMinutos: number; movimientos: { id: string; tipo: string; minutos: number; anulado: boolean }[] }[] }).personas;
      expect((await bolsa('prod')).find((p) => p.usuario.id === ids.aux)).toMatchObject({ acumuladoMinutos: 720, saldoMinutos: 720 });
      // Cada quien ve solo lo suyo
      expect((await bolsa('aux')).map((p) => p.usuario.id)).toEqual([ids.aux]);
      // Solo quien aprueba canjea
      await http().post(`/api/horas-extra/bolsa/${ids.aux}/canjear`).set(como('aux')).send({ tipo: 'dinero', monto: 10 }).expect(403);
      // Dinero: monto a mano, descuenta lo canjeado
      await http().post(`/api/horas-extra/bolsa/${ids.aux}/canjear`).set(como('prod')).send({ tipo: 'dinero', minutos: 60, monto: 25.5, nota: 'Pagado en efectivo' }).expect(204);
      expect((await bolsa('prod')).find((p) => p.usuario.id === ids.aux)).toMatchObject({ canjeadoMinutos: 60, saldoMinutos: 660 });
      await http().post(`/api/horas-extra/bolsa/${ids.aux}/canjear`).set(como('prod')).send({ tipo: 'dinero', minutos: 9999, monto: 1 }).expect(400);
      // Días libres: se descuenta su jornada y se bloquean esos días en el calendario
      const libre = await proximoDiaHabil(prisma, sumarDias(hoy, 10));
      await http().post(`/api/horas-extra/bolsa/${ids.aux}/canjear`).set(como('prod')).send({ tipo: 'dias', fechaDesde: libre, fechaHasta: libre }).expect(204);
      const despues = (await bolsa('prod')).find((p) => p.usuario.id === ids.aux)!;
      expect(despues.canjeadoMinutos).toBeGreaterThan(60);
      const canjeDias = despues.movimientos.find((m) => m.tipo === 'canje_dias')!;
      const ausencia = await prisma.ausencia.findFirstOrThrow({ where: { usuarioId: ids.aux, tipo: 'compensacion' } });
      expect(ausencia.estado).toBe('aprobada');
      // Otro canje de esos mismos días se rechaza (ya tiene ausencia)
      await http().post(`/api/horas-extra/bolsa/${ids.aux}/canjear`).set(como('prod')).send({ tipo: 'dias', fechaDesde: libre, fechaHasta: libre }).expect(400);
      // Anular devuelve las horas y quita la ausencia
      await http().post(`/api/horas-extra/bolsa/canjes/${canjeDias.id}/anular`).set(como('prod')).expect(204);
      expect((await bolsa('prod')).find((p) => p.usuario.id === ids.aux)).toMatchObject({ canjeadoMinutos: 60, saldoMinutos: 660 });
      expect((await prisma.ausencia.findUniqueOrThrow({ where: { id: ausencia.id } })).estado).toBe('anulada');
    } finally {
      await prisma.canjeHoras.deleteMany({ where: { usuarioId: ids.aux } });
      await prisma.ausencia.deleteMany({ where: { usuarioId: ids.aux, tipo: 'compensacion' } });
      await prisma.horaExtraBono.deleteMany({ where: { trabajoId: creado.id } });
      await prisma.trabajo.deleteMany({ where: { id: creado.id } });
      await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
    }
  });

  it('una reunión que entra en el día de un auxiliar corre su cola; si algo deja de llegar hay que confirmarlo', async () => {
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body.actividades as { id: string; nombre: string }[];
    const dia = await proximoDiaHabil(prisma, sumarDias(hoy, 3));
    const integrantes = [{ celular: `9${sufijo}44`, nombres: 'Corre', apellidos: 'Cola', email: `corre.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `4${sufijo}6`, esTitular: true }];
    // Una tarea de 8 h que llena el día y vence ese mismo día
    const programacion = { actividadId: actividades.find((a) => a.nombre === 'Elaboración')!.id, minutosEstimados: 8 * 60, hora: '08:00', auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe, modoInicio: 'fijo' };
    const trabajoA = (await enviar('prod', { integrantes, pagos: [], contrato: undefined, trabajo: { ...(cuerpo.trabajo as object), titulo: 'Cola llena', fechaInicio: dia, fechaLimite: dia }, programacion }).expect(201)).body as TrabajoDetalle;
    const reunion = async (hora: string) =>
      ((await http().post(`/api/trabajos/${trabajoA.id}/reuniones`).set(como('prod')).send({ actividadId: actividades.find((a) => a.nombre === 'Enfoque')!.id, fecha: dia, hora, modalidad: 'virtual' }).expect(201)).body as { id: string }).id;
    try {
      const m1 = await reunion('10:00');
      const impacto = (await http().get(`/api/tareas/${m1}/impacto-cola?usuarioIds=${ids.aux}`).set(como('prod')).expect(200)).body as { usuario: { id: string }; tareas: { trabajoCodigo: string; pasaARojo: boolean }[]; pasanARojo: number }[];
      expect(impacto).toHaveLength(1);
      expect(impacto[0].tareas.map((t) => t.trabajoCodigo)).toContain(trabajoA.codigo);
      expect(impacto[0].pasanARojo).toBe(1);
      // Sin confirmar, no se asigna; confirmándolo, sí, y se avisa al jefe responsable
      const rechazo = await http().put(`/api/tareas/${m1}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux }).expect(409);
      expect(rechazo.body.codigo).toBe('impacto_cola');
      await http().put(`/api/tareas/${m1}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux, confirmarImpacto: true }).expect(200);
      expect(await prisma.notificacion.count({ where: { usuarioId: ids.jefe, tipo: 'cola.impacto' } })).toBeGreaterThan(0);
      // Una persona sin cola no se ve afectada
      const sinCola = (await http().get(`/api/tareas/${await reunion('15:00')}/impacto-cola?usuarioIds=${ids.jefe}`).set(como('prod')).expect(200)).body as { tareas: unknown[]; pasanARojo: number }[];
      expect(sinCola[0].tareas).toHaveLength(0);
      // Trabajo de fechas inamovibles: no se atrasa sin aceptarlo de forma expresa
      await prisma.trabajo.update({ where: { id: trabajoA.id }, data: { fechasFijas: true, fechasFijasMotivo: 'Prueba', fechasFijasEn: new Date(), fechasFijasPorId: ids.admin } });
      const m2 = await reunion('16:30');
      const fija = await http().put(`/api/tareas/${m2}/equipo-reunion`).set(como('prod')).send({ auxiliarId: ids.aux, confirmarImpacto: true }).expect(409);
      expect(fija.body.codigo).toBe('fechas_fijas');
    } finally {
      await prisma.notificacion.deleteMany({ where: { usuarioId: { in: [ids.jefe, ids.aux] }, tipo: { in: ['cola.impacto', 'tarea.asignada'] } } });
      await prisma.trabajo.deleteMany({ where: { id: trabajoA.id } });
      await prisma.prospecto.deleteMany({ where: { creadoPor: ids.prod, trabajo: null } });
    }
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
