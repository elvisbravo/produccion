/**
 * Pruebas e2e de comentarios con @menciones (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type ComentarioItem, type ProspectoDetalle, type TrabajoDetalle, type UsuarioResumen } from '@grupoes/shared';
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

type Quien = 'ana' | 'beto' | 'prod' | 'aux' | 'jefe';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', beto: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Comentarios con @menciones (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let prospecto: ProspectoDetalle;
  let trabajo: TrabajoDetalle;
  let entregableId: string;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const mencion = (q: Quien) => `@[E2E ${q} Comentarios](${ids[q]})`;
  const comentar = (q: Quien, entidad: string, entidadId: string, texto: string) => http().post('/api/comentarios').set(como(q)).send({ entidad, entidadId, texto });
  const hilo = (q: Quien, entidad: string, entidadId: string) => http().get(`/api/comentarios?entidad=${entidad}&entidadId=${entidadId}`).set(como(q));
  const avisos = (q: Quien) => prisma.notificacion.findMany({ where: { usuarioId: ids[q], tipo: 'comentario.mencion' }, orderBy: { creadaEn: 'asc' } });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.m.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Comentarios', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const crear = async (n: number) =>
      (
        await http()
          .post('/api/prospectos')
          .set(como('ana'))
          .send({
            tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Monografía')!.id,
            prioridadId: catalogos.prioridades[0].id,
            origenId: catalogos.origenes[0].id,
            contactos: [{ celular: celular(n), esPrincipal: true }],
          })
          .expect(201)
      ).body as ProspectoDetalle;
    prospecto = await crear(1);

    const otro = await crear(2);
    trabajo = (
      await http()
        .post(`/api/prospectos/${otro.id}/convertir`)
        .set(como('ana'))
        .send({
          integrantes: [{ personaId: otro.contactos[0].id, nombres: 'Cliente', apellidos: 'Comentarios', email: `m.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `6${sufijo}1`, esTitular: true }],
          trabajo: { fechaInicio: hoy, fechaLimite: sumarDias(hoy, 60) },
          contrato: { fechaFirma: hoy, montoTotal: 1000, formaPago: 'contado', cuotas: [{ monto: 1000, vencimiento: hoy }] },
        })
        .expect(201)
    ).body;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    entregableId = (await prisma.entregable.create({ data: { trabajoId: trabajo.id, nombre: 'Capítulo I', orden: 1, fechaLimite: new Date(`${sumarDias(hoy, 10)}T00:00:00Z`) } })).id;
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.comentario.deleteMany({ where: { autorId: { in: usuarios } } });
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('solo se puede mencionar a quien ve el registro', async () => {
    const lista = (await http().get(`/api/comentarios/mencionables?entidad=prospecto&entidadId=${prospecto.id}`).set(como('ana')).expect(200)).body as UsuarioResumen[];
    const visibles = lista.map((u) => u.id);
    // Producción ve todos los prospectos; Beto solo los suyos y el auxiliar ninguno.
    expect(visibles).toContain(ids.prod);
    expect(visibles).not.toContain(ids.beto);
    expect(visibles).not.toContain(ids.aux);
    expect(visibles).not.toContain(ids.ana);

    const r = await comentar('ana', 'prospecto', prospecto.id, `Revisa esto ${mencion('beto')}`).expect(400);
    expect(r.body.message).toContain('no tiene acceso');
  });

  it('comentar con mención avisa al mencionado con enlace al registro', async () => {
    const c = (await comentar('ana', 'prospecto', prospecto.id, `Pidió precio por WhatsApp, ${mencion('prod')} ¿hay espacio en marzo?`).expect(201)).body as ComentarioItem;
    expect(c.menciones.map((m) => m.id)).toEqual([ids.prod]);

    const [aviso] = await avisos('prod');
    expect(aviso.titulo).toBe(`E2E ana te mencionó en el prospecto ${prospecto.codigo}`);
    expect(aviso.mensaje).toBe('Pidió precio por WhatsApp, @E2E prod Comentarios ¿hay espacio en marzo?');
    expect(aviso.enlace).toBe(`/prospectos/${prospecto.id}`);

    const lista = (await hilo('prod', 'prospecto', prospecto.id).expect(200)).body as ComentarioItem[];
    expect(lista.map((x) => x.id)).toEqual([c.id]);
    await hilo('beto', 'prospecto', prospecto.id).expect(404);
    await comentar('beto', 'prospecto', prospecto.id, 'Hola').expect(404);
  });

  it('en un entregable, el auxiliar del equipo ve el hilo y recibe la mención', async () => {
    await comentar('ana', 'entregable', entregableId, `${mencion('aux')} el cliente pidió más fuentes`).expect(201);
    const [aviso] = await avisos('aux');
    expect(aviso.titulo).toBe(`E2E ana te mencionó en "Capítulo I" de ${trabajo.codigo}`);
    expect(aviso.enlace).toBe(`/trabajos/${trabajo.id}`);
    const lista = (await hilo('aux', 'entregable', entregableId).expect(200)).body as ComentarioItem[];
    expect(lista).toHaveLength(1);
    // Beto (asistente administrativo) ve todos los trabajos.
    await hilo('beto', 'trabajo', trabajo.id).expect(200);
  });

  it('en una tarea de prospecto: el hilo sigue el alcance del prospecto', async () => {
    const actividad = await prisma.actividad.findFirstOrThrow({ where: { aplicaA: { in: ['prospecto', 'ambos'] } } });
    const tarea = await prisma.tarea.create({ data: { actividadId: actividad.id, prospectoId: prospecto.id, fecha: new Date(`${hoy}T00:00:00Z`), minutosEstimados: 30, estado: 'pendiente', creadaPorId: ids.ana } });
    await comentar('ana', 'tarea', tarea.id, 'Llamar después de las 6').expect(201);
    await hilo('beto', 'tarea', tarea.id).expect(404);
    await hilo('prod', 'tarea', tarea.id).expect(200);
  });

  it('editar avisa solo a los nuevos mencionados; solo el autor edita o borra', async () => {
    const c = (await comentar('ana', 'trabajo', trabajo.id, `Contrato firmado ${mencion('jefe')}`).expect(201)).body as ComentarioItem;
    expect(await avisos('jefe')).toHaveLength(1);

    await http().patch(`/api/comentarios/${c.id}`).set(como('beto')).send({ texto: 'Cambio ajeno' }).expect(403);
    const editado = (await http().patch(`/api/comentarios/${c.id}`).set(como('ana')).send({ texto: `Contrato firmado ${mencion('jefe')} ${mencion('aux')}` }).expect(200)).body as ComentarioItem;
    expect(editado.editadoEn).not.toBeNull();
    expect(editado.menciones.map((m) => m.id).sort()).toEqual([ids.jefe, ids.aux].sort());
    expect(await avisos('jefe')).toHaveLength(1);
    expect(await avisos('aux')).toHaveLength(2);

    await http().delete(`/api/comentarios/${c.id}`).set(como('beto')).expect(403);
    await http().delete(`/api/comentarios/${c.id}`).set(como('ana')).expect(204);
    const lista = (await hilo('ana', 'trabajo', trabajo.id).expect(200)).body as ComentarioItem[];
    expect(lista.find((x) => x.id === c.id)).toBeUndefined();
  });
});
