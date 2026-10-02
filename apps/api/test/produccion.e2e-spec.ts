/**
 * Pruebas e2e de producción: plan desde plantilla, cola de trabajo, revisión y entrega (base produccion_test).
 */
import { diaEnLima, sumarDias, type AgendaPersona, type BandejaEntregable, type ColaPersona, type ProspectoDetalle, type TrabajoDetalle } from '@grupoes/shared';
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

type Quien = 'ana' | 'prod' | 'aux' | 'aux2' | 'jefe';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', aux2: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Producción: entregables, cola y revisión (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const detalle = async (q: Quien = 'prod') => (await http().get(`/api/trabajos/${trabajo.id}`).set(como(q)).expect(200)).body as TrabajoDetalle;
  const colaDe = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;
  const primero = () => trabajo.entregables[0];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.p.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Produccion', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }

    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const prospecto = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t: { nombre: string }) => t.nombre === 'Tesis').id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          titulo: 'Tesis de producción',
          contactos: [{ celular: celular(1), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    trabajo = (
      await http()
        .post(`/api/prospectos/${prospecto.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: prospecto.contactos[0].id, nombres: 'Rocío', apellidos: 'Paredes', email: `rocio.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `7${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: hoy, fechaLimite: sumarDias(hoy, 120) },
          contrato: { fechaFirma: hoy, montoTotal: 2000, formaPago: 'contado', cuotas: [{ monto: 2000, vencimiento: hoy }] },
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

  it('el plan se genera desde la plantilla solo con el equipo armado', async () => {
    expect(trabajo.hayPlantilla).toBe(true);
    await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(400);
    await http()
      .put(`/api/trabajos/${trabajo.id}/equipo`)
      .set(como('prod'))
      .send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe })
      .expect(200);
    // El auxiliar no genera el plan (permiso).
    await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('aux')).expect(403);
    trabajo = (await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(201)).body;

    expect(trabajo.entregables.map((e) => e.nombre)).toEqual(expect.arrayContaining(['Plan de tesis', 'Informe final']));
    expect(trabajo.entregables.at(-1)).toMatchObject({ esFinal: true, fechaLimite: trabajo.fechaLimite });
    // Las fechas límite van en orden y dentro del plazo.
    const fechas = trabajo.entregables.map((e) => e.fechaLimite);
    expect(fechas).toEqual([...fechas].sort());
    const tareas = trabajo.entregables.flatMap((e) => e.tareas);
    expect(tareas.every((t) => t.responsable?.id === ids.aux && t.plan && t.semaforo)).toBe(true);
    // Un segundo plan no se genera.
    await http().post(`/api/trabajos/${trabajo.id}/plan`).set(como('prod')).expect(409);
  });

  it('la cola acomoda las tareas una tras otra y se puede reordenar', async () => {
    const cola = await colaDe('aux');
    expect(cola.items.length).toBe(trabajo.entregables.flatMap((e) => e.tareas).length);
    const inicios = cola.items.map((i) => i.plan!.inicio);
    expect(inicios).toEqual([...inicios].sort());
    expect(cola.items[0].plan!.fin <= cola.items[1].plan!.inicio).toBe(true);

    const invertido = [...cola.items].reverse().map((i) => i.tareaId);
    await http().put(`/api/produccion/colas/${ids.aux}/orden`).set(como('aux')).send({ tareaIds: invertido }).expect(403);
    await http().put(`/api/produccion/colas/${ids.aux}/orden`).set(como('prod')).send({ tareaIds: invertido.slice(1) }).expect(409);
    await http().put(`/api/produccion/colas/${ids.aux}/orden`).set(como('prod')).send({ tareaIds: invertido }).expect(204);
    expect((await colaDe('aux')).items[0].tareaId).toBe(invertido[0]);

    await http().post(`/api/produccion/colas/${ids.aux}/orden-sugerido`).set(como('prod')).expect(204);
    const sugerida = await colaDe('aux');
    expect(sugerida.items.map((i) => i.fechaLimite)).toEqual(sugerida.items.map((i) => i.fechaLimite).sort());

    // Los tramos planificados aparecen en su agenda.
    const primeraFecha = sugerida.items[0].plan!.inicio;
    const dia = diaEnLima(new Date(primeraFecha));
    const agenda = (await http().get(`/api/agenda/mia?desde=${dia}&hasta=${dia}`).set(como('aux')).expect(200)).body as AgendaPersona;
    expect(agenda.dias[0].tareas.some((t) => t.enCola && t.id === sugerida.items[0].tareaId)).toBe(true);
  });

  it('elaboración → revisión observada → corrección → aprobación', async () => {
    const tareaId = primero().tareas[0].id;
    await http().post(`/api/tareas/${tareaId}/iniciar`).set(como('jefe')).expect(404);
    await http().post(`/api/tareas/${tareaId}/iniciar`).set(como('aux')).expect(201);
    trabajo = await detalle();
    expect(trabajo.estado).toBe('en_proceso');
    expect(primero().estado).toBe('en_proceso');

    // No se envía a revisión con tareas pendientes.
    await http().post(`/api/entregables/${primero().id}/enviar-revision`).set(como('aux')).expect(400);
    await http().post(`/api/tareas/${tareaId}/completar`).set(como('aux')).send({ resultado: 'Plan redactado' }).expect(201);
    trabajo = (await http().post(`/api/entregables/${primero().id}/enviar-revision`).set(como('aux')).expect(201)).body;
    expect(primero().estado).toBe('en_revision');

    // La revisión va primera en la cola del jefe y no se cierra como tarea suelta.
    const colaJefe = await colaDe('jefe');
    expect(colaJefe.items[0].titulo).toBe('Revisión: Plan de tesis');
    await http().post(`/api/tareas/${colaJefe.items[0].tareaId}/completar`).set(como('jefe')).send({}).expect(400);

    // El auxiliar no aprueba; el jefe observa.
    await http().post(`/api/entregables/${primero().id}/revisar`).set(como('aux')).send({ resultado: 'aprobado' }).expect(403);
    await http().post(`/api/entregables/${primero().id}/revisar`).set(como('jefe')).send({ resultado: 'observado' }).expect(400);
    trabajo = (
      await http()
        .post(`/api/entregables/${primero().id}/revisar`)
        .set(como('jefe'))
        .send({ resultado: 'observado', observaciones: 'Falta justificar el problema', minutosCorreccion: 90 })
        .expect(201)
    ).body;
    expect(primero().estado).toBe('observado');
    expect(primero().revisiones[0]).toMatchObject({ resultado: 'observado', observaciones: 'Falta justificar el problema' });

    // La corrección entra primera en la cola del auxiliar, con las observaciones.
    const cola = await colaDe('aux');
    expect(cola.items[0]).toMatchObject({ titulo: 'Corregir observaciones: Plan de tesis', minutos: 90 });
    await http().post(`/api/tareas/${cola.items[0].tareaId}/completar`).set(como('aux')).send({}).expect(201);
    await http().post(`/api/entregables/${primero().id}/enviar-revision`).set(como('aux')).expect(201);
    trabajo = (
      await http().post(`/api/entregables/${primero().id}/revisar`).set(como('jefe')).send({ resultado: 'aprobado', similitud: 12.5, ia: 3 }).expect(201)
    ).body;
    expect(primero()).toMatchObject({ estado: 'aprobado', similitud: 12.5, ia: 3 });
  });

  it('la bandeja muestra lo que espera a cada rol', async () => {
    const porEntregar = (await http().get('/api/entregables?vista=por_entregar').set(como('ana')).expect(200)).body as BandejaEntregable[];
    expect(porEntregar.map((e) => e.id)).toContain(primero().id);
    // El auxiliar ajeno al equipo no ve el entregable.
    const ajeno = (await http().get('/api/entregables?vista=por_entregar').set(como('aux2')).expect(200)).body as BandejaEntregable[];
    expect(ajeno.map((e) => e.id)).not.toContain(primero().id);
    await http().post(`/api/entregables/${primero().id}/enviar-revision`).set(como('aux2')).expect(404);
  });

  it('Turnitin: obligatorio antes de entregar, con límites que devuelven a corrección y omisión con motivo', async () => {
    const aprobadoEn = primero().id;
    // Sin pasar por Turnitin no se entrega.
    await http().post(`/api/entregables/${aprobadoEn}/entregar`).set(como('ana')).send({ canal: 'whatsapp' }).expect(400);
    // Quien no tiene el permiso no lo envía.
    await http().post(`/api/entregables/${aprobadoEn}/turnitin/enviar`).set(como('aux')).expect(403);
    trabajo = (await http().post(`/api/entregables/${aprobadoEn}/turnitin/enviar`).set(como('jefe')).expect(201)).body;
    expect(primero().estado).toBe('en_turnitin');
    expect(primero().turnitin[0]).toMatchObject({ resultado: null });
    expect(trabajo.turnitin).toEqual({ obligatorio: true, similitudMax: null, iaMax: null });
    expect([trabajo.seguimiento.principal, ...trabajo.seguimiento.etiquetas]).toContain('turnitin');
    const bandeja = (await http().get('/api/entregables?vista=por_entregar').set(como('ana')).expect(200)).body as BandejaEntregable[];
    expect(bandeja.find((e) => e.id === aprobadoEn)?.estado).toBe('en_turnitin');
    // Mientras está en Turnitin no se entrega.
    await http().post(`/api/entregables/${aprobadoEn}/entregar`).set(como('ana')).send({ canal: 'whatsapp' }).expect(400);
    const filtrados = (await http().get('/api/trabajos?seguimiento=turnitin').set(como('prod')).expect(200)).body.datos as { id: string }[];
    expect(filtrados.map((t) => t.id)).toContain(trabajo.id);

    // Con un límite de similitud, pasarse devuelve el entregable a corrección.
    await prisma.parametro.upsert({ where: { clave: 'turnitin.similitud_max' }, create: { clave: 'turnitin.similitud_max', valor: 10, descripcion: 'e2e' }, update: { valor: 10 } });
    try {
      await http().post(`/api/entregables/${aprobadoEn}/turnitin/resultado`).set(como('jefe')).send({}).expect(400);
      trabajo = (await http().post(`/api/entregables/${aprobadoEn}/turnitin/resultado`).set(como('jefe')).send({ similitud: 15, ia: 2 }).expect(201)).body;
      expect(trabajo.turnitin.similitudMax).toBe(10);
      expect(primero()).toMatchObject({ estado: 'observado', turnitinConformeEn: null });
      expect(primero().turnitin[0]).toMatchObject({ resultado: 'excede', similitud: 15, ia: 2 });
      const cola = await colaDe('aux');
      expect(cola.items[0].titulo).toBe('Corregir por Turnitin: Plan de tesis');
      await http().post(`/api/tareas/${cola.items[0].tareaId}/completar`).set(como('aux')).send({}).expect(201);
      await http().post(`/api/entregables/${aprobadoEn}/enviar-revision`).set(como('aux')).expect(201);
      await http().post(`/api/entregables/${aprobadoEn}/revisar`).set(como('jefe')).send({ resultado: 'aprobado' }).expect(201);
      await http().post(`/api/entregables/${aprobadoEn}/turnitin/enviar`).set(como('prod')).expect(201);
      trabajo = (await http().post(`/api/entregables/${aprobadoEn}/turnitin/resultado`).set(como('prod')).send({ similitud: 8 }).expect(201)).body;
    } finally {
      await prisma.parametro.deleteMany({ where: { clave: 'turnitin.similitud_max' } });
    }
    expect(primero().estado).toBe('aprobado');
    expect(primero().turnitinConformeEn).not.toBeNull();
    expect(primero().turnitin[0]).toMatchObject({ resultado: 'conforme', similitud: 8 });

    // Omitirlo exige un permiso mayor y un motivo; queda registrado.
    await http().post(`/api/entregables/${aprobadoEn}/turnitin/omitir`).set(como('jefe')).send({ motivo: 'Lo pidió el cliente' }).expect(403);
    await http().post(`/api/entregables/${aprobadoEn}/turnitin/omitir`).set(como('prod')).send({}).expect(400);
    trabajo = (await http().post(`/api/entregables/${aprobadoEn}/turnitin/omitir`).set(como('prod')).send({ motivo: 'El cliente no lo exige' }).expect(201)).body;
    expect(primero()).toMatchObject({ estado: 'aprobado' });
    expect(primero().turnitin[0]).toMatchObject({ resultado: 'omitido', observaciones: 'El cliente no lo exige' });
  });

  it('entrega al cliente y conformidad cierran el entregable', async () => {
    await http().post(`/api/entregables/${primero().id}/entregar`).set(como('aux')).send({ canal: 'whatsapp' }).expect(403);
    trabajo = (await http().post(`/api/entregables/${primero().id}/entregar`).set(como('ana')).send({ canal: 'whatsapp', notas: 'Enviado a Rocío' }).expect(201)).body;
    expect(primero().estado).toBe('entregado');
    trabajo = (await http().post(`/api/entregables/${primero().id}/respuesta-cliente`).set(como('ana')).send({ conforme: true }).expect(201)).body;
    expect(primero().estado).toBe('cerrado');
    expect(primero().entregas[0].respuesta).toBe('conforme');
  });

  it('si cambia el auxiliar principal, sus tareas pendientes pasan a quien entra', async () => {
    const pendientes = (await colaDe('aux')).items.filter((i) => i.trabajo.id === trabajo.id).length;
    expect(pendientes).toBeGreaterThan(0);
    await http()
      .put(`/api/trabajos/${trabajo.id}/equipo`)
      .set(como('prod'))
      .send({ auxiliarPrincipalId: ids.aux2, auxiliaresApoyo: [], jefeResponsableId: ids.jefe, motivo: 'Carga de trabajo' })
      .expect(200);
    expect((await colaDe('aux')).items.filter((i) => i.trabajo.id === trabajo.id)).toHaveLength(0);
    expect((await colaDe('aux2')).items.filter((i) => i.trabajo.id === trabajo.id)).toHaveLength(pendientes);
  });
});
