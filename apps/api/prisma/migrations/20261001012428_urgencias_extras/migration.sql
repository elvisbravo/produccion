-- CreateEnum
CREATE TYPE "estado_solicitud_urgente" AS ENUM ('pendiente', 'ejecutada', 'rechazada');

-- CreateEnum
CREATE TYPE "modalidad_extra" AS ENUM ('horas_extra', 'bono');

-- CreateEnum
CREATE TYPE "estado_extra" AS ENUM ('propuesta', 'aceptada', 'rechazada', 'aprobada', 'realizada', 'anulada');

-- CreateTable
CREATE TABLE "solicitud_urgente" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado" "estado_solicitud_urgente" NOT NULL DEFAULT 'pendiente',
    "solicitada_por_id" UUID NOT NULL,
    "solicitada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_por_id" UUID,
    "resuelta_en" TIMESTAMPTZ(6),
    "usuario_asignado_id" UUID,
    "observacion" TEXT,

    CONSTRAINT "solicitud_urgente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hora_extra_bono" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "modalidad" "modalidad_extra" NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "entregable_id" UUID,
    "tarea_id" UUID,
    "fecha" DATE,
    "minuto_inicio" SMALLINT,
    "minuto_fin" SMALLINT,
    "monto" DECIMAL(10,2),
    "descripcion" TEXT NOT NULL,
    "estado" "estado_extra" NOT NULL DEFAULT 'propuesta',
    "propuesta_por_id" UUID NOT NULL,
    "propuesta_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondida_en" TIMESTAMPTZ(6),
    "motivo_rechazo" TEXT,
    "aprobada_por_id" UUID,
    "aprobada_en" TIMESTAMPTZ(6),
    "minutos_reales" INTEGER,
    "realizada_en" TIMESTAMPTZ(6),

    CONSTRAINT "hora_extra_bono_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitud_urgente_estado_idx" ON "solicitud_urgente"("estado");

-- CreateIndex
CREATE INDEX "solicitud_urgente_trabajo_id_idx" ON "solicitud_urgente"("trabajo_id");

-- CreateIndex
CREATE INDEX "hora_extra_bono_usuario_id_fecha_idx" ON "hora_extra_bono"("usuario_id", "fecha");

-- CreateIndex
CREATE INDEX "hora_extra_bono_estado_idx" ON "hora_extra_bono"("estado");

-- AddForeignKey
ALTER TABLE "solicitud_urgente" ADD CONSTRAINT "solicitud_urgente_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_urgente" ADD CONSTRAINT "solicitud_urgente_solicitada_por_id_fkey" FOREIGN KEY ("solicitada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_urgente" ADD CONSTRAINT "solicitud_urgente_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_urgente" ADD CONSTRAINT "solicitud_urgente_usuario_asignado_id_fkey" FOREIGN KEY ("usuario_asignado_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_propuesta_por_id_fkey" FOREIGN KEY ("propuesta_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_aprobada_por_id_fkey" FOREIGN KEY ("aprobada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_entregable_id_fkey" FOREIGN KEY ("entregable_id") REFERENCES "entregable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tarea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Horas extra: día y tramo válidos; bono: monto positivo.
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_modalidad" CHECK (
  (modalidad = 'horas_extra' AND fecha IS NOT NULL AND minuto_inicio IS NOT NULL AND minuto_fin IS NOT NULL
     AND minuto_inicio >= 0 AND minuto_fin <= 1440 AND minuto_inicio < minuto_fin AND monto IS NULL)
  OR (modalidad = 'bono' AND monto IS NOT NULL AND monto > 0 AND minuto_inicio IS NULL AND minuto_fin IS NULL)
);
ALTER TABLE "hora_extra_bono" ADD CONSTRAINT "hora_extra_bono_minutos_reales" CHECK (minutos_reales IS NULL OR minutos_reales > 0);
-- Una sola solicitud de urgencia pendiente por trabajo.
CREATE UNIQUE INDEX "solicitud_urgente_una_pendiente" ON "solicitud_urgente" (trabajo_id) WHERE estado = 'pendiente';
