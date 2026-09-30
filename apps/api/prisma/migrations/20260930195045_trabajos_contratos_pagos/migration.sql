-- CreateEnum
CREATE TYPE "estado_trabajo" AS ENUM ('sin_asignar', 'asignado', 'en_proceso', 'finalizado', 'suspendido', 'cancelado');

-- CreateEnum
CREATE TYPE "funcion_equipo" AS ENUM ('auxiliar_principal', 'auxiliar_apoyo', 'jefe_responsable');

-- CreateEnum
CREATE TYPE "tipo_evento_trabajo" AS ENUM ('creado', 'editado', 'equipo', 'contrato', 'pago', 'estado');

-- CreateEnum
CREATE TYPE "forma_pago" AS ENUM ('contado', 'cuotas');

-- CreateEnum
CREATE TYPE "estado_contrato" AS ENUM ('vigente', 'anulado');

-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('efectivo', 'transferencia', 'deposito', 'yape', 'plin', 'tarjeta', 'otro');

-- CreateTable
CREATE TABLE "trabajo" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "tipo_trabajo_id" UUID NOT NULL,
    "titulo" VARCHAR(300),
    "prioridad_id" UUID NOT NULL,
    "universidad_id" UUID,
    "carrera_id" UUID,
    "nivel_academico_id" UUID,
    "link_drive" VARCHAR(500),
    "observaciones" TEXT,
    "detalles" TEXT,
    "fecha_inicio" DATE NOT NULL,
    "fecha_limite" DATE NOT NULL,
    "estado" "estado_trabajo" NOT NULL DEFAULT 'sin_asignar',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,
    "actualizado_por" UUID,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajo_integrante" (
    "trabajo_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "es_titular" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trabajo_integrante_pkey" PRIMARY KEY ("trabajo_id","persona_id")
);

-- CreateTable
CREATE TABLE "trabajo_equipo" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "funcion" "funcion_equipo" NOT NULL,
    "desde" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hasta" TIMESTAMPTZ(6),
    "asignado_por_id" UUID NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "trabajo_equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trabajo_evento" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "tipo" "tipo_evento_trabajo" NOT NULL,
    "detalle" TEXT NOT NULL,
    "datos" JSONB,
    "usuario_id" UUID,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trabajo_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "fecha_firma" DATE NOT NULL,
    "monto_total" DECIMAL(12,2) NOT NULL,
    "moneda" CHAR(3) NOT NULL DEFAULT 'PEN',
    "forma_pago" "forma_pago" NOT NULL,
    "dias_garantia" INTEGER NOT NULL,
    "fin_garantia" DATE,
    "estado" "estado_contrato" NOT NULL DEFAULT 'vigente',
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,

    CONSTRAINT "contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuota" (
    "id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "vencimiento" DATE NOT NULL,

    CONSTRAINT "cuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" UUID NOT NULL,
    "numero_recibo" VARCHAR(20) NOT NULL,
    "contrato_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha" DATE NOT NULL,
    "metodo" "metodo_pago" NOT NULL,
    "numero_operacion" VARCHAR(60),
    "observaciones" TEXT,
    "registrado_por_id" UUID NOT NULL,
    "registrado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_id" UUID,
    "motivo_anulacion" TEXT,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_cuota" (
    "pago_id" UUID NOT NULL,
    "cuota_id" UUID NOT NULL,
    "monto_aplicado" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "pago_cuota_pkey" PRIMARY KEY ("pago_id","cuota_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trabajo_codigo_key" ON "trabajo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "trabajo_prospecto_id_key" ON "trabajo"("prospecto_id");

-- CreateIndex
CREATE INDEX "trabajo_estado_idx" ON "trabajo"("estado");

-- CreateIndex
CREATE INDEX "trabajo_fecha_limite_idx" ON "trabajo"("fecha_limite");

-- CreateIndex
CREATE INDEX "trabajo_integrante_persona_id_idx" ON "trabajo_integrante"("persona_id");

-- CreateIndex
CREATE INDEX "trabajo_equipo_trabajo_id_hasta_idx" ON "trabajo_equipo"("trabajo_id", "hasta");

-- CreateIndex
CREATE INDEX "trabajo_equipo_usuario_id_hasta_idx" ON "trabajo_equipo"("usuario_id", "hasta");

-- CreateIndex
CREATE INDEX "trabajo_evento_trabajo_id_fecha_idx" ON "trabajo_evento"("trabajo_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_trabajo_id_key" ON "contrato"("trabajo_id");

-- CreateIndex
CREATE INDEX "cuota_vencimiento_idx" ON "cuota"("vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "cuota_contrato_id_numero_key" ON "cuota"("contrato_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "pago_numero_recibo_key" ON "pago"("numero_recibo");

-- CreateIndex
CREATE INDEX "pago_contrato_id_idx" ON "pago"("contrato_id");

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_prospecto_id_fkey" FOREIGN KEY ("prospecto_id") REFERENCES "prospecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_tipo_trabajo_id_fkey" FOREIGN KEY ("tipo_trabajo_id") REFERENCES "tipo_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_prioridad_id_fkey" FOREIGN KEY ("prioridad_id") REFERENCES "prioridad_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_universidad_id_fkey" FOREIGN KEY ("universidad_id") REFERENCES "universidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "carrera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_nivel_academico_id_fkey" FOREIGN KEY ("nivel_academico_id") REFERENCES "nivel_academico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo_integrante" ADD CONSTRAINT "trabajo_integrante_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo_integrante" ADD CONSTRAINT "trabajo_integrante_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo_equipo" ADD CONSTRAINT "trabajo_equipo_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo_equipo" ADD CONSTRAINT "trabajo_equipo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo_equipo" ADD CONSTRAINT "trabajo_equipo_asignado_por_id_fkey" FOREIGN KEY ("asignado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo_evento" ADD CONSTRAINT "trabajo_evento_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trabajo_evento" ADD CONSTRAINT "trabajo_evento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuota" ADD CONSTRAINT "cuota_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cuota" ADD CONSTRAINT "pago_cuota_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_cuota" ADD CONSTRAINT "pago_cuota_cuota_id_fkey" FOREIGN KEY ("cuota_id") REFERENCES "cuota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones que Prisma no expresa en el esquema
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_fechas_chk" CHECK ("fecha_limite" >= "fecha_inicio");
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_monto_chk" CHECK ("monto_total" > 0);
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_garantia_chk" CHECK ("dias_garantia" >= 0);
ALTER TABLE "cuota" ADD CONSTRAINT "cuota_monto_chk" CHECK ("monto" > 0);
ALTER TABLE "pago" ADD CONSTRAINT "pago_monto_chk" CHECK ("monto" > 0);
ALTER TABLE "pago_cuota" ADD CONSTRAINT "pago_cuota_monto_chk" CHECK ("monto_aplicado" > 0);
-- Un solo auxiliar principal y un solo jefe responsable vigentes por trabajo.
CREATE UNIQUE INDEX "trabajo_equipo_funcion_unica_vigente"
  ON "trabajo_equipo" ("trabajo_id", "funcion")
  WHERE "hasta" IS NULL AND "funcion" IN ('auxiliar_principal', 'jefe_responsable');
