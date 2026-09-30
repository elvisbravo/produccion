-- CreateEnum
CREATE TYPE "comportamiento_actividad" AS ENUM ('reunion', 'contacto', 'produccion', 'correccion', 'revision', 'administrativa', 'entrega');

-- CreateEnum
CREATE TYPE "aplica_a" AS ENUM ('prospecto', 'cliente', 'ambos');

-- CreateEnum
CREATE TYPE "modo_asignacion" AS ENUM ('creador', 'directa', 'coordinada', 'responsable_trabajo');

-- CreateEnum
CREATE TYPE "momento_evento" AS ENUM ('al_programar', 'al_completar');

-- CreateEnum
CREATE TYPE "estado_tarea" AS ENUM ('por_asignar', 'pendiente', 'en_proceso', 'completada', 'cancelada', 'no_asistio');

-- CreateEnum
CREATE TYPE "modalidad" AS ENUM ('presencial', 'virtual');

-- AlterTable
ALTER TABLE "etapa_prospecto" ADD COLUMN     "actividad_evento_id" UUID,
ADD COLUMN     "momento_evento" "momento_evento";

-- CreateTable
CREATE TABLE "resultado_contacto" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "cuenta_sin_respuesta" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "resultado_contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_actividad" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "comportamiento" "comportamiento_actividad" NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo_actividad_id" UUID NOT NULL,
    "minutos_estimados" INTEGER NOT NULL,
    "aplica_a" "aplica_a" NOT NULL,
    "requiere_hora_fija" BOOLEAN NOT NULL DEFAULT false,
    "modo_asignacion" "modo_asignacion" NOT NULL,
    "rol_coordinador_id" UUID,
    "es_seguimiento" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prioridad_rol" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "nivel" INTEGER NOT NULL,
    "color" VARCHAR(20) NOT NULL,

    CONSTRAINT "prioridad_rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad_participacion" (
    "id" UUID NOT NULL,
    "actividad_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "obligatoria" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "actividad_participacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actividad_participacion_rol" (
    "participacion_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "prioridad_rol_id" UUID NOT NULL,

    CONSTRAINT "actividad_participacion_rol_pkey" PRIMARY KEY ("participacion_id","rol_id")
);

-- CreateTable
CREATE TABLE "tarea" (
    "id" UUID NOT NULL,
    "actividad_id" UUID NOT NULL,
    "prospecto_id" UUID,
    "fecha" DATE NOT NULL,
    "inicio" TIMESTAMPTZ(6),
    "minutos_estimados" INTEGER NOT NULL,
    "modalidad" "modalidad",
    "estado" "estado_tarea" NOT NULL,
    "notas" TEXT,
    "resultado_contacto_id" UUID,
    "resultado" TEXT,
    "completada_en" TIMESTAMPTZ(6),
    "motivo_cancelacion" TEXT,
    "veces_reprogramada" INTEGER NOT NULL DEFAULT 0,
    "creada_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarea_responsable" (
    "id" UUID NOT NULL,
    "tarea_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "participacion_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "prioridad_rol_id" UUID,
    "asignado_por_id" UUID NOT NULL,
    "asignado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forzado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_forzado" TEXT,

    CONSTRAINT "tarea_responsable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarea_persona" (
    "tarea_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,

    CONSTRAINT "tarea_persona_pkey" PRIMARY KEY ("tarea_id","persona_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resultado_contacto_nombre_key" ON "resultado_contacto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_actividad_nombre_key" ON "tipo_actividad"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "actividad_nombre_key" ON "actividad"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "prioridad_rol_nombre_key" ON "prioridad_rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "prioridad_rol_nivel_key" ON "prioridad_rol"("nivel");

-- CreateIndex
CREATE UNIQUE INDEX "actividad_participacion_actividad_id_nombre_key" ON "actividad_participacion"("actividad_id", "nombre");

-- CreateIndex
CREATE INDEX "tarea_prospecto_id_estado_idx" ON "tarea"("prospecto_id", "estado");

-- CreateIndex
CREATE INDEX "tarea_estado_fecha_idx" ON "tarea"("estado", "fecha");

-- CreateIndex
CREATE INDEX "tarea_responsable_usuario_id_idx" ON "tarea_responsable"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "tarea_responsable_tarea_id_usuario_id_key" ON "tarea_responsable"("tarea_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "etapa_prospecto" ADD CONSTRAINT "etapa_prospecto_actividad_evento_id_fkey" FOREIGN KEY ("actividad_evento_id") REFERENCES "actividad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_tipo_actividad_id_fkey" FOREIGN KEY ("tipo_actividad_id") REFERENCES "tipo_actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_rol_coordinador_id_fkey" FOREIGN KEY ("rol_coordinador_id") REFERENCES "rol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad_participacion" ADD CONSTRAINT "actividad_participacion_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad_participacion_rol" ADD CONSTRAINT "actividad_participacion_rol_participacion_id_fkey" FOREIGN KEY ("participacion_id") REFERENCES "actividad_participacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad_participacion_rol" ADD CONSTRAINT "actividad_participacion_rol_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividad_participacion_rol" ADD CONSTRAINT "actividad_participacion_rol_prioridad_rol_id_fkey" FOREIGN KEY ("prioridad_rol_id") REFERENCES "prioridad_rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_prospecto_id_fkey" FOREIGN KEY ("prospecto_id") REFERENCES "prospecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_resultado_contacto_id_fkey" FOREIGN KEY ("resultado_contacto_id") REFERENCES "resultado_contacto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_participacion_id_fkey" FOREIGN KEY ("participacion_id") REFERENCES "actividad_participacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_prioridad_rol_id_fkey" FOREIGN KEY ("prioridad_rol_id") REFERENCES "prioridad_rol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_responsable" ADD CONSTRAINT "tarea_responsable_asignado_por_id_fkey" FOREIGN KEY ("asignado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_persona" ADD CONSTRAINT "tarea_persona_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_persona" ADD CONSTRAINT "tarea_persona_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones que Prisma no expresa en el esquema
ALTER TABLE "actividad" ADD CONSTRAINT "actividad_minutos_chk" CHECK ("minutos_estimados" > 0);
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_minutos_chk" CHECK ("minutos_estimados" > 0);
ALTER TABLE "actividad_participacion" ADD CONSTRAINT "participacion_cantidad_chk" CHECK ("cantidad" >= 1);
ALTER TABLE "etapa_prospecto" ADD CONSTRAINT "etapa_evento_completo_chk"
  CHECK (("actividad_evento_id" IS NULL) = ("momento_evento" IS NULL));
