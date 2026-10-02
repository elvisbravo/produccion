/**
 * Pruebas e2e de tableros e indicadores y del costo por hora (base produccion_test).
 * Los datos de entregas, revisiones y tiempos se preparan directo en la base para controlar las fechas.
 */
import {
  diaEnLima,
  instanteDesdeLima,
  sumarDias,
  type CostoHoraItem,
  type ProspectoDetalle,
  type ReporteCobranza,
  type ReporteOcupacion,
  type ReportePuntualidad,
  type ReporteRentabilidad,
  type ReporteRetrabajo,
  type Tablero,
  type TrabajoDetalle,
} from '@grupoes/shared';
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
const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const periodo = `desde=${sumarDias(hoy, -60)}&hasta=${hoy}`;

type Quien = 'ana' | 'prod' | 'aux' | 'jefe' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD', admin: 'ADMIN' };

describe('Tableros e indicadores (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const reporte = async <T>(q: Quien, ruta: string) => (await http().get(`/api/reportes/${ruta}?${periodo}`).set(como(q)).expect(200)).body as T;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.r.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Reportes', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }

    // Trabajo con contrato de S/ 1 500 en dos cuotas: una vencida hace 40 días y otra por vencer.
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t: { nombre: string }) => t.nombre === 'Monografía').id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(1), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
    trabajo = (
      await http()
        .post(`/api/prospectos/${p.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Reportes', email: `r.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `3${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: sumarDias(hoy, -50), fechaLimite: sumarDias(hoy, 30) },
          contrato: {
            fechaFirma: hoy,
            montoTotal: 1500,
            formaPago: 'cuotas',
            cuotas: [
              { monto: 1000, vencimiento: sumarDias(hoy, -40) },
              { monto: 500, vencimiento: sumarDias(hoy, 10) },
            ],
          },
          pagoInicial: { monto: 200, fecha: hoy, metodo: 'yape' },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);

    // Entregables: E1 vencido sin entregar; E2 entregado antes de su fecha; E3 entregado tarde.
    const crear = (nombre: string, orden: number, limite: string) => prisma.entregable.create({ data: { trabajoId: trabajo.id, nombre, orden, fechaLimite: fecha(limite) } });
    await crear('E1', 1, sumarDias(hoy, -5));
    const e2 = await crear('E2', 2, sumarDias(hoy, -3));
    const e3 = await crear('E3', 3, sumarDias(hoy, -2));
    await prisma.entregaCliente.create({ data: { entregableId: e2.id, enviadoPorId: ids.ana, fecha: instanteDesdeLima(sumarDias(hoy, -4), '10:00') } });
    await prisma.entregaCliente.create({
      data: { entregableId: e3.id, enviadoPorId: ids.ana, fecha: instanteDesdeLima(sumarDias(hoy, -1), '10:00'), respuesta: 'observado', respondidoEn: new Date() },
    });
    // Retrabajo: E2 observado dos veces en la revisión interna y luego aprobado; E3 observado por el cliente.
    for (const resultado of ['observado', 'observado', 'aprobado'] as const) await prisma.revision.create({ data: { entregableId: e2.id, revisorId: ids.jefe, resultado } });

    // Tiempo y costos: 2 h trabajadas por el auxiliar a S/ 20 la hora, y un bono de S/ 100.
    const actividad = await prisma.actividad.findUniqueOrThrow({ where: { nombre: 'Elaboración' } });
    const tarea = await prisma.tarea.create({
      data: { actividadId: actividad.id, trabajoId: trabajo.id, entregableId: e2.id, fecha: fecha(hoy), minutosEstimados: 180, estado: 'completada', completadaEn: new Date(), creadaPorId: ids.prod },
    });
    const inicio = instanteDesdeLima(sumarDias(hoy, -1), '09:00');
    await prisma.registroTiempo.create({ data: { tareaId: tarea.id, usuarioId: ids.aux, inicio, fin: new Date(inicio.getTime() + 120 * 60_000), minutos: 120 } });
    await prisma.horaExtraBono.create({
      data: { usuarioId: ids.aux, modalidad: 'bono', trabajoId: trabajo.id, descripcion: 'Buen trabajo', monto: 100, estado: 'aprobada', propuestaPorId: ids.prod, aprobadaPorId: ids.jefe, aprobadaEn: new Date() },
    });
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.horaExtraBono.deleteMany({ where: { usuarioId: { in: usuarios } } });
    await prisma.parametro.deleteMany({ where: { clave: 'horas_extra.recargo' } });
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('puntualidad: a tiempo si la primera entrega fue hasta la fecha límite', async () => {
    await http().get(`/api/reportes/puntualidad?${periodo}`).set(como('ana')).expect(403);
    const r = await reporte<ReportePuntualidad>('prod', 'puntualidad');
    expect(r.porAuxiliar.find((f) => f.clave === ids.aux)).toMatchObject({ total: 3, aTiempo: 1 });
    const atrasados = r.atrasados.filter((a) => a.trabajo.id === trabajo.id).map((a) => [a.nombre, a.diasAtraso]);
    expect(atrasados).toEqual(expect.arrayContaining([['E1', 5], ['E3', 1]]));
  });

  it('retrabajo: observaciones internas y del cliente por entregable', async () => {
    const r = await reporte<ReporteRetrabajo>('prod', 'retrabajo');
    expect(r.porAuxiliar.find((f) => f.clave === ids.aux)).toMatchObject({ entregables: 2, observacionesInternas: 2, observacionesCliente: 1, promedio: 1.5 });
  });

  it('ocupación: capacidad frente a lo trabajado, con bonos', async () => {
    const r = await reporte<ReporteOcupacion>('prod', 'ocupacion');
    const aux = r.personas.find((x) => x.usuario.id === ids.aux)!;
    expect(aux).toMatchObject({ trabajado: 120, bonos: 100 });
    expect(aux.capacidad).toBeGreaterThan(0);
    await http().get(`/api/reportes/ocupacion?desde=${sumarDias(hoy, -300)}&hasta=${hoy}`).set(como('prod')).expect(400);
  });

  it('cobranza: por cobrar, vencido por antigüedad y lo cobrado', async () => {
    const r = await reporte<ReporteCobranza>('prod', 'cobranza');
    expect(r.vencidoPorResponsable.find((v) => v.usuario.id === ids.ana)).toMatchObject({ monto: 800, cuotas: 1 });
    expect(r.antiguedad.find((a) => a.tramo === '31 a 60 días')!.monto).toBeGreaterThanOrEqual(800);
    expect(r.cobradoEnPeriodo).toBeGreaterThanOrEqual(200);
  });

  it('costo por hora: confidencial, con vigencia', async () => {
    await http().get(`/api/usuarios/${ids.aux}/costos-hora`).set(como('prod')).expect(403);
    const costos = (
      await http().post(`/api/usuarios/${ids.aux}/costos-hora`).set(como('admin')).send({ costo: 20, vigenteDesde: sumarDias(hoy, -60) }).expect(201)
    ).body as CostoHoraItem[];
    expect(costos[0]).toMatchObject({ costo: 20, vigenteDesde: sumarDias(hoy, -60) });
    // Un aumento desde mañana no cambia lo ya trabajado.
    await http().post(`/api/usuarios/${ids.aux}/costos-hora`).set(como('admin')).send({ costo: 30, vigenteDesde: sumarDias(hoy, 1) }).expect(201);
    // La auditoría registra el cambio sin el monto.
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { accion: 'costo_hora', entidadId: ids.aux }, orderBy: { fecha: 'desc' } });
    // El monto no queda en la auditoría (se comprueba por el nombre del campo: un número suelto puede aparecer en un id).
    expect(Object.keys(auditoria.despues as object).sort()).toEqual(['registro', 'vigenteDesde']);
  });

  it('rentabilidad: ingresos − horas × costo − horas extra − bonos (solo con permiso)', async () => {
    await http().get(`/api/reportes/rentabilidad?${periodo}`).set(como('prod')).expect(403);
    const r = await reporte<ReporteRentabilidad>('admin', 'rentabilidad');
    const t = r.trabajos.find((x) => x.id === trabajo.id)!;
    expect(t).toMatchObject({ ingresos: 1500, costoPersonal: 40, bonos: 100, margen: 1360, horas: 2, horasSinCosto: 0 });
    expect(t.margenPorcentaje).toBeCloseTo(0.907, 3);
    expect(r.porTipo.find((x) => x.nombre === 'Monografía')!.trabajos).toBeGreaterThanOrEqual(1);
  });

  it('las horas extra cuestan el costo por hora más el recargo de Parámetros', async () => {
    // Una hora extra aprobada del auxiliar (S/ 20 la hora) en este trabajo.
    await prisma.horaExtraBono.create({
      data: {
        usuarioId: ids.aux,
        modalidad: 'horas_extra',
        trabajoId: trabajo.id,
        fecha: fecha(sumarDias(hoy, -1)),
        minutoInicio: 1080,
        minutoFin: 1140,
        descripcion: 'Entrega urgente',
        estado: 'aprobada',
        propuestaPorId: ids.prod,
        aprobadaPorId: ids.jefe,
        aprobadaEn: new Date(),
      },
    });
    const parametro = (valor: number) => http().put('/api/parametros').set(como('admin')).send({ valores: { 'horas_extra.recargo': valor } });
    const delTrabajo = async () => (await reporte<ReporteRentabilidad>('admin', 'rentabilidad')).trabajos.find((x) => x.id === trabajo.id)!;

    // Por defecto el recargo es 25 %: 1 h × S/ 20 × 1,25.
    expect(await delTrabajo()).toMatchObject({ costoExtras: 25, margen: 1335 });
    await parametro(0).expect(200);
    expect(await delTrabajo()).toMatchObject({ costoExtras: 20, margen: 1340 });
    await parametro(35).expect(200);
    expect(await delTrabajo()).toMatchObject({ costoExtras: 27, margen: 1333 });
    // Los bonos no llevan recargo y el valor debe estar dentro del rango.
    expect((await delTrabajo()).bonos).toBe(100);
    await parametro(-5).expect(400);
    await parametro(500).expect(400);
  });

  it('el tablero resume todo; el margen solo con permiso de costos', async () => {
    const conCostos = await reporte<Tablero>('admin', 'tablero');
    expect(conCostos.margen).not.toBeNull();
    expect(conCostos.entregables).toBeGreaterThanOrEqual(3);
    const sinCostos = await reporte<Tablero>('prod', 'tablero');
    expect(sinCostos.margen).toBeNull();
    expect(sinCostos.vencido).toBeGreaterThanOrEqual(800);
  });
});
