/**
 * Pruebas e2e de contingencias: inserción urgente, reasignación por ausencia, horas extra y bonos (base produccion_test).
 */
import {
  diaEnLima,
  diaSemanaDe,
  sumarDias,
  type AgendaPersona,
  type ColaPersona,
  type HoraExtraItem,
  type ImpactoUrgente,
  type PlanReasignacion,
  type ProspectoDetalle,
  type ResumenExtras,
  type TrabajoDetalle,
} from '@grupoes/shared';
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
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'ana' | 'prod' | 'aux' | 'aux2' | 'jefe' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', aux2: 'AUXILIAR', jefe: 'JEFE_PROD', admin: 'ADMIN' };

describe('Contingencias de producción (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let tesis: TrabajoDetalle;
  let monografia: TrabajoDetalle;
  let urgenteId: string;
  let enfoqueId: string;
  let ausenciaId: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const colaDe = async (q: Quien) => (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200)).body as ColaPersona;

  /** Prospecto convertido en trabajo, con equipo y plan generado desde la plantilla. */
  async function trabajoConPlan(n: number, tipo: string, dias: number, auxiliar: Quien): Promise<TrabajoDetalle> {
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t: { nombre: string }) => t.nombre === tipo).id,
          prioridadId: catalogos.prioridades.find((x: { nombre: string }) => x.nombre === 'Media').id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(n), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    const t = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: `N${n}`, email: `c${n}.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `6${sufijo}${n}`, esTitular: true }],
          trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, dias) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body as TrabajoDetalle;
    await http().put(`/api/trabajos/${t.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids[auxiliar], auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    return (await http().post(`/api/trabajos/${t.id}/plan`).set(como('prod')).expect(201)).body;
  }

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.c.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Contingencias', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    tesis = await trabajoConPlan(1, 'Tesis', 120, 'aux');
    monografia = await trabajoConPlan(2, 'Monografía', 30, 'aux2');
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.horaExtraBono.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.parametro.deleteMany({ where: { clave: { startsWith: 'horas_extra.' } } });
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.ausencia.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  describe('inserción urgente', () => {
    it('la asistente administrativa la solicita; una sola pendiente por trabajo', async () => {
      await http().post(`/api/trabajos/${monografia.id}/urgente`).set(como('aux')).send({ motivo: 'Sustenta antes' }).expect(403);
      const s = (await http().post(`/api/trabajos/${monografia.id}/urgente`).set(como('ana')).send({ motivo: 'El cliente adelantó su sustentación' }).expect(201)).body;
      urgenteId = s.id;
      expect(s).toMatchObject({ estado: 'pendiente', tareasPendientes: 1 });
      await http().post(`/api/trabajos/${monografia.id}/urgente`).set(como('ana')).send({ motivo: 'Otra vez' }).expect(409);
      // El trabajo pasa a prioridad urgente.
      const t = (await http().get(`/api/trabajos/${monografia.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
      expect(t.prioridad.nombre).toBe('Urgente');
    });

    it('simula la cascada y, al ejecutar, pasa adelante y pausa lo que estaba en proceso', async () => {
      const enCurso = (await colaDe('aux')).items[0];
      await http().post(`/api/tareas/${enCurso.tareaId}/iniciar`).set(como('aux')).expect(201);

      await http().get(`/api/urgentes/${urgenteId}/impacto?usuarioId=${ids.aux}`).set(como('ana')).expect(403);
      const impacto = (await http().get(`/api/urgentes/${urgenteId}/impacto?usuarioId=${ids.aux}`).set(como('prod')).expect(200)).body as ImpactoUrgente;
      expect(impacto.items[0].esUrgente).toBe(true);
      expect(impacto.pausada?.tareaId).toBe(enCurso.tareaId);
      // Las tareas del auxiliar se corren: terminan después que antes.
      const suya = impacto.items.find((i) => i.tareaId === enCurso.tareaId)!;
      expect(suya.despues.fin! > suya.antes!.fin!).toBe(true);

      await http().post(`/api/urgentes/${urgenteId}/ejecutar`).set(como('prod')).send({ usuarioId: ids.aux }).expect(201);
      const cola = await colaDe('aux');
      expect(cola.items[0].trabajo.id).toBe(monografia.id);
      expect(cola.items.find((i) => i.tareaId === enCurso.tareaId)!.estado).toBe('pendiente');
      expect((await colaDe('aux2')).items.filter((i) => i.trabajo.id === monografia.id)).toHaveLength(0);
      // Quien recibe el trabajo urgente entra a su equipo.
      const t = (await http().get(`/api/trabajos/${monografia.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
      expect(t.equipo.some((m) => m.usuario.id === ids.aux && m.funcion === 'auxiliar_apoyo')).toBe(true);
      await http().post(`/api/urgentes/${urgenteId}/ejecutar`).set(como('prod')).send({ usuarioId: ids.aux }).expect(400);
    });
  });

  describe('reasignación por ausencia', () => {
    it('propone pasar las reuniones y lo que ya no llega', async () => {
      // Un enfoque del auxiliar dentro de la futura ausencia.
      const dia = await proximoDiaHabil(prisma, sumarDias(hoy, 1));
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
            contactos: [{ celular: celular(3), esPrincipal: true }],
            primeraActividad: { actividadId: actividades.find((a: { nombre: string }) => a.nombre === 'Enfoque').id, fecha: dia, hora: '09:00', modalidad: 'virtual' },
          })
          .expect(201)
      ).body as ProspectoDetalle;
      enfoqueId = p.tareas[0].id;
      const cand = (await http().get(`/api/tareas/${enfoqueId}/candidatos`).set(como('prod')).expect(200)).body;
      const quienDa = cand.participaciones.find((x: { obligatoria: boolean }) => x.obligatoria);
      await http().post(`/api/tareas/${enfoqueId}/asignar`).set(como('prod')).send({ responsables: [{ participacionId: quienDa.id, usuarioId: ids.aux }] }).expect(201);

      // Descanso médico de 3 semanas: el plan de tesis (vence en ~18 días) ya no llega.
      ausenciaId = (
        await http()
          .post('/api/ausencias')
          .set(como('prod'))
          .send({ usuarioId: ids.aux, tipo: 'descanso_medico', fechaDesde: dia, fechaHasta: sumarDias(dia, 21), motivo: 'Operación' })
          .expect(201)
      ).body.id;

      await http().get(`/api/ausencias/${ausenciaId}/reasignacion`).set(como('aux')).expect(403);
      const plan = (await http().get(`/api/ausencias/${ausenciaId}/reasignacion`).set(como('prod')).expect(200)).body as PlanReasignacion;
      const reunion = plan.propuestas.find((x) => x.tarea.id === enfoqueId)!;
      expect(reunion).toMatchObject({ sugerencia: 'reasignar' });
      expect(reunion.candidatos.find((c) => c.usuario.id === ids.aux2)?.disponible).toBe(true);

      const planTesis = tesis.entregables[0].tareas[0].id;
      const propuesta = plan.propuestas.find((x) => x.tarea.id === planTesis)!;
      expect(propuesta.actual?.semaforo).toBe('rojo');
      expect(propuesta.sugerencia).toBe('reasignar');
      // Primero los auxiliares; el jefe (secundario) va al final.
      expect(propuesta.candidatos.at(-1)!.motivo).toBe('jefe');
      expect(propuesta.sugerido).toBe(ids.aux2);
    });

    it('al aplicar, las tareas pasan a la cola o agenda de quien las recibe', async () => {
      const planTesis = tesis.entregables[0].tareas[0].id;
      await http()
        .post(`/api/ausencias/${ausenciaId}/reasignacion`)
        .set(como('prod'))
        .send({ cambios: [{ tareaId: planTesis, usuarioId: ids.aux2 }, { tareaId: enfoqueId, usuarioId: ids.aux2 }] })
        .expect(201);
      expect((await colaDe('aux2')).items.map((i) => i.tareaId)).toContain(planTesis);
      expect((await colaDe('aux')).items.map((i) => i.tareaId)).not.toContain(planTesis);
      const t = (await http().get(`/api/trabajos/${tesis.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;
      expect(t.equipo.some((m) => m.usuario.id === ids.aux2 && m.funcion === 'auxiliar_apoyo')).toBe(true);
      // Repetir el mismo cambio ya no aplica.
      await http().post(`/api/ausencias/${ausenciaId}/reasignacion`).set(como('prod')).send({ cambios: [{ tareaId: planTesis, usuarioId: ids.aux2 }] }).expect(409);
    });
  });

  describe('horas extra y bonos', () => {
    // El próximo domingo: fuera del horario estándar.
    const domingo = sumarDias(hoy, 7 - diaSemanaDe(hoy) || 7);
    let extraId: string;

    it('flujo: propuesta → la persona acepta → el jefe aprueba → abre capacidad', async () => {
      const datos = { usuarioId: ids.aux2, modalidad: 'horas_extra', trabajoId: tesis.id, descripcion: 'Adelantar el plan de tesis', fecha: domingo, horaInicio: '09:00', horaFin: '13:00' };
      await http().post('/api/horas-extra').set(como('ana')).send(datos).expect(403);
      const x = (await http().post('/api/horas-extra').set(como('prod')).send(datos).expect(201)).body as HoraExtraItem;
      extraId = x.id;
      expect(x).toMatchObject({ estado: 'propuesta', minutos: 240 });

      await http().post(`/api/horas-extra/${extraId}/aprobar`).set(como('jefe')).expect(400);
      await http().post(`/api/horas-extra/${extraId}/responder`).set(como('aux')).send({ acepta: true }).expect(403);
      await http().post(`/api/horas-extra/${extraId}/responder`).set(como('aux2')).send({ acepta: true }).expect(201);
      await http().post(`/api/horas-extra/${extraId}/aprobar`).set(como('prod')).expect(403);
      expect((await http().post(`/api/horas-extra/${extraId}/aprobar`).set(como('jefe')).expect(201)).body.estado).toBe('aprobada');

      const agenda = (await http().get(`/api/agenda/mia?desde=${domingo}&hasta=${domingo}`).set(como('aux2')).expect(200)).body as AgendaPersona;
      expect(agenda.dias[0]).toMatchObject({ capacidad: 240, extras: [{ inicio: 540, fin: 780 }] });
    });

    it('nunca en una ausencia; el tope se advierte', async () => {
      const enAusencia = await proximoDiaHabil(prisma, sumarDias(hoy, 3));
      await http()
        .post('/api/horas-extra')
        .set(como('prod'))
        .send({ usuarioId: ids.aux, modalidad: 'horas_extra', trabajoId: tesis.id, descripcion: 'Avanzar', fecha: enAusencia, horaInicio: '19:00', horaFin: '21:00' })
        .expect(400);

      await http().put('/api/horas-extra/topes').set(como('jefe')).send({ semanal: 2, mensual: null }).expect(403);
      await http().put('/api/horas-extra/topes').set(como('admin')).send({ semanal: 2, mensual: '' }).expect(200);
      const nueva = (
        await http()
          .post('/api/horas-extra')
          .set(como('prod'))
          .send({ usuarioId: ids.aux2, modalidad: 'horas_extra', trabajoId: tesis.id, descripcion: 'Más avance', fecha: domingo, horaInicio: '14:00', horaFin: '15:00' })
          .expect(201)
      ).body as HoraExtraItem;
      expect(nueva.avisos.some((a) => a.startsWith('Supera el tope semanal'))).toBe(true);
      await http().post(`/api/horas-extra/${nueva.id}/anular`).set(como('prod')).expect(201);
      await http().put('/api/horas-extra/topes').set(como('admin')).send({ semanal: '', mensual: '' }).expect(200);
    });

    it('bono y reporte por persona', async () => {
      const bono = (
        await http()
          .post('/api/horas-extra')
          .set(como('prod'))
          .send({ usuarioId: ids.aux2, modalidad: 'bono', trabajoId: tesis.id, descripcion: 'Plan de tesis a tiempo', monto: 150 })
          .expect(201)
      ).body as HoraExtraItem;
      await http().post(`/api/horas-extra/${bono.id}/responder`).set(como('aux2')).send({ acepta: true }).expect(201);
      await http().post(`/api/horas-extra/${bono.id}/aprobar`).set(como('jefe')).expect(201);
      await http().post(`/api/horas-extra/${extraId}/realizar`).set(como('jefe')).send({ minutosReales: 200 }).expect(201);

      const resumen = (await http().get(`/api/horas-extra?desde=${hoy}&hasta=${sumarDias(hoy, 10)}`).set(como('jefe')).expect(200)).body as ResumenExtras;
      expect(resumen.personas.find((p) => p.usuario.id === ids.aux2)).toMatchObject({ minutosPlanificados: 240, minutosReales: 200, bonos: 150, cantidad: 2 });
      // El auxiliar solo ve lo suyo.
      const propias = (await http().get('/api/horas-extra?vista=todas').set(como('aux')).expect(200)).body as ResumenExtras;
      expect(propias.items.every((i) => i.usuario.id === ids.aux)).toBe(true);
    });
  });
});
