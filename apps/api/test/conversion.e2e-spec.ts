/**
 * Pruebas e2e de la conversión del embudo comercial (base produccion_test).
 * Como la base de pruebas es compartida, las cifras exactas se validan por asistente (usuarios propios de la prueba).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type FilaConversion, type ProspectoDetalle, type ReporteConversion, type Tablero } from '@grupoes/shared';
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
const periodo = `desde=${sumarDias(hoy, -30)}&hasta=${hoy}`;

type Quien = 'ana' | 'beto' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', beto: 'ASIST_ADM', admin: 'ADMIN' };

describe('Conversión del embudo comercial (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let catalogos: CatalogosProspecto;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });
  const etapa = (nombre: string) => catalogos.etapas.find((e) => e.nombre === nombre)!.id;
  const crearProspecto = async (q: Quien, n: number) =>
    (
      await http()
        .post('/api/prospectos')
        .set(como(q))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Monografía')!.id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          contactos: [{ celular: celular(n), esPrincipal: true }],
        })
        .expect(201)
    ).body as ProspectoDetalle;
  const moverA = (q: Quien, id: string, datos: { etapaId: string; motivoPerdidaId?: string }) => http().patch(`/api/prospectos/${id}/etapa`).set(como(q)).send(datos).expect(200);

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
        data: { nombres: `E2E ${q}`, apellidos: 'Conversión', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;

    // Ana: uno perdido después de cotizar, uno convertido (S/ 1 500), uno abierto y uno antiguo fuera del periodo.
    const perdido = await crearProspecto('ana', 1);
    await moverA('ana', perdido.id, { etapaId: etapa('Cotizado') });
    await moverA('ana', perdido.id, { etapaId: etapa('Perdido'), motivoPerdidaId: catalogos.motivosPerdida[0].id });

    const ganado = await crearProspecto('ana', 2);
    await prisma.prospecto.update({ where: { id: ganado.id }, data: { creadoEn: new Date(Date.now() - 6 * 86_400_000) } });
    await http()
      .post(`/api/prospectos/${ganado.id}/convertir`)
      .set(como('ana'))
      .send({
        integrantes: [{ personaId: ganado.contactos[0].id, nombres: 'Cliente', apellidos: 'Conversión', email: `c.${sufijo}@correo.com`, tipoDocumento: 'DNI', numeroDocumento: `4${sufijo}1`, esTitular: true }],
        trabajo: { ...(await datosAcademicos(prisma)), fechaInicio: hoy, fechaLimite: sumarDias(hoy, 30) },
        contrato: {
          fechaFirma: hoy,
          montoTotal: 1500,
          formaPago: 'cuotas',
          cuotas: [
            { monto: 1000, vencimiento: hoy },
            { monto: 500, vencimiento: sumarDias(hoy, 15) },
          ],
        },
        pagoInicial: { monto: 200, fecha: hoy, metodo: 'yape' },
      })
      .expect(201);

    const abierto = await crearProspecto('ana', 3);
    await moverA('ana', abierto.id, { etapaId: etapa('Contactado') });

    const antiguo = await crearProspecto('ana', 4);
    await prisma.prospecto.update({ where: { id: antiguo.id }, data: { creadoEn: new Date(Date.now() - 90 * 86_400_000) } });

    // Beto: uno nuevo, sin avance.
    await crearProspecto('beto', 5);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  const reporte = async () => (await http().get(`/api/reportes/conversion?${periodo}`).set(como('admin')).expect(200)).body as ReporteConversion;
  const fila = (r: ReporteConversion, q: Quien) => r.porAsistente.find((f) => f.clave === ids[q]) as FilaConversion;

  it('por asistente: prospectos del periodo, convertidos, perdidos, abiertos, tasa y monto', async () => {
    const r = await reporte();
    expect(fila(r, 'ana')).toMatchObject({ prospectos: 3, convertidos: 1, perdidos: 1, abiertos: 1, tasa: 0.333, monto: 1500 });
    expect(fila(r, 'beto')).toMatchObject({ prospectos: 1, convertidos: 0, perdidos: 0, abiertos: 1, tasa: 0, monto: 0 });
    expect(r.total.prospectos).toBeGreaterThanOrEqual(4);
    expect(r.total.diasPromedio).not.toBeNull();
    expect(r.total.ticketPromedio).toBeGreaterThan(0);
    expect(r.motivosPerdida.find((m) => m.nombre === catalogos.motivosPerdida[0].nombre)?.cantidad).toBeGreaterThanOrEqual(1);
  });

  it('el embudo cuenta a quienes llegaron a cada etapa o a una posterior', async () => {
    const r = await reporte();
    const abiertasYGanada = r.embudo.filter((e) => e.clase !== 'perdida');
    // Nunca crece de una etapa a la siguiente.
    for (let i = 1; i < abiertasYGanada.length; i++) expect(abiertasYGanada[i].alcanzaron).toBeLessThanOrEqual(abiertasYGanada[i - 1].alcanzaron);
    const de = (nombre: string) => r.embudo.find((e) => e.nombre === nombre)!;
    expect(de('Nuevo').alcanzaron).toBe(r.total.prospectos);
    // El perdido llegó hasta "Cotizado" antes de perderse.
    expect(de('Cotizado').alcanzaron).toBeGreaterThanOrEqual(2);
    expect(de('Convertido').alcanzaron).toBe(r.total.convertidos);
    expect(de('Perdido').actuales).toBeGreaterThanOrEqual(1);
  });

  it('el periodo filtra por la fecha de registro del prospecto', async () => {
    const amplio = (await http().get(`/api/reportes/conversion?desde=${sumarDias(hoy, -120)}&hasta=${hoy}`).set(como('admin')).expect(200)).body as ReporteConversion;
    expect(fila(amplio, 'ana').prospectos).toBe(4);
  });

  it('el tablero muestra la tasa de conversión', async () => {
    const t = (await http().get(`/api/reportes/tablero?${periodo}`).set(como('admin')).expect(200)).body as Tablero;
    expect(t.prospectos).toBeGreaterThanOrEqual(4);
    expect(t.conversion).not.toBeNull();
  });
});
