/**
 * Pruebas e2e de autenticación. Corren contra la base produccion_test (se prepara sola):
 *   pnpm db:up && pnpm test:e2e
 */
import { createHash } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@grupoes.local';
const password = process.env.SEED_ADMIN_PASSWORD ?? '';

const cookieRefresh = (res: request.Response) => {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((c) => c.startsWith('ges_rt='))?.split(';')[0];
};

describe('Autenticación (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  /** Simula que la rotación ocurrió hace un minuto (fuera del margen de concurrencia). */
  const envejecerRevocacion = async (cookie: string) => {
    const token = decodeURIComponent(cookie.split('=')[1]);
    await prisma.sesion.update({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      data: { revocadaEn: new Date(Date.now() - 60_000) },
    });
  };

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/salud responde sin sesión', async () => {
    const res = await request(app.getHttpServer()).get('/api/salud').expect(200);
    expect(res.body.baseDeDatos).toBe('ok');
  });

  it('rechaza datos de login inválidos con el detalle por campo', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'x', password: '' }).expect(400);
    expect(res.body.errores.map((e: { campo: string }) => e.campo)).toEqual(['email', 'password']);
  });

  it('usa el mismo mensaje para correo inexistente y contraseña incorrecta', async () => {
    const a = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'nadie@grupoes.local', password: 'x' });
    const b = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'incorrecta' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  it('inicia sesión, consulta /me y rota el refresh token', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body).not.toHaveProperty('refreshToken');
    const cookie1 = cookieRefresh(login)!;
    expect(cookie1).toBeTruthy();

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body.email).toBe(email);
    expect(me.body.menu.length).toBeGreaterThan(0);

    const refresh = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie1).expect(200);
    const cookie2 = cookieRefresh(refresh)!;
    expect(cookie2).not.toBe(cookie1);
    expect(refresh.body.inactividadMinutos).toBeGreaterThan(0);

    // Pasado el margen de concurrencia, reutilizar el token rotado revoca también el vigente.
    await envejecerRevocacion(cookie1);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie1).expect(401);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie2).expect(401);
  });

  it('tolera dos refresh casi simultáneos con la misma cookie (varias pestañas)', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
    const cookie = cookieRefresh(login)!;

    const a = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(200);
    const b = await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(200);

    // Ambas pestañas quedan con sesiones válidas.
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookieRefresh(a)!).expect(200);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookieRefresh(b)!).expect(200);
  });

  it('no permite refrescar después de cerrar sesión', async () => {
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
    const cookie = cookieRefresh(login)!;
    await request(app.getHttpServer()).post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await request(app.getHttpServer()).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('exige sesión en los endpoints protegidos', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });
});
