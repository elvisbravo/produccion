-- CreateEnum
CREATE TYPE "estado_entregable" AS ENUM ('pendiente', 'en_proceso', 'en_revision', 'observado', 'aprobado', 'entregado', 'observado_cliente', 'cerrado');

-- CreateEnum
CREATE TYPE "resultado_revision" AS ENUM ('aprobado', 'observado');

-- CreateEnum
CREATE TYPE "respuesta_cliente" AS ENUM ('pendiente', 'conforme', 'observado');

-- AlterEnum
ALTER TYPE "tipo_evento_trabajo" ADD VALUE 'entregable';

-- AlterTable
ALTER TABLE "tarea" ADD COLUMN     "entregable_id" UUID,
ADD COLUMN     "titulo" VARCHAR(150),
ADD COLUMN     "trabajo_id" UUID;

-- AlterTable
ALTER TABLE "tarea_responsable" ADD COLUMN     "orden_cola" INTEGER;

-- CreateTable
CREATE TABLE "plantilla_trabajo" (
    "id" UUID NOT NULL,
    "tipo_trabajo_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plantilla_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_entregable" (
    "id" UUID NOT NULL,
    "plantilla_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "orden" INTEGER NOT NULL,
    "es_final" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje_plazo" SMALLINT NOT NULL,

    CONSTRAINT "plantilla_entregable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_tarea" (
    "id" UUID NOT NULL,
    "plantilla_entregable_id" UUID NOT NULL,
    "actividad_id" UUID NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "minutos_estimados" INTEGER NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "plantilla_tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregable" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "orden" INTEGER NOT NULL,
    "es_final" BOOLEAN NOT NULL DEFAULT false,
    "fecha_limite" DATE NOT NULL,
    "estado" "estado_entregable" NOT NULL DEFAULT 'pendiente',
    "similitud" DECIMAL(5,2),
    "ia" DECIMAL(5,2),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entregable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision" (
    "id" UUID NOT NULL,
    "entregable_id" UUID NOT NULL,
    "tarea_id" UUID,
    "revisor_id" UUID NOT NULL,
    "resultado" "resultado_revision" NOT NULL,
    "observaciones" TEXT,
    "similitud" DECIMAL(5,2),
    "ia" DECIMAL(5,2),
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrega_cliente" (
    "id" UUID NOT NULL,
    "entregable_id" UUID NOT NULL,
    "enviado_por_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "canal" VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
    "notas" TEXT,
    "respuesta" "respuesta_cliente" NOT NULL DEFAULT 'pendiente',
    "observaciones_cliente" TEXT,
    "respondido_en" TIMESTAMPTZ(6),

    CONSTRAINT "entrega_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_trabajo_tipo_trabajo_id_key" ON "plantilla_trabajo"("tipo_trabajo_id");

-- CreateIndex
CREATE INDEX "plantilla_entregable_plantilla_id_orden_idx" ON "plantilla_entregable"("plantilla_id", "orden");

-- CreateIndex
CREATE INDEX "plantilla_tarea_plantilla_entregable_id_orden_idx" ON "plantilla_tarea"("plantilla_entregable_id", "orden");

-- CreateIndex
CREATE INDEX "entregable_trabajo_id_orden_idx" ON "entregable"("trabajo_id", "orden");

-- CreateIndex
CREATE INDEX "entregable_estado_idx" ON "entregable"("estado");

-- CreateIndex
CREATE INDEX "revision_entregable_id_fecha_idx" ON "revision"("entregable_id", "fecha");

-- CreateIndex
CREATE INDEX "entrega_cliente_entregable_id_fecha_idx" ON "entrega_cliente"("entregable_id", "fecha");

-- CreateIndex
CREATE INDEX "tarea_trabajo_id_estado_idx" ON "tarea"("trabajo_id", "estado");

-- CreateIndex
CREATE INDEX "tarea_entregable_id_idx" ON "tarea"("entregable_id");

-- CreateIndex
CREATE INDEX "tarea_responsable_usuario_id_orden_cola_idx" ON "tarea_responsable"("usuario_id", "orden_cola");

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_entregable_id_fkey" FOREIGN KEY ("entregable_id") REFERENCES "entregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_trabajo" ADD CONSTRAINT "plantilla_trabajo_tipo_trabajo_id_fkey" FOREIGN KEY ("tipo_trabajo_id") REFERENCES "tipo_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_entregable" ADD CONSTRAINT "plantilla_entregable_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla_trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_tarea" ADD CONSTRAINT "plantilla_tarea_plantilla_entregable_id_fkey" FOREIGN KEY ("plantilla_entregable_id") REFERENCES "plantilla_entregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_tarea" ADD CONSTRAINT "plantilla_tarea_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregable" ADD CONSTRAINT "entregable_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_entregable_id_fkey" FOREIGN KEY ("entregable_id") REFERENCES "entregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision" ADD CONSTRAINT "revision_revisor_id_fkey" FOREIGN KEY ("revisor_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega_cliente" ADD CONSTRAINT "entrega_cliente_entregable_id_fkey" FOREIGN KEY ("entregable_id") REFERENCES "entregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega_cliente" ADD CONSTRAINT "entrega_cliente_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones que Prisma no expresa.
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_un_solo_origen" CHECK (prospecto_id IS NULL OR trabajo_id IS NULL);
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_entregable_con_trabajo" CHECK (entregable_id IS NULL OR trabajo_id IS NOT NULL);
ALTER TABLE "plantilla_entregable" ADD CONSTRAINT "plantilla_entregable_porcentaje" CHECK (porcentaje_plazo BETWEEN 1 AND 100);
ALTER TABLE "plantilla_tarea" ADD CONSTRAINT "plantilla_tarea_minutos" CHECK (minutos_estimados > 0);
ALTER TABLE "entregable" ADD CONSTRAINT "entregable_porcentajes" CHECK (
  (similitud IS NULL OR similitud BETWEEN 0 AND 100) AND (ia IS NULL OR ia BETWEEN 0 AND 100)
);
ALTER TABLE "revision" ADD CONSTRAINT "revision_porcentajes" CHECK (
  (similitud IS NULL OR similitud BETWEEN 0 AND 100) AND (ia IS NULL OR ia BETWEEN 0 AND 100)
);
