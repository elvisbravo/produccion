-- CreateEnum
CREATE TYPE "alcance_feriado" AS ENUM ('nacional', 'empresa');

-- CreateEnum
CREATE TYPE "tipo_ausencia" AS ENUM ('vacaciones', 'permiso', 'descanso_medico', 'otro');

-- CreateEnum
CREATE TYPE "estado_ausencia" AS ENUM ('solicitada', 'aprobada', 'rechazada', 'anulada');

-- CreateTable
CREATE TABLE "plantilla_horario" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "por_defecto" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plantilla_horario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_horario_tramo" (
    "id" UUID NOT NULL,
    "plantilla_id" UUID NOT NULL,
    "dia_semana" SMALLINT NOT NULL,
    "minuto_inicio" SMALLINT NOT NULL,
    "minuto_fin" SMALLINT NOT NULL,

    CONSTRAINT "plantilla_horario_tramo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horario_usuario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "plantilla_id" UUID,
    "vigente_desde" DATE NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por_id" UUID,

    CONSTRAINT "horario_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horario_usuario_tramo" (
    "id" UUID NOT NULL,
    "horario_id" UUID NOT NULL,
    "dia_semana" SMALLINT NOT NULL,
    "minuto_inicio" SMALLINT NOT NULL,
    "minuto_fin" SMALLINT NOT NULL,

    CONSTRAINT "horario_usuario_tramo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriado" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "alcance" "alcance_feriado" NOT NULL DEFAULT 'nacional',
    "medio_dia" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ausencia" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_ausencia" NOT NULL,
    "fecha_desde" DATE NOT NULL,
    "fecha_hasta" DATE NOT NULL,
    "minuto_desde" SMALLINT,
    "minuto_hasta" SMALLINT,
    "motivo" TEXT,
    "estado" "estado_ausencia" NOT NULL DEFAULT 'solicitada',
    "solicitada_por_id" UUID NOT NULL,
    "solicitada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta_por_id" UUID,
    "resuelta_en" TIMESTAMPTZ(6),
    "observacion" TEXT,

    CONSTRAINT "ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_horario_nombre_key" ON "plantilla_horario"("nombre");

-- CreateIndex
CREATE INDEX "plantilla_horario_tramo_plantilla_id_idx" ON "plantilla_horario_tramo"("plantilla_id");

-- CreateIndex
CREATE UNIQUE INDEX "horario_usuario_usuario_id_vigente_desde_key" ON "horario_usuario"("usuario_id", "vigente_desde");

-- CreateIndex
CREATE INDEX "horario_usuario_tramo_horario_id_idx" ON "horario_usuario_tramo"("horario_id");

-- CreateIndex
CREATE UNIQUE INDEX "feriado_fecha_key" ON "feriado"("fecha");

-- CreateIndex
CREATE INDEX "ausencia_usuario_id_fecha_desde_idx" ON "ausencia"("usuario_id", "fecha_desde");

-- CreateIndex
CREATE INDEX "ausencia_estado_idx" ON "ausencia"("estado");

-- AddForeignKey
ALTER TABLE "plantilla_horario_tramo" ADD CONSTRAINT "plantilla_horario_tramo_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla_horario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_usuario" ADD CONSTRAINT "horario_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_usuario" ADD CONSTRAINT "horario_usuario_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla_horario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_usuario_tramo" ADD CONSTRAINT "horario_usuario_tramo_horario_id_fkey" FOREIGN KEY ("horario_id") REFERENCES "horario_usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausencia" ADD CONSTRAINT "ausencia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausencia" ADD CONSTRAINT "ausencia_solicitada_por_id_fkey" FOREIGN KEY ("solicitada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausencia" ADD CONSTRAINT "ausencia_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
