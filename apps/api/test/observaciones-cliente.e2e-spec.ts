/**
 * Pruebas e2e de las observaciones del cliente: se valoran, se confirman con el cliente y se programan (base produccion_test).
 */
import {
  diaEnLima,
  sumarDias,
  type CandidatoCorreccion,
  type CatalogosProspecto,
  type ColaPersona,
  type ObservacionDetalle,
  type ObservacionItem,
  type PlazoEvaluado,
  type ProspectoDetalle,
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

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`;
const PASSWORD = 'Prueba-e2e-123';
const hoy = diaEnLima();

type Quien = 'ana' | 'prod' | 'jefe' | 'aux1' | 'aux2';
const ROL: Record<Quien, string> = {
  ana: 'ASIST_ADM',
  prod: 'ASIST_PROD',
  jefe: 'JEFE_PROD',
  aux1: 'AUXILIAR',
  aux2: 'AUXILIAR',
};

describe('Observaciones del cliente: valoración, confirmación y programación (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;
  let entregableId = '';

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const colaDe = async (q: Quien) =>
    (await http().get('/api/produccion/colas/mia').set(como(q)).expect(200))
      .body as ColaPersona;
  const manana = sumarDias(hoy, 3);
  const abiertas = async (q: Quien) =>
    (
      await http()
        .get(`/api/observaciones?trabajoId=${trabajo.id}`)
        .set(como(q))
        .expect(200)
    ).body as ObservacionItem[];

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const viejos = (
      await prisma.usuario.findMany({
        where: { email: { startsWith: 'e2e.obs.' } },
        select: { id: true },
      })
    ).map((u) => u.id);
    if (viejos.length) {
      await prisma.trabajo.deleteMany({
        where: {
          OR: [
            { creadoPor: { in: viejos } },
            { prospecto: { responsableId: { in: viejos } } },
          ],
        },
      });
      await prisma.prospecto.deleteMany({
        where: { responsableId: { in: viejos } },
      });
      await prisma.usuario.deleteMany({ where: { id: { in: viejos } } });
    }
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.obs.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({
        where: { codigo: ROL[q] },
      });
      ids[q] = (
        await prisma.usuario.create({
          data: {
            nombres: `E2E ${q}`,
            apellidos: 'Obs',
            email,
            passwordHash: await hashPassword(PASSWORD),
            roles: { create: { rolId: rol.id } },
          },
        })
      ).id;
      tokens[q] = (
        await http()
          .post('/api/auth/login')
          .send({ email, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    const catalogos = (
      await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)
    ).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find(
            (t) => t.nombre === 'Tesis',
          )!.id,
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
          integrantes: [
            {
              personaId: p.contactos[0].id,
              nombres: 'Cliente',
              apellidos: 'Obs',
              email: `ob.${sufijo}@correo.com`,
              tipoDocumento: 'DNI',
              numeroDocumento: `7${sufijo}1`,
              esTitular: true,
            },
          ],
          trabajo: {
            ...(await datosAcademicos(prisma)),
            fechaInicio: hoy,
            fechaLimite: sumarDias(hoy, 120),
          },
          contrato: {
            fechaFirma: hoy,
            montoTotal: 1000,
            formaPago: 'contado',
            cuotas: [{ monto: 1000, vencimiento: hoy }],
          },
        })
        .expect(201)
    ).body;
    await http()
      .put(`/api/trabajos/${trabajo.id}/equipo`)
      .set(como('prod'))
      .send({
        auxiliarPrincipalId: ids.aux1,
        auxiliaresApoyo: [],
        jefeResponsableId: ids.jefe,
      })
      .expect(200);
    await http()
      .post(`/api/trabajos/${trabajo.id}/plan`)
      .set(como('prod'))
      .expect(201);
    // El primer entregable ya está en manos del cliente
    entregableId = (
      await prisma.entregable.findFirstOrThrow({
        where: { trabajoId: trabajo.id },
        orderBy: { orden: 'asc' },
      })
    ).id;
    await prisma.entregable.update({
      where: { id: entregableId },
      data: { estado: 'entregado' },
    });
    await prisma.entregaCliente.create({
      data: { entregableId, enviadoPorId: ids.ana, canal: 'whatsapp' },
    });
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.notificacion.deleteMany({
      where: { usuarioId: { in: usuarios } },
    });
    await prisma.trabajo.deleteMany({
      where: { prospecto: { responsableId: { in: usuarios } } },
    });
    await prisma.prospecto.deleteMany({
      where: { responsableId: { in: usuarios } },
    });
    await prisma.persona.deleteMany({
      where: { celular: { startsWith: `+519${sufijo}` } },
    });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('la respuesta con observaciones ya no programa nada: queda por valorar y avisa a quienes pueden valorar', async () => {
    const antes = (await colaDe('aux1')).items.length;
    await http()
      .post(`/api/entregables/${entregableId}/respuesta-cliente`)
      .set(como('ana'))
      .send({
        conforme: false,
        observaciones: 'Falta la estructura y la documentación',
      })
      .expect(201);
    expect((await colaDe('aux1')).items).toHaveLength(antes);
    const lista = await abiertas('ana');
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({
      estado: 'por_valorar',
      ronda: 1,
      observaciones: 'Falta la estructura y la documentación',
    });
    expect(lista[0].auxiliarOriginal?.id).toBe(ids.aux1);
    expect(
      await prisma.notificacion.count({
        where: { usuarioId: ids.aux2, tipo: 'observacion.por_valorar' },
      }),
    ).toBe(1);
    // La asistente administrativa no valora
    await http()
      .post(`/api/observaciones/${lista[0].id}/tomar`)
      .set(como('ana'))
      .expect(403);
  });

  it('cualquiera que no sea asistente administrativa la toma y los demás ya no pueden valorarla', async () => {
    const [o] = await abiertas('aux2');
    await http()
      .post(`/api/observaciones/${o.id}/tomar`)
      .set(como('aux2'))
      .expect(200);
    await http()
      .post(`/api/observaciones/${o.id}/tomar`)
      .set(como('jefe'))
      .expect(409);
    await http()
      .post(`/api/observaciones/${o.id}/valorar`)
      .set(como('jefe'))
      .send({
        minutos: 120,
        fecha: manana,
        hora: '12:00',
        items: ['Falta la estructura'],
      })
      .expect(409);
    // Soltarla la libera
    await http()
      .post(`/api/observaciones/${o.id}/soltar`)
      .set(como('aux2'))
      .expect(200);
    await http()
      .post(`/api/observaciones/${o.id}/tomar`)
      .set(como('jefe'))
      .expect(200);
  });

  it('valora con tiempo, lista y entrega, y llega a la asistente administrativa y a la de producción', async () => {
    const [o] = await abiertas('prod');
    await http()
      .post(`/api/observaciones/${o.id}/valorar`)
      .set(como('jefe'))
      .send({ minutos: 120, fecha: manana, hora: '12:00', items: [] })
      .expect(400);
    await http()
      .post(`/api/observaciones/${o.id}/valorar`)
      .set(como('jefe'))
      .send({
        minutos: 120,
        fecha: sumarDias(hoy, -1),
        hora: '12:00',
        items: ['x y'],
      })
      .expect(400);
    const v = (
      await http()
        .post(`/api/observaciones/${o.id}/valorar`)
        .set(como('jefe'))
        .send({
          minutos: 120,
          fecha: manana,
          hora: '12:00',
          items: [
            'Falta la estructura',
            'Falta la documentación del instrumento',
          ],
          nota: 'Se entrega con la estructura completa',
        })
        .expect(200)
    ).body as ObservacionDetalle;
    expect(v).toMatchObject({ estado: 'valorada', minutosEstimados: 120 });
    expect(v.items.map((i) => i.texto)).toEqual([
      'Falta la estructura',
      'Falta la documentación del instrumento',
    ]);
    expect(v.plazo?.cabe).toBe(true);
    // Les llega a las dos asistentes (la de producción y quien lleva al cliente)
    expect(
      await prisma.notificacion.count({
        where: { usuarioId: ids.prod, tipo: 'observacion.valorada' },
      }),
    ).toBe(1);
    expect(
      await prisma.notificacion.count({
        where: { usuarioId: ids.ana, tipo: 'observacion.valorada' },
      }),
    ).toBe(1);
    // Ya valorada no se vuelve a valorar
    await http()
      .post(`/api/observaciones/${o.id}/valorar`)
      .set(como('jefe'))
      .send({ minutos: 60, fecha: manana, hora: '12:00', items: ['otra cosa'] })
      .expect(409);
  });

  it('el mismo día, si no cabe antes de la hora pedida, avisa y sugiere una hora o horas extra', async () => {
    const [o] = await abiertas('prod');
    const ahora = new Date(Date.now() + 5 * 60_000);
    const dia = diaEnLima(ahora);
    const hora = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(ahora);
    const p = (
      await http()
        .get(
          `/api/observaciones/${o.id}/plazo?minutos=600&fecha=${dia}&hora=${hora}`,
        )
        .set(como('prod'))
        .expect(200)
    ).body as PlazoEvaluado;
    expect(p.cabe).toBe(false);
    expect(p.faltanMinutos).toBeGreaterThan(0);
    expect(p.mensaje).toContain('no alcanza');
    const holgado = (
      await http()
        .get(
          `/api/observaciones/${o.id}/plazo?minutos=30&fecha=${sumarDias(hoy, 10)}&hora=12:00`,
        )
        .set(como('prod'))
        .expect(200)
    ).body as PlazoEvaluado;
    expect(holgado.cabe).toBe(true);
  });

  it('la asistente administrativa contrapropone otra hora; la de producción programa a quien hizo el trabajo, primero en su cola', async () => {
    const [o] = await abiertas('ana');
    await http()
      .post(`/api/observaciones/${o.id}/confirmar`)
      .set(como('aux1'))
      .send({})
      .expect(403);
    await http()
      .post(`/api/observaciones/${o.id}/programar`)
      .set(como('prod'))
      .send({})
      .expect(409); // falta confirmar
    await http()
      .post(`/api/observaciones/${o.id}/confirmar`)
      .set(como('ana'))
      .send({ fecha: manana })
      .expect(400); // día sin hora
    const c = (
      await http()
        .post(`/api/observaciones/${o.id}/confirmar`)
        .set(como('ana'))
        .send({
          fecha: sumarDias(manana, 1),
          hora: '10:30',
          nota: 'El cliente prefiere la mañana',
        })
        .expect(200)
    ).body as ObservacionDetalle;
    expect(c.estado).toBe('confirmada');
    expect(c.entregaConfirmada).not.toBe(c.entregaPropuesta);
    expect(
      await prisma.notificacion.count({
        where: { usuarioId: ids.prod, tipo: 'observacion.confirmada' },
      }),
    ).toBe(1);

    await http()
      .post(`/api/observaciones/${o.id}/programar`)
      .set(como('ana'))
      .send({})
      .expect(403);
    // Candidatos: todos auxiliares con lo que cabe y lo que atrasarían
    const cand = (
      await http()
        .get(`/api/observaciones/${o.id}/candidatos`)
        .set(como('prod'))
        .expect(200)
    ).body as CandidatoCorreccion[];
    expect(cand.map((c) => c.usuario.id)).toEqual(
      expect.arrayContaining([ids.aux1, ids.aux2]),
    );
    expect(cand.find((c) => c.usuario.id === ids.aux1)?.esOriginal).toBe(true);
    // aux2 no tiene nada en cola: le cabe y no atrasa a nadie; se recomienda a quien hizo el trabajo si también llega a tiempo, y solo a uno
    expect(cand.find((c) => c.usuario.id === ids.aux2)).toMatchObject({
      pasanARojo: 0,
    });
    expect(cand.find((c) => c.usuario.id === ids.aux2)?.plazo.cabe).toBe(true);
    expect(cand.filter((c) => c.recomendado)).toHaveLength(1);
    await http()
      .get(`/api/observaciones/${o.id}/candidatos`)
      .set(como('ana'))
      .expect(403);
    // Con el auxiliar original (cola llena), si deja tareas sin llegar o no cabe, hay que confirmarlo
    const aux1 = cand.find((c) => c.usuario.id === ids.aux1)!;
    if (aux1.pasanARojo > 0 || !aux1.plazo.cabe) {
      const r = await http()
        .post(`/api/observaciones/${o.id}/programar`)
        .set(como('prod'))
        .send({})
        .expect(409);
      expect(r.body.codigo).toBe('impacto_cola');
    }
    const p = (
      await http()
        .post(`/api/observaciones/${o.id}/programar`)
        .set(como('prod'))
        .send({ confirmarImpacto: true })
        .expect(200)
    ).body as ObservacionDetalle;
    expect(p.estado).toBe('programada');
    expect(p.tareaId).toBeTruthy();
    const cola = await colaDe('aux1');
    expect(cola.items[0]).toMatchObject({ tareaId: p.tareaId, minutos: 120 });
    expect(
      (await prisma.tarea.findUniqueOrThrow({ where: { id: p.tareaId! } }))
        .notas,
    ).toContain('1. Falta la estructura');
  });

  it('al completar la corrección, la observación y su lista quedan resueltas y se avisa para reentregar', async () => {
    const [o] = (
      await http()
        .get(`/api/observaciones?trabajoId=${trabajo.id}&estado=programada`)
        .set(como('ana'))
        .expect(200)
    ).body as ObservacionItem[];
    await http()
      .post(`/api/tareas/${o.tareaId}/completar`)
      .set(como('aux1'))
      .send({})
      .expect(201);
    const r = (
      await http()
        .get(`/api/observaciones/${o.id}`)
        .set(como('ana'))
        .expect(200)
    ).body as ObservacionDetalle;
    expect(r.estado).toBe('resuelta');
    expect(r.items.every((i) => i.resuelto)).toBe(true);
    expect(
      await prisma.notificacion.count({
        where: { usuarioId: ids.ana, tipo: 'observacion.resuelta' },
      }),
    ).toBe(1);
  });

  it('programa con otra persona y propone horas extra cuando no cabe', async () => {
    await prisma.entregable.update({
      where: { id: entregableId },
      data: { estado: 'entregado' },
    });
    await http()
      .post(`/api/entregables/${entregableId}/respuesta-cliente`)
      .set(como('ana'))
      .send({ conforme: false, observaciones: 'Más cambios' })
      .expect(201);
    const [o] = (
      await http()
        .get(`/api/observaciones?trabajoId=${trabajo.id}&estado=por_valorar`)
        .set(como('jefe'))
        .expect(200)
    ).body as ObservacionItem[];
    expect(o.ronda).toBe(2);
    await http()
      .post(`/api/observaciones/${o.id}/valorar`)
      .set(como('jefe'))
      .send({
        minutos: 60,
        fecha: manana,
        hora: '12:00',
        items: ['Ajustar el resumen'],
      })
      .expect(200);
    await http()
      .post(`/api/observaciones/${o.id}/confirmar`)
      .set(como('ana'))
      .send({})
      .expect(200);
    const r = (
      await http()
        .post(`/api/observaciones/${o.id}/programar`)
        .set(como('prod'))
        .send({ usuarioId: ids.aux2 })
        .expect(200)
    ).body as ObservacionDetalle;
    expect(r.estado).toBe('programada');
    expect((await colaDe('aux2')).items[0].tareaId).toBe(r.tareaId);
  });

  it('si no cabe antes de la entrega pide confirmar; con horas extra propuestas queda programada y la propuesta registrada', async () => {
    await prisma.entregable.update({
      where: { id: entregableId },
      data: { estado: 'entregado' },
    });
    await http()
      .post(`/api/entregables/${entregableId}/respuesta-cliente`)
      .set(como('ana'))
      .send({ conforme: false, observaciones: 'Cambios grandes' })
      .expect(201);
    const [o] = (
      await http()
        .get(`/api/observaciones?trabajoId=${trabajo.id}&estado=por_valorar`)
        .set(como('jefe'))
        .expect(200)
    ).body as ObservacionItem[];
    const dia = sumarDias(hoy, 1);
    await http()
      .post(`/api/observaciones/${o.id}/valorar`)
      .set(como('jefe'))
      .send({
        minutos: 3000,
        fecha: dia,
        hora: '09:00',
        items: ['Rehacer el capítulo 2'],
      })
      .expect(200);
    await http()
      .post(`/api/observaciones/${o.id}/confirmar`)
      .set(como('ana'))
      .send({})
      .expect(200);
    const r = await http()
      .post(`/api/observaciones/${o.id}/programar`)
      .set(como('prod'))
      .send({ usuarioId: ids.aux2 })
      .expect(409);
    expect(r.body.codigo).toBe('impacto_cola');
    const ok = (
      await http()
        .post(`/api/observaciones/${o.id}/programar`)
        .set(como('prod'))
        .send({ usuarioId: ids.aux2, extra: { modalidad: 'bono', monto: 80 } })
        .expect(200)
    ).body as ObservacionDetalle;
    expect(ok.estado).toBe('programada');
    expect(ok.avisoExtra).toBeNull();
    expect(
      await prisma.horaExtraBono.count({
        where: {
          usuarioId: ids.aux2,
          modalidad: 'bono',
          trabajoId: trabajo.id,
        },
      }),
    ).toBe(1);
  });
});
