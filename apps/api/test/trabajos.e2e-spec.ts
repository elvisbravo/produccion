/**
 * Pruebas e2e de conversión en cliente, trabajos, equipo, contrato y pagos (base produccion_test).
 */
import { diaEnLima, sumarDias, type CatalogosProspecto, type ProspectoDetalle, type TrabajoDetalle } from '@grupoes/shared';
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

type Quien = 'ana' | 'prod' | 'aux' | 'aux2' | 'jefe' | 'admin';
const ROL: Record<Quien, string> = { ana: 'ASIST_ADM', prod: 'ASIST_PROD', aux: 'AUXILIAR', aux2: 'AUXILIAR', jefe: 'JEFE_PROD', admin: 'ADMIN' };

describe('Trabajos, contratos y pagos (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let catalogos: CatalogosProspecto;
  const tokens = {} as Record<Quien, string>;
  const ids = {} as Record<Quien, string>;
  let prospecto: ProspectoDetalle;
  let trabajo: TrabajoDetalle;

  const http = () => request(app.getHttpServer());
  const como = (q: Quien) => ({ Authorization: `Bearer ${tokens[q]}` });

  const conversion = (extra: Record<string, unknown> = {}) => ({
    integrantes: prospecto.contactos.map((c, i) => ({
      personaId: c.id,
      nombres: i === 0 ? 'Lucía' : 'Diego',
      apellidos: i === 0 ? 'Mendoza' : 'Salazar',
      email: i === 0 ? `lucia.${sufijo}@correo.com` : `diego.${sufijo}@correo.com`,
      ...(i === 0 && { tipoDocumento: 'DNI', numeroDocumento: `4${sufijo}1` }),
      esTitular: i === 0,
    })),
    trabajo: { fechaInicio: hoy, fechaLimite: sumarDias(hoy, 120) },
    contrato: {
      fechaFirma: hoy,
      montoTotal: 3000,
      formaPago: 'cuotas',
      cuotas: [
        { monto: 1500, vencimiento: hoy },
        { monto: 1500, vencimiento: sumarDias(hoy, 30) },
      ],
    },
    ...extra,
  });

  beforeAll(async () => {
    const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = modulo.createNestApplication<NestExpressApplication>();
    configurarApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    for (const q of Object.keys(ROL) as Quien[]) {
      const email = `e2e.w.${q}.${sufijo}@grupoes.local`;
      const rol = await prisma.rol.findUniqueOrThrow({ where: { codigo: ROL[q] } });
      const u = await prisma.usuario.create({
        data: { nombres: `E2E ${q}`, apellidos: 'Trabajos', email, passwordHash: await hashPassword(PASSWORD), roles: { create: { rolId: rol.id } } },
      });
      ids[q] = u.id;
      tokens[q] = (await http().post('/api/auth/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
    }
    catalogos = (await http().get('/api/catalogos/prospecto').set(como('ana')).expect(200)).body;
    const actividades = (await http().get('/api/actividades?aplicaA=prospecto').set(como('ana')).expect(200)).body;

    prospecto = (
      await http()
        .post('/api/prospectos')
        .set(como('ana'))
        .send({
          tipoTrabajoId: catalogos.tiposTrabajo.find((t) => t.nombre === 'Tesis')!.id,
          prioridadId: catalogos.prioridades[0].id,
          origenId: catalogos.origenes[0].id,
          titulo: 'Tesis de prueba',
          contactos: [
            { celular: celular(1), esPrincipal: true },
            { celular: celular(2), esPrincipal: false },
          ],
          primeraActividad: { actividadId: actividades.find((a: { nombre: string }) => a.nombre === 'Enfoque').id, fecha: sumarDias(hoy, 1), hora: '10:00', modalidad: 'virtual' },
        })
        .expect(201)
    ).body;

    // El auxiliar da el enfoque: luego se sugiere como auxiliar principal del trabajo.
    const tareaId = prospecto.tareas[0].id;
    const cand = (await http().get(`/api/tareas/${tareaId}/candidatos`).set(como('prod')).expect(200)).body;
    const quienDa = cand.participaciones.find((x: { obligatoria: boolean }) => x.obligatoria);
    await http().post(`/api/tareas/${tareaId}/asignar`).set(como('prod')).send({ responsables: [{ participacionId: quienDa.id, usuarioId: ids.aux }] }).expect(201);
    await http().post(`/api/tareas/${tareaId}/completar`).set(como('aux')).send({ resultado: 'Enfoque dado' }).expect(201);
  });

  afterAll(async () => {
    const usuarios = Object.values(ids);
    await prisma.trabajo.deleteMany({ where: { prospecto: { responsableId: { in: usuarios } } } });
    await prisma.prospecto.deleteMany({ where: { responsableId: { in: usuarios } } });
    await prisma.persona.deleteMany({ where: { celular: { startsWith: `+519${sufijo}` } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios } } });
    await app.close();
  });

  it('valida los datos de la conversión', async () => {
    const sinDatos = await http()
      .post(`/api/prospectos/${prospecto.id}/convertir`)
      .set(como('ana'))
      .send(conversion({ integrantes: [{ personaId: prospecto.contactos[0].id, nombres: '', apellidos: 'X', email: 'no', esTitular: false }] }))
      .expect(400);
    const campos = sinDatos.body.errores.map((e: { campo: string }) => e.campo);
    expect(campos).toEqual(expect.arrayContaining(['integrantes.0.nombres', 'integrantes.0.email']));

    const cuotasMal = await http()
      .post(`/api/prospectos/${prospecto.id}/convertir`)
      .set(como('ana'))
      .send(conversion({ contrato: { fechaFirma: hoy, montoTotal: 3000, formaPago: 'cuotas', cuotas: [{ monto: 1000, vencimiento: hoy }] } }))
      .expect(400);
    expect(cuotasMal.body.errores[0].mensaje).toContain('Las cuotas suman');

    // Producción no convierte (permiso).
    await http().post(`/api/prospectos/${prospecto.id}/convertir`).set(como('prod')).send(conversion()).expect(403);
  });

  it('convierte: crea el trabajo, el contrato, el primer pago y cierra el prospecto', async () => {
    const res = await http()
      .post(`/api/prospectos/${prospecto.id}/convertir`)
      .set(como('ana'))
      .send(conversion({ pagoInicial: { monto: 1000, fecha: hoy, metodo: 'yape', numeroOperacion: '123456' } }))
      .expect(201);
    trabajo = res.body;
    expect(trabajo.codigo).toMatch(/^T-\d{4}-\d{4}$/);
    expect(trabajo.estado).toBe('sin_asignar');
    expect(trabajo.dioElEnfoque).toMatchObject({ usuario: { id: ids.aux }, rol: 'AUXILIAR' });
    expect(trabajo.titulo).toBe('Tesis de prueba');
    expect(trabajo.integrantes.find((i) => i.esTitular)?.numeroDocumento).toBe(`4${sufijo}1`);
    expect(trabajo.contrato?.cuenta).toMatchObject({ total: 3000, pagado: 1000, saldo: 2000 });
    expect(trabajo.contrato?.cuotas?.map((c) => c.estado)).toEqual(['parcial', 'pendiente']);
    expect(trabajo.contrato?.pagos?.[0].numeroRecibo).toMatch(/^R-\d{4}-\d{4}$/);

    const p = (await http().get(`/api/prospectos/${prospecto.id}`).set(como('ana')).expect(200)).body as ProspectoDetalle;
    expect(p.etapa.clase).toBe('ganada');
    expect(p.tareas.every((t) => !['pendiente', 'por_asignar'].includes(t.estado))).toBe(true);

    await http().post(`/api/prospectos/${prospecto.id}/convertir`).set(como('ana')).send(conversion()).expect(409);
  });

  it('el equipo define quién ve el trabajo; el auxiliar no ve montos', async () => {
    expect((await http().get('/api/trabajos').set(como('aux')).expect(200)).body.total).toBe(0);
    await http().get(`/api/trabajos/${trabajo.id}`).set(como('aux')).expect(404);

    const cand = (await http().get('/api/trabajos/candidatos-equipo').set(como('prod')).expect(200)).body;
    expect(cand.auxiliares.map((u: { id: string }) => u.id)).toContain(ids.aux);
    expect(cand.jefes.map((u: { id: string }) => u.id)).toContain(ids.jefe);

    // Un jefe no puede ser auxiliar principal.
    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.jefe, jefeResponsableId: ids.jefe }).expect(400);

    const armado = (await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux, jefeResponsableId: ids.jefe }).expect(200))
      .body as TrabajoDetalle;
    expect(armado.estado).toBe('asignado');
    expect(armado.equipo).toHaveLength(2);

    const visto = (await http().get(`/api/trabajos/${trabajo.id}`).set(como('aux')).expect(200)).body as TrabajoDetalle;
    expect(visto.contrato).toBeNull();
    const deJefe = (await http().get('/api/trabajos').set(como('jefe')).expect(200)).body;
    expect(deJefe.datos[0].saldo).toBeNull();
  });

  it('cambiar el equipo deja el historial y quita el acceso a quien sale', async () => {
    const res = (
      await http()
        .put(`/api/trabajos/${trabajo.id}/equipo`)
        .set(como('prod'))
        .send({ auxiliarPrincipalId: ids.aux2, auxiliaresApoyo: [ids.aux], jefeResponsableId: ids.jefe, motivo: 'Luis está con descanso médico' })
        .expect(200)
    ).body as TrabajoDetalle;
    expect(res.equipo.find((e) => e.funcion === 'auxiliar_principal')?.usuario.id).toBe(ids.aux2);
    expect(res.historialEquipo.some((e) => e.usuario.id === ids.aux && e.funcion === 'auxiliar_principal')).toBe(true);
    expect(res.eventos[0].detalle).toContain('descanso médico');

    await http().put(`/api/trabajos/${trabajo.id}/equipo`).set(como('prod')).send({ auxiliarPrincipalId: ids.aux2, jefeResponsableId: ids.jefe }).expect(200);
    await http().get(`/api/trabajos/${trabajo.id}`).set(como('aux')).expect(404);
  });

  it('pagos: reparte entre cuotas, no supera el saldo y se pueden anular', async () => {
    const contratoId = trabajo.contrato!.id;
    await http().post(`/api/contratos/${contratoId}/pagos`).set(como('prod')).send({ monto: 100, fecha: hoy, metodo: 'efectivo' }).expect(403);

    const excedido = await http().post(`/api/contratos/${contratoId}/pagos`).set(como('ana')).send({ monto: 2500, fecha: hoy, metodo: 'efectivo' }).expect(400);
    expect(excedido.body.errores[0].campo).toBe('monto');
    await http().post(`/api/contratos/${contratoId}/pagos`).set(como('ana')).send({ monto: 10, fecha: sumarDias(hoy, 1), metodo: 'efectivo' }).expect(400);

    const pagado = (await http().post(`/api/contratos/${contratoId}/pagos`).set(como('ana')).send({ monto: 2000, fecha: hoy, metodo: 'transferencia' }).expect(201))
      .body as TrabajoDetalle;
    expect(pagado.contrato?.cuenta?.saldo).toBe(0);
    expect(pagado.contrato?.cuotas?.every((c) => c.estado === 'pagada')).toBe(true);
    const ultimo = pagado.contrato!.pagos![0];
    expect(ultimo.cuotas).toEqual([
      { numero: 1, monto: 500 },
      { numero: 2, monto: 1500 },
    ]);

    // Anular afecta la caja: por defecto solo el administrador.
    await http().post(`/api/pagos/${ultimo.id}/anular`).set(como('ana')).send({ motivo: 'Voucher duplicado' }).expect(403);
    const anulado = (await http().post(`/api/pagos/${ultimo.id}/anular`).set(como('admin')).send({ motivo: 'Voucher duplicado' }).expect(201)).body as TrabajoDetalle;
    expect(anulado.contrato?.cuenta?.saldo).toBe(2000);
    expect(anulado.contrato?.pagos?.[0].anulado?.motivo).toBe('Voucher duplicado');
    await http().post(`/api/pagos/${ultimo.id}/anular`).set(como('admin')).send({ motivo: 'Otra vez' }).expect(400);
  });

  it('la cobranza lista las cuotas con saldo', async () => {
    const res = await http().get('/api/contratos/cobranza').set(como('ana')).expect(200);
    const propias = res.body.cuotas.filter((c: { trabajo: { id: string } }) => c.trabajo.id === trabajo.id);
    expect(propias.map((c: { numero: number; saldo: number }) => `${c.numero}:${c.saldo}`)).toEqual(['1:500', '2:1500']);
    await http().get('/api/contratos/cobranza').set(como('aux')).expect(403);
  });
});
