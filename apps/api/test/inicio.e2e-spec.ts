/**
 * Pruebas e2e del panel de inicio (base produccion_test).
 */
import type { PanelInicio } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const PASSWORD = 'Prueba-e2e-123';
const ROLES = { admin: 'ADMIN', adm: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR' } as const;
type Quien = keyof typeof ROLES;

describe('Panel de inicio (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());
  const panel = async (q: Quien) => (await http().get('/api/inicio').set({ Authorization: `Bearer ${tokens[q]}` }).expect(200)).body as PanelInicio;

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROLES) as Quien[]) {
      const email = `e2e.ini.${q}.${sufijo}@grupoes.local`;
      const r = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROLES[q] } });
      ids.push((await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Inicio', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: r.id } } } })).id);
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('exige sesión', async () => {
    await http().get('/api/inicio').expect(401);
  });

  it('el administrador ve todos los bloques', async () => {
    const p = await panel('admin');
    expect(p.secciones).toEqual(expect.arrayContaining(['trabajos', 'entregables', 'comercial', 'cobranza', 'equipo', 'mi_cola', 'ausencias', 'actividad']));
    expect(p.indicadores.map((i) => i.clave)).toEqual(expect.arrayContaining(['trabajos_abiertos', 'fuera_de_plazo', 'por_cobrar', 'vencido', 'prospectos_abiertos']));
    expect(p.graficos.embudo).not.toBeNull();
    expect(p.graficos.cobranza).toHaveLength(5);
    expect(p.graficos.ocupacion).not.toBeNull();
    expect(p.actividad).not.toBeNull();
    expect(p.miCola).not.toBeNull();
  });

  it('cada rol ve solo lo que sus permisos permiten', async () => {
    const aux = await panel('aux');
    expect(aux.secciones).toContain('mi_cola');
    expect(aux.secciones).not.toContain('cobranza');
    expect(aux.secciones).not.toContain('equipo');
    expect(aux.graficos.cobranza).toBeNull();
    expect(aux.actividad).toBeNull();
    expect(aux.indicadores.map((i) => i.clave)).not.toContain('vencido');

    const adm = await panel('adm');
    expect(adm.secciones).toContain('comercial');
    expect(adm.secciones).not.toContain('equipo');
    expect(adm.graficos.embudo).not.toBeNull();
    expect(adm.graficos.ocupacion).toBeNull();
  });

  it('los pendientes solo aparecen con cantidad y llevan enlace', async () => {
    const p = await panel('admin');
    for (const x of p.pendientes) {
      expect(x.cantidad).toBeGreaterThan(0);
      expect(x.enlace.startsWith('/')).toBe(true);
    }
  });
});
