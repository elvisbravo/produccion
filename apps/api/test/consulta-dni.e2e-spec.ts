/**
 * Pruebas e2e de la consulta de DNI. El servicio externo se simula: nunca se llama a la API real.
 */
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { ResultadoConsultaDni } from '@grupoes/shared';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const PASSWORD = 'Prueba-e2e-123';

type Quien = 'ana' | 'aux' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', aux: 'AUXILIAR', admin: 'ADMIN' };

const ENCONTRADO = {
  respuesta: 'ok',
  encontrado: true,
  api: true,
  data: {
    nombres: 'ELVIS',
    ap_paterno: 'BRAVO',
    ap_materno: 'SANDOVAL',
    nombre: 'ELVIS BRAVO SANDOVAL',
    dni: '70167122',
    sexo: 'Masculino',
    fecha_nacimiento: '18/09/1992',
    api: { dni: '70167122', apell_pat: 'BRAVO', apell_mat: 'SANDOVAL', nombres: 'ELVIS', sexo: 'M', fec_nacimiento: '18/09/1992', fnc: 1 },
    respuesta: 'ok',
  },
};

describe('Consulta de DNI (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let respuestaExterna: () => Promise<Response>;
  const pedidas: string[] = [];
  const fetchReal = globalThis.fetch;

  const http = () => request(app.getHttpServer());
  const consultar = (q: Quien, dni: string) => http().get(`/api/consultas/dni/${dni}`).set({ Authorization: `Bearer ${tokens[q]}` });
  const json = (cuerpo: unknown, status = 200) => async () => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.dni.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({ data: { nombres: `E2E ${q}`, apellidos: 'Dni', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } } });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Solo se intercepta la llamada al servicio de DNI; el resto de fetch queda igual.
    globalThis.fetch = (async (entrada: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      if (!url.includes('/dni-ruc/dni/')) return fetchReal(entrada, init);
      pedidas.push(url);
      return respuestaExterna();
    }) as typeof fetch;
  });

  afterAll(async () => {
    globalThis.fetch = fetchReal;
    await prisma.auditoria.deleteMany({ where: { usuarioId: { in: Object.values(ids) } } });
    await prisma.usuario.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await app.close();
  });

  it('encontrado: nombres y apellidos en formato legible y la fecha en ISO', async () => {
    respuestaExterna = json(ENCONTRADO);
    const r = (await consultar('admin', '70167122').expect(200)).body as ResultadoConsultaDni;
    expect(r).toEqual({ estado: 'encontrado', datos: { nombres: 'Elvis', apellidos: 'Bravo Sandoval', fechaNacimiento: '1992-09-18' } });
    expect(pedidas.at(-1)).toMatch(/\/api\/dni-ruc\/dni\/70167122$/);
  });

  it('una respuesta con otro DNI o sin nombres no se usa', async () => {
    respuestaExterna = json({ ...ENCONTRADO, data: { ...ENCONTRADO.data, dni: '11111111' } });
    expect(((await consultar('admin', '70167122').expect(200)).body as ResultadoConsultaDni).estado).toBe('no_disponible');
    respuestaExterna = json({ ...ENCONTRADO, data: { ...ENCONTRADO.data, nombres: '' } });
    expect(((await consultar('admin', '70167122').expect(200)).body as ResultadoConsultaDni).estado).toBe('no_disponible');
  });

  it('distingue "no encontrado" de "servicio no disponible"', async () => {
    // El proveedor respondió, pero no tiene ese documento.
    respuestaExterna = json({ respuesta: 'error', titulo: 'Error', encontrado: false, data_resp: { respuesta: 'error' } });
    expect((await consultar('admin', '70167122').expect(200)).body).toEqual({ estado: 'no_encontrado' });
    // Falló la llamada del servicio al proveedor.
    respuestaExterna = json({ respuesta: 'error', titulo: 'Error', data: null, encontrado: false, mensaje: 'Error en Api de Búsqueda', errores_curl: 'Connection timed out' });
    expect((await consultar('admin', '70167122').expect(200)).body).toEqual({ estado: 'no_disponible' });
    // Tipo de documento desconocido, respuesta que no es JSON, error de red y caída del servicio.
    respuestaExterna = json({ respuesta: 'error', titulo: 'Error', mensaje: 'Tipo de Documento Desconocido' });
    expect((await consultar('admin', '70167122').expect(200)).body).toEqual({ estado: 'no_disponible' });
    respuestaExterna = async () => new Response('<html>502</html>', { status: 502 });
    expect((await consultar('admin', '70167122').expect(200)).body).toEqual({ estado: 'no_disponible' });
    respuestaExterna = async () => {
      throw new TypeError('fetch failed');
    };
    expect((await consultar('admin', '70167122').expect(200)).body).toEqual({ estado: 'no_disponible' });
  });

  it('el DNI tiene 8 dígitos y la consulta exige permisos', async () => {
    respuestaExterna = json(ENCONTRADO);
    const antes = pedidas.length;
    await consultar('admin', '7016712').expect(400);
    await consultar('admin', '7016712a').expect(400);
    // El asistente administrativo registra prospectos y clientes; el auxiliar no.
    await consultar('ana', '70167122').expect(200);
    await consultar('aux', '70167122').expect(403);
    expect(pedidas.length).toBe(antes + 1);
  });

  it('queda en la auditoría, sin guardar el número', async () => {
    const filas = await prisma.auditoria.findMany({ where: { usuarioId: ids.admin, accion: 'consultar_dni' } });
    expect(filas.length).toBeGreaterThan(0);
    expect(JSON.stringify(filas)).not.toContain('70167122');
  });

  it('limita las consultas por persona', async () => {
    respuestaExterna = json(ENCONTRADO);
    let limitada = 0;
    for (let i = 0; i < 35; i++) if ((await consultar('ana', '70167122')).status === 429) limitada++;
    expect(limitada).toBeGreaterThan(0);
  });
});
