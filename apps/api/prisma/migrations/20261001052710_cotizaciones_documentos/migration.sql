-- CreateEnum
CREATE TYPE "estado_cotizacion" AS ENUM ('emitida', 'anulada');

-- CreateEnum
CREATE TYPE "tipo_plantilla_documento" AS ENUM ('cotizacion', 'contrato', 'recibo');

-- AlterEnum
ALTER TYPE "tipo_evento_prospecto" ADD VALUE 'cotizacion';

-- AlterTable
ALTER TABLE "etapa_prospecto" ADD COLUMN     "al_cotizar" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" UUID NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "validez_dias" INTEGER NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "forma_pago" VARCHAR(300),
    "observaciones" TEXT,
    "estado" "estado_cotizacion" NOT NULL DEFAULT 'emitida',
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_id" UUID,
    "motivo_anulacion" TEXT,

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizacion_item" (
    "id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "descripcion" VARCHAR(300) NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precio" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "cotizacion_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_documento" (
    "tipo" "tipo_plantilla_documento" NOT NULL,
    "contenido" TEXT NOT NULL,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,
    "actualizado_por" UUID,

    CONSTRAINT "plantilla_documento_pkey" PRIMARY KEY ("tipo")
);

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_numero_key" ON "cotizacion"("numero");

-- CreateIndex
CREATE INDEX "cotizacion_prospecto_id_idx" ON "cotizacion"("prospecto_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_item_cotizacion_id_orden_key" ON "cotizacion_item"("cotizacion_id", "orden");

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_prospecto_id_fkey" FOREIGN KEY ("prospecto_id") REFERENCES "prospecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reglas que Prisma no expresa
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_validez_chk" CHECK ("validez_dias" BETWEEN 1 AND 365);
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_total_chk" CHECK ("total" > 0);
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_anulada_chk" CHECK (("estado" = 'anulada') = ("anulado_en" IS NOT NULL));
ALTER TABLE "cotizacion_item" ADD CONSTRAINT "cotizacion_item_montos_chk" CHECK ("cantidad" > 0 AND "precio" >= 0 AND "subtotal" >= 0);

-- Una sola etapa recibe a los prospectos cotizados.
CREATE UNIQUE INDEX "etapa_prospecto_al_cotizar_key" ON "etapa_prospecto" ("al_cotizar") WHERE "al_cotizar";
UPDATE "etapa_prospecto" SET "al_cotizar" = true WHERE "nombre" = 'Cotizado' AND "clase" = 'abierta';
