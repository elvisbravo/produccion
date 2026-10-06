/**
 * Pruebas e2e de reprogramar la entrega de un trabajo y editar sus datos (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type ProspectoDetalle, type TrabajoDetalle } from '@grupoes/shared';
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

type Quien = 'ana' | 'prod' | 'aux' | 'jefe';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', jefe: 'JEFE_PROD' };

describe('Reprogramar entrega y editar datos del trabajo (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let trabajo: TrabajoDetalle;
  let academicos: Awaited<ReturnType<typeof datosAcademicos>>;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const ficha = async () => (await http().get(`/api/trabajos/${trabajo.id}`).set(como('prod')).expect(200)).body as TrabajoDetalle;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    academicos = await datosAcademicos(prisma);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.edi.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      ids[q] = (await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Edicion', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } })).id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body as CatalogosProspecto;
    const p = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
          prioridadId: catalogos.prioridades.find((x) => !x.nombre.toLowerCase().includes('urgente'))!.id,
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
          integrantes: [{ personaId: p.contactos[0].id, nombres: 'Cliente', apellidos: 'Edicion', email: `ed.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `3${sufijo}1`, esTitular: true }],
          trabajo: { ...academicos, titulo: 'Título original', fechaInicio: hoy, fechaLimite: sumarDias(hoy, 30) },
          contrato: { fechaFirma: hoy, montoTotal: 500, formaPago: 'contado', cuotas: [{ monto: 500, vencimiento: hoy }] },
        })
        .expect(201)
    ).body as TrabajoDetalle;
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, auxiliaresApoyo: [], jefeResponsableId: ids.jefe }).expect(200);
    // Un avance parcial a mitad de plazo y la entrega final en la fecha límite
    await http().post(`/api/trabajos/${trabajo.id}/entregables`).set(como('prod')).send({ nombre: 'Avance 1', fechaLimite: sumarDias(hoy, 15), esFinal: false }).expect(201);
    await http().post(`/api/trabajos/${trabajo.id}/entregables`).set(como('prod')).send({ nombre: 'Entrega final', fechaLimite: sumarDias(hoy, 30), esFinal: true }).expect(201);
    trabajo = await ficha();
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('reprogramar exige permiso, motivo y una fecha válida', async () => {
    const nueva = sumarDias(hoy, 45);
    await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('aux')).send({ fechaLimite: nueva, motivo: 'El cliente pidió más plazo' }).expect(403);
    await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('prod')).send({ fechaLimite: nueva }).expect(400);
    await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('prod')).send({ fechaLimite: sumarDias(hoy, 30), motivo: 'Igual' }).expect(400); // misma fecha
    await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('prod')).send({ fechaLimite: sumarDias(hoy, -1), motivo: 'Pasada' }).expect(400);
  });

  it('al alargar el plazo, la entrega final se mueve con el trabajo y el avance se queda; queda en el historial y se avisa', async () => {
    const nueva = sumarDias(hoy, 45);
    const t = (await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('prod')).send({ fechaLimite: nueva, motivo: 'El cliente pidió más plazo' }).expect(200)).body as TrabajoDetalle;
    expect(t.fechaLimite).toBe(nueva);
    expect(t.entregables.find((e) => e.nombre === 'Entrega final')!.fechaLimite).toBe(nueva);
    expect(t.entregables.find((e) => e.nombre === 'Avance 1')!.fechaLimite).toBe(sumarDias(hoy, 15));
    expect(t.eventos[0].detalle).toContain('Entrega reprogramada');
    expect(t.eventos[0].detalle).toContain('El cliente pidió más plazo');
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.aux, tipo: 'trabajo.reprogramado' } })).toBe(1);
    expect(await prisma.notificacion.count({ where: { usuarioId: ids.ana, tipo: 'trabajo.reprogramado' } })).toBe(1);
  });

  it('al acortar el plazo, los entregables que quedaban después se ajustan a la nueva fecha', async () => {
    const nueva = sumarDias(hoy, 10);
    const t = (await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('prod')).send({ fechaLimite: nueva, motivo: 'Se adelanta la sustentación' }).expect(200)).body as TrabajoDetalle;
    for (const e of t.entregables) expect(e.fechaLimite <= nueva).toBe(true);
    expect(t.entregables.find((e) => e.nombre === 'Avance 1')!.fechaLimite).toBe(nueva);
    expect(t.eventos[0].detalle).toContain('entregables');
  });

  it('con las fechas inamovibles no se reprograma hasta liberarlas', async () => {
    const accion = await prisma.accion.findFirstOrThrow({ where: { codigo: 'fijar_fechas', modulo: { codigo: 'trabajos' } } });
    await prisma.usuarioPermiso.upsert({ where: { usuarioId_accionId: { usuarioId: ids.prod, accionId: accion.id } }, create: { usuarioId: ids.prod, accionId: accion.id, tipo: 'conceder', otorgadoPor: ids.prod }, update: { tipo: 'conceder' } });
    await http().post(`/api/trabajos/${trabajo.id}/fechas-fijas`).set(como('prod')).send({ motivo: 'Fecha de sustentación' }).expect(200);
    await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('prod')).send({ fechaLimite: sumarDias(hoy, 20), motivo: 'Intento' }).expect(400);
    await http().delete(`/api/trabajos/${trabajo.id}/fechas-fijas`).set(como('prod')).expect(200);
    await http().post(`/api/trabajos/${trabajo.id}/reprogramar`).set(como('prod')).send({ fechaLimite: sumarDias(hoy, 20), motivo: 'Ya liberadas' }).expect(200);
  });

  it('editar los datos del trabajo: valida, deja historial con lo que cambió y no toca fechas', async () => {
    const fechaAntes = (await ficha()).fechaLimite;
    const cuerpo = { titulo: 'Título corregido', nivelAcademicoId: academicos.nivelAcademicoId, universidadId: academicos.universidadId, carreraId: academicos.carreraId, linkDrive: 'https://drive.google.com/drive/folders/corregido', observaciones: 'Nota nueva' };
    await http().put(`/api/trabajos/${trabajo.id}/datos`).set(como('aux')).send(cuerpo).expect(403);
    await http().put(`/api/trabajos/${trabajo.id}/datos`).set(como('prod')).send({ ...cuerpo, linkDrive: 'drive' }).expect(400);
    await http().put(`/api/trabajos/${trabajo.id}/datos`).set(como('prod')).send({ ...cuerpo, universidadId: '0199a000-0000-7000-8000-000000000009' }).expect(400);
    const t = (await http().put(`/api/trabajos/${trabajo.id}/datos`).set(como('prod')).send(cuerpo).expect(200)).body as TrabajoDetalle;
    expect(t.titulo).toBe('Título corregido');
    expect(t.linkDrive).toBe('https://drive.google.com/drive/folders/corregido');
    expect(t.observaciones).toBe('Nota nueva');
    expect(t.fechaLimite).toBe(fechaAntes);
    expect(t.eventos[0].detalle).toContain('título');
    expect(t.eventos[0].detalle).toContain('enlace de Drive');
    // Sin cambios no se registra nada nuevo
    const sinCambios = (await http().put(`/api/trabajos/${trabajo.id}/datos`).set(como('prod')).send(cuerpo).expect(200)).body as TrabajoDetalle;
    expect(sinCambios.eventos).toHaveLength(t.eventos.length);
  });
});
