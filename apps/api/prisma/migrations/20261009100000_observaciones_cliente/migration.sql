-- CreateEnum
CREATE TYPE "estado_observacion" AS ENUM ('por_valorar', 'valorada', 'confirmada', 'programada', 'resuelta', 'cancelada');

-- CreateTable
CREATE TABLE "observacion_cliente" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "entregable_id" UUID NOT NULL,
    "ronda" INTEGER NOT NULL DEFAULT 1,
    "observaciones" TEXT NOT NULL,
    "estado" "estado_observacion" NOT NULL DEFAULT 'por_valorar',
    "creada_por_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tomada_por_id" UUID,
    "tomada_en" TIMESTAMPTZ(6),
    "valorada_por_id" UUID,
    "valorada_en" TIMESTAMPTZ(6),
    "minutos_estimados" INTEGER,
    "entrega_propuesta" TIMESTAMPTZ(6),
    "nota_valoracion" VARCHAR(500),
    "confirmada_por_id" UUID,
    "confirmada_en" TIMESTAMPTZ(6),
    "entrega_confirmada" TIMESTAMPTZ(6),
    "nota_confirmacion" VARCHAR(500),
    "programada_por_id" UUID,
    "programada_en" TIMESTAMPTZ(6),
    "tarea_id" UUID,
    "resuelta_en" TIMESTAMPTZ(6),

    CONSTRAINT "observacion_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_observacion" (
    "id" UUID NOT NULL,
    "observacion_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "texto" VARCHAR(500) NOT NULL,
    "resuelto" BOOLEAN NOT NULL DEFAULT false,
    "resuelto_en" TIMESTAMPTZ(6),

    CONSTRAINT "item_observacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "observacion_cliente_tarea_id_key" ON "observacion_cliente"("tarea_id");

-- CreateIndex
CREATE INDEX "observacion_cliente_estado_idx" ON "observacion_cliente"("estado");

-- CreateIndex
CREATE INDEX "observacion_cliente_entregable_id_ronda_idx" ON "observacion_cliente"("entregable_id", "ronda");

-- CreateIndex
CREATE INDEX "item_observacion_observacion_id_orden_idx" ON "item_observacion"("observacion_id", "orden");

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_entregable_id_fkey" FOREIGN KEY ("entregable_id") REFERENCES "entregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_tomada_por_id_fkey" FOREIGN KEY ("tomada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_valorada_por_id_fkey" FOREIGN KEY ("valorada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_confirmada_por_id_fkey" FOREIGN KEY ("confirmada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_programada_por_id_fkey" FOREIGN KEY ("programada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacion_cliente" ADD CONSTRAINT "observacion_cliente_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_observacion" ADD CONSTRAINT "item_observacion_observacion_id_fkey" FOREIGN KEY ("observacion_id") REFERENCES "observacion_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
