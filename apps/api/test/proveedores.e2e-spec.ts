/**
 * Pruebas e2e de los proveedores y de los trabajos que entregan (base produccion_test).
 */
import {
  diaEnLima,
  sumarDias,
  type CatalogoActividades,
  type CatalogosProspecto,
  type ColaPersona,
  type Paginado,
  type ProveedorItem,
  type TrabajoDetalle,
  type TrabajoListadoItem,
} from '@grupoes/shared';
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

describe('Proveedores y sus trabajos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let proveedor: ProveedorItem;
  let trabajo: TrabajoDetalle;
  let cuerpo: Record<string, unknown>;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.prv.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Proveedores', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const actividades = (await http().get('/api/catalogos/actividades').set(como('admin')).expect(200)).body as CatalogoActividades;
    const revision = actividades.actividades.find((a) => a.nombre === 'Revisión interna')!;
    const academicos = await datosAcademicos(prisma);
    cuerpo = {
      tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
      titulo: `Tesis de proveedor ${sufijo}`,
      prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
      nivelAcademicoId: academicos.nivelAcademicoId,
      universidadId: academicos.universidadId,
      carreraId: academicos.carreraId,
      linkDrive: academicos.linkDrive,
      fechaLimite: sumarDias(hoy, 20),
      actividadId: revision.id,
      minutosEstimados: 120,
    };
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { creadoPor: { in: usuarios } } });
    await prisma.proveedor.deleteMany({ where: { nombres: { startsWith: `E2E${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('registra proveedores con nombres y apellidos; no se repiten y se pueden buscar', async () => {
    await http().post('/api/proveedores').set(como('aux')).send({ nombres: `E2E${sufijo}`, apellidos: 'Quispe' }).expect(403);
    await http().post('/api/proveedores').set(como('prod')).send({ nombres: '', apellidos: 'Quispe' }).expect(400);
    proveedor = (await http().post('/api/proveedores').set(como('prod')).send({ nombres: `E2E${sufijo}`, apellidos: 'Quispe Ríos', celular: '987654321', email: 'Prov@Correo.com' }).expect(201)).body;
    expect(proveedor).toMatchObject({ apellidos: 'Quispe Ríos', email: 'prov@correo.com', activo: true, trabajos: 0 });
    // Sin distinguir mayúsculas ni tildes
    await http().post('/api/proveedores').set(como('prod')).send({ nombres: `e2e${sufijo}`, apellidos: 'QUISPE RIOS' }).expect(400);
    const lista = (await http().get(`/api/proveedores?q=quispe%20rios`).set(como('prod')).expect(200)).body as Paginado<ProveedorItem>;
    expect(lista.datos.map((p) => p.id)).toContain(proveedor.id);
    const editado = (await http().put(`/api/proveedores/${proveedor.id}`).set(como('prod')).send({ nombres: `E2E${sufijo}`, apellidos: 'Quispe Ríos', notas: 'Entrega los viernes' }).expect(200)).body as ProveedorItem;
    expect(editado.notas).toBe('Entrega los viernes');
  });

  it('el trabajo del proveedor exige todos sus datos', async () => {
    const enviar = (extra: Record<string, unknown>) => http().post('/api/trabajos/de-proveedor').set(como('prod')).send({ proveedorId: proveedor.id, ...cuerpo, ...extra });
    await http().post('/api/trabajos/de-proveedor').set(como('aux')).send({ proveedorId: proveedor.id, ...cuerpo }).expect(403);
    const vacio = await http().post('/api/trabajos/de-proveedor').set(como('prod')).send({ proveedorId: proveedor.id }).expect(400);
    expect(vacio.body.errores.map((e: { campo: string }) => e.campo)).toEqual(
      expect.arrayContaining(['titulo', 'universidadId', 'carreraId', 'nivelAcademicoId', 'prioridadId', 'fechaLimite', 'linkDrive', 'actividadId', 'minutosEstimados']),
    );
    await enviar({ linkDrive: 'drive' }).expect(400);
    await enviar({ fechaLimite: sumarDias(hoy, -1) }).expect(400);
    await enviar({ minutosEstimados: 5 }).expect(400);
    await http().post('/api/trabajos/de-proveedor').set(como('prod')).send({ ...cuerpo, proveedorId: '0199a000-0000-7000-8000-000000000009' }).expect(400);
  });

  it('registra el trabajo del proveedor sin prospecto ni contrato', async () => {
    trabajo = (await http().post('/api/trabajos/de-proveedor').set(como('prod')).send({ proveedorId: proveedor.id, ...cuerpo }).expect(201)).body;
    expect(trabajo.codigo).toMatch(/^PR-\d{4}-\d{4}$/);
    expect(trabajo.prospecto).toBeNull();
    expect(trabajo.proveedor).toMatchObject({ id: proveedor.id, apellidos: 'Quispe Ríos' });
    expect(trabajo.contrato).toBeNull();
    expect(trabajo.estado).toBe('sin_asignar');
    expect(trabajo.planProveedor).toEqual({ actividad: 'Revisión interna', minutos: 120 });
    expect(trabajo.hayPlantilla).toBe(true);
    expect(trabajo.entregables).toHaveLength(0);
    expect((await http().get(`/api/proveedores/${proveedor.id}`).set(como('prod')).expect(200)).body.trabajos).toBe(1);
  });

  it('se ve en la lista (por proveedor y por origen) y se encuentra por el nombre del proveedor', async () => {
    const lista = async (q: string) => ((await http().get(`/api/trabajos?${q}`).set(como('prod')).expect(200)).body as Paginado<TrabajoListadoItem>).datos;
    expect((await lista(`proveedorId=${proveedor.id}`)).map((t) => t.id)).toEqual([trabajo.id]);
    expect((await lista('origen=proveedor')).map((t) => t.id)).toContain(trabajo.id);
    expect((await lista('origen=cliente')).map((t) => t.id)).not.toContain(trabajo.id);
    const buscado = await lista('q=quispe%20rios');
    expect(buscado.map((t) => t.id)).toContain(trabajo.id);
    expect(buscado.find((t) => t.id === trabajo.id)!.proveedor).toMatchObject({ id: proveedor.id });
  });

  it('el equipo y el plan: una entrega final y una sola tarea con la actividad y el tiempo elegidos', async () => {
    await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(400); // sin equipo
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201)).body;
    expect(trabajo.entregables).toHaveLength(1);
    expect(trabajo.entregables[0]).toMatchObject({ nombre: 'Entrega final', esFinal: true, fechaLimite: cuerpo.fechaLimite });
    expect(trabajo.entregables[0].tareas).toHaveLength(1);
    expect(trabajo.entregables[0].tareas[0]).toMatchObject({ minutos: 120, actividad: { nombre: 'Revisión interna' } });
    // La revisión va a la cola del jefe responsable.
    const cola = (await http().get('/api/produccion/colas/mia').set(como('jefe')).expect(200)).body as ColaPersona;
    expect(cola.items.some((i) => i.trabajo.id === trabajo.id && i.minutos === 120)).toBe(true);
  });

  it('el cobro lo paga el proveedor: se registra después, con sus pagos y su recibo', async () => {
    const cobro = { montoTotal: 300, formaPago: 'cuotas', cuotas: [{ monto: 100, vencimiento: hoy }, { monto: 200, vencimiento: sumarDias(hoy, 15) }] };
    await http().post(`/api/trabajos/${trabajo.id}/cobro`).set(como('prod')).send(cobro).expect(403); // ASIST_PROD no registra cobros por defecto
    await http().post(`/api/trabajos/${trabajo.id}/cobro`).set(como('admin')).send({ ...cobro, montoTotal: 250 }).expect(400);
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/cobro`).set(como('admin')).send(cobro).expect(200)).body;
    expect(trabajo.contrato).toMatchObject({ montoContrato: 300, diasGarantia: 0 });
    expect(trabajo.contrato!.cuotas).toHaveLength(2);
    await http().post(`/api/trabajos/${trabajo.id}/cobro`).set(como('admin')).send(cobro).expect(409);

    trabajo = (await http().post(`/api/contratos/${trabajo.contrato!.id}/pagos`).set(como('admin')).send({ monto: 100, fecha: hoy, metodo: 'yape' }).expect(201)).body;
    expect(trabajo.contrato!.pagos).toHaveLength(1);
    const recibo = (await http().get(`/api/documentos/recibo/${trabajo.contrato!.pagos![0].id}`).set(como('admin')).expect(200)).body;
    expect(recibo.cliente.nombre).toBe(`E2E${sufijo} Quispe Ríos`);
    // El contrato impreso es solo de clientes
    await http().get(`/api/documentos/contrato/${trabajo.id}`).set(como('admin')).expect(400);
  });

  it('un trabajo de cliente no se cobra por esta vía; desactivar al proveedor impide registrarle más trabajos', async () => {
    const delCliente = (await prisma.trabajo.findFirst({ where: { proveedorId: null, eliminadoEn: null }, select: { id: true } }))?.id;
    if (delCliente) await http().post(`/api/trabajos/${delCliente}/cobro`).set(como('admin')).send({ montoTotal: 100, formaPago: 'contado', cuotas: [{ monto: 100, vencimiento: hoy }] }).expect(404);
    await http().post(`/api/proveedores/${proveedor.id}/desactivar`).set(como('prod')).expect(403);
    expect((await http().post(`/api/proveedores/${proveedor.id}/desactivar`).set(como('admin')).expect(200)).body.activo).toBe(false);
    await http().post('/api/trabajos/de-proveedor').set(como('prod')).send({ proveedorId: proveedor.id, ...cuerpo }).expect(400);
    await http().post(`/api/proveedores/${proveedor.id}/activar`).set(como('admin')).expect(200);
  });
});
