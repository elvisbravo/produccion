/**
 * Pruebas e2e de prospectos. Corren contra la base produccion_test (se prepara sola).
 * Crean sus propios usuarios y datos, y los borran al terminar.
 */
import type { CatalogosProspecto, ProspectoDetalle } from '@grupoes/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configurarApp } from '../src/app.setup.js';
import { hashPassword } from '../src/auth/password.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const sufijo = Date.now().toString().slice(-6);
const celular = (n: number) => `9${sufijo}${String(n).padStart(2, '0')}`; // 9 dígitos únicos por corrida
const PASSWORD = 'Prueba-e2e-123';

describe('Prospectos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let catalogos: CatalogosProspecto;
  const tokens: Record<'ana' | 'beto' | 'prod', string> = { ana: '', beto: '', prod: '' };
  const usuariosCreados: string[] = [];

  const http = () => request(app.getHttpServer());
  const como = (quien: keyof typeof tokens) => ({ Authorization: `Bearer ${tokens[quien]}` });

  async function crearUsuario(clave: keyof typeof tokens, rol: string) {
    const email = `e2e.${clave}.${sufijo}@grupoes.local`;
    const rolDb = await prisma.rol.findUniqueOrThrow({ where: { codigo: rol } });
    const u = await prisma.usuario.create({
      data: { nombres: `E2E ${clave}`, apellidos: 'Prueba', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rolDb.id } } },
    });
    usuariosCreados.push(u.id);
    const res = await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    tokens[clave] = res.body.accessToken;
  }

  const basico = (extra: Record<string, unknown> = {}) => ({
    tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
    prioridadId: catalogos.prioridades.find((p) => p.porDefecto)!.id,
    origenId: catalogos.origenes.find((o) => o.nombre === 'TikTok')!.id,
    contactos: [{ celular: celular(1), esPrincipal: true }],
    ...extra,
  });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    await crearUsuario('ana', 'ASIST_ADM');
    await crearUsuario('beto', 'ASIST_ADM');
    await crearUsuario('prod', 'ASIST_PROD');
    catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
  });

  afterAll(async () => {
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuariosCreados } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuariosCreados } } });
    await app.close();
  });

  it('entrega los catálogos del formulario', () => {
    expect(catalogos.tiposTrabajo.length).toBeGreaterThan(0);
    expect(catalogos.etapas.some((e) => e.clase === 'ganada')).toBe(true);
    expect(catalogos.prioridades.filter((p) => p.porDefecto)).toHaveLength(1);
  });

  it('registra un prospecto solo con el celular y genera su código', async () => {
    const res = await http().post('/api/prospectos').set(como('ana')).send(basico()).expect(201);
    const p = res.body as ProspectoDetalle;
    expect(p.codigo).toMatch(/^P-\d{4}-\d{4}$/);
    expect(p.etapa.nombre).toBe('Nuevo');
    expect(p.contactos[0].celular).toBe(`+51${celular(1)}`);
    expect(p.eventos[0].tipo).toBe('creado');
    const auditoria = await prisma.auditoria.findFirst({ where: { entidad: 'prospecto', entidadId: p.id } });
    expect(auditoria?.accion).toBe('crear');
  });

  it('reutiliza la persona si el celular ya existe y avisa la coincidencia', async () => {
    const coincidencia = await http().get(`/api/personas/por-celular/${celular(1)}`).set(como('beto')).expect(200);
    expect(coincidencia.body.coincidencia.prospectos).toHaveLength(1);

    const res = await http()
      .post('/api/prospectos')
      .set(como('beto'))
      .send(basico({ contactos: [{ celular: `+51 ${celular(1)}`, nombres: 'Lucía', esPrincipal: true }] }))
      .expect(201);
    const personas = await prisma.persona.count({ where: { celular: `+51${celular(1)}` } });
    expect(personas).toBe(1);
    expect(res.body.contactos[0].nombres).toBe('Lucía');
  });

  it('rechaza un documento que ya pertenece a otra persona', async () => {
    const dni = `7${sufijo}9`;
    await http()
      .post('/api/prospectos')
      .set(como('ana'))
      .send(basico({ contactos: [{ celular: celular(2), tipoDocumento: 'DNI', numeroDocumento: dni, esPrincipal: true }] }))
      .expect(201);
    const res = await http()
      .post('/api/prospectos')
      .set(como('ana'))
      .send(basico({ contactos: [{ celular: celular(3), tipoDocumento: 'DNI', numeroDocumento: dni, esPrincipal: true }] }))
      .expect(409);
    expect(res.body.message).toContain(dni);
  });

  it('valida los campos y el máximo de integrantes del tipo de trabajo', async () => {
    const invalido = await http()
      .post('/api/prospectos')
      .set(como('ana'))
      .send(basico({ contactos: [{ celular: '123', esPrincipal: false }], linkDrive: 'no-es-url' }))
      .expect(400);
    const campos = invalido.body.errores.map((e: { campo: string }) => e.campo);
    // Las reglas entre contactos (principal, duplicados) se evalúan cuando cada contacto ya es válido.
    expect(campos).toEqual(expect.arrayContaining(['contactos.0.celular', 'linkDrive']));

    const excedido = await http()
      .post('/api/prospectos')
      .set(como('ana'))
      .send(basico({ contactos: [4, 5, 6].map((n, i) => ({ celular: celular(n), esPrincipal: i === 0 })) }))
      .expect(400);
    expect(excedido.body.errores[0].mensaje).toContain('hasta 2 integrantes');
  });

  it('con alcance "propios" cada asistente ve solo sus prospectos; producción ve todos', async () => {
    const deAna = await http().get('/api/prospectos').set(como('ana')).expect(200);
    const deBeto = await http().get('/api/prospectos').set(como('beto')).expect(200);
    const deProd = await http().get('/api/prospectos?porPagina=100').set(como('prod')).expect(200);

    expect(deAna.body.total).toBe(2);
    expect(deBeto.body.total).toBe(1);
    expect(deProd.body.total).toBeGreaterThanOrEqual(3);

    const ajeno = deAna.body.datos[0].id;
    await http().get(`/api/prospectos/${ajeno}`).set(como('beto')).expect(404);
    await http().patch(`/api/prospectos/${ajeno}`).set(como('beto')).send(basico()).expect(404);
  });

  it('producción no puede crear prospectos (permiso)', async () => {
    await http().post('/api/prospectos').set(como('prod')).send(basico()).expect(403);
  });

  it('busca por celular, nombre o código', async () => {
    const porNombre = await http().get('/api/prospectos?q=lucia').set(como('beto')).expect(200);
    expect(porNombre.body.total).toBe(1);
    const porCelular = await http().get(`/api/prospectos?q=${celular(1).slice(-5)}`).set(como('beto')).expect(200);
    expect(porCelular.body.total).toBe(1);
  });

  it('edita el prospecto y registra qué cambió', async () => {
    const lista = await http().get('/api/prospectos').set(como('beto')).expect(200);
    const id = lista.body.datos[0].id;
    const res = await http()
      .patch(`/api/prospectos/${id}`)
      .set(como('beto'))
      .send(
        basico({
          contactos: [
            { celular: celular(1), esPrincipal: false },
            { celular: celular(7), nombres: 'Diego', esPrincipal: true },
          ],
          titulo: 'Calidad de vida en pacientes',
          temperatura: 'caliente',
        }),
      )
      .expect(200);
    const p = res.body as ProspectoDetalle;
    expect(p.contactos).toHaveLength(2);
    expect(p.contactos[0].nombres).toBe('Diego');
    expect(p.eventos[0].detalle).toBe('Se actualizó: contactos, título, temperatura');
  });

  it('agrega universidades al vuelo sin duplicarlas', async () => {
    const nombre = `Universidad E2E ${sufijo}`;
    const a = await http().post('/api/catalogos/universidades').set(como('ana')).send({ nombre }).expect(201);
    const b = await http().post('/api/catalogos/universidades').set(como('ana')).send({ nombre: nombre.toUpperCase() }).expect(201);
    expect(b.body.id).toBe(a.body.id);
    await prisma.universidad.delete({ where: { id: a.body.id } });
  });

  it('trata como iguales los nombres que solo difieren en tildes', async () => {
    const existente = await prisma.carrera.findUniqueOrThrow({ where: { nombre: 'Ingeniería Civil' } });
    const res = await http().post('/api/catalogos/carreras').set(como('ana')).send({ nombre: 'ingenieria civil' }).expect(201);
    expect(res.body.id).toBe(existente.id);
    const busqueda = await http().get('/api/catalogos/carreras?q=ingenieria civ').set(como('ana')).expect(200);
    expect(busqueda.body.map((c: { nombre: string }) => c.nombre)).toContain('Ingeniería Civil');
  });
});
