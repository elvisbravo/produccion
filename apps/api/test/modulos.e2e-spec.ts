/**
 * Pruebas e2e de la vista de módulos y permisos (base produccion_test).
 */
import type { ModuloPermisos } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const PASSWORD = 'Prueba-e2e-123';

describe('Módulos y permisos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const [q, codigo] of [['admin', 'ADMIN'], ['prod', 'ASIST_PROD']] as const) {
      const email = `e2e.mod.${q}.${sufijo}@grupoes.local`;
      const r = await prisma.rol.findUniqueOrThrow({ where: { codigo } });
      ids.push((await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Modulos', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: r.id } } } })).id);
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
  });

  afterAll(async () => {
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('solo lo consulta quien puede ver módulos', async () => {
    await http().get('/api/modulos').set({ Authorization: `Bearer ${tokens.prod}` }).expect(403);
  });

  it('lista cada módulo con sus acciones y los roles que las tienen', async () => {
    const lista = (await http().get('/api/modulos').set({ Authorization: `Bearer ${tokens.admin}` }).expect(200)).body as ModuloPermisos[];
    const trabajos = lista.find((m) => m.codigo === 'trabajos')!;
    expect(trabajos.grupo).toBeTruthy();
    const pausar = trabajos.acciones.find((a) => a.permiso === 'trabajos.pausar')!;
    expect(pausar.vigente).toBe(true);
    expect(pausar.roles.map((r) => r.codigo)).toContain('ASIST_PROD');
    expect(lista.some((m) => m.codigo === 'modulos')).toBe(true);
    const ver = trabajos.acciones.find((a) => a.permiso === 'trabajos.ver')!;
    expect(ver.usaAlcance).toBe(true);
  });
});
