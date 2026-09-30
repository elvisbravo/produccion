-- CreateEnum
CREATE TYPE "clase_etapa" AS ENUM ('abierta', 'ganada', 'perdida');

-- CreateEnum
CREATE TYPE "tipo_documento" AS ENUM ('DNI', 'CE', 'PASAPORTE');

-- CreateEnum
CREATE TYPE "temperatura" AS ENUM ('caliente', 'tibio', 'frio');

-- CreateEnum
CREATE TYPE "tipo_evento_prospecto" AS ENUM ('creado', 'editado', 'cambio_etapa', 'nota', 'contacto', 'reasignado');

-- CreateTable
CREATE TABLE "correlativo" (
    "serie" VARCHAR(10) NOT NULL,
    "anio" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "correlativo_pkey" PRIMARY KEY ("serie","anio")
);

-- CreateTable
CREATE TABLE "tipo_trabajo" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "max_integrantes" INTEGER NOT NULL DEFAULT 1,
    "dias_garantia" INTEGER NOT NULL DEFAULT 0,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipo_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prioridad_trabajo" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(40) NOT NULL,
    "nivel" INTEGER NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "permite_insercion_urgente" BOOLEAN NOT NULL DEFAULT false,
    "por_defecto" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "prioridad_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "universidad" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "siglas" VARCHAR(30),
    "max_similitud" DECIMAL(5,2),
    "max_ia" DECIMAL(5,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,

    CONSTRAINT "universidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carrera" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,

    CONSTRAINT "carrera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nivel_academico" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "nivel_academico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "origen_contacto" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "es_referido" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "origen_contacto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapa_prospecto" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "orden" INTEGER NOT NULL,
    "color" VARCHAR(20) NOT NULL,
    "clase" "clase_etapa" NOT NULL DEFAULT 'abierta',
    "inicial" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "etapa_prospecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivo_perdida" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motivo_perdida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona" (
    "id" UUID NOT NULL,
    "celular" VARCHAR(20) NOT NULL,
    "nombres" VARCHAR(100),
    "apellidos" VARCHAR(100),
    "email" VARCHAR(150),
    "tipo_documento" "tipo_documento",
    "numero_documento" VARCHAR(20),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,
    "actualizado_por" UUID,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospecto" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(20) NOT NULL,
    "tipo_trabajo_id" UUID NOT NULL,
    "titulo" VARCHAR(300),
    "prioridad_id" UUID NOT NULL,
    "universidad_id" UUID,
    "carrera_id" UUID,
    "nivel_academico_id" UUID,
    "fecha_entrega_tentativa" DATE,
    "origen_id" UUID NOT NULL,
    "referido_por_id" UUID,
    "link_drive" VARCHAR(500),
    "observaciones" TEXT,
    "detalles" TEXT,
    "etapa_id" UUID NOT NULL,
    "temperatura" "temperatura",
    "monto_cotizado" DECIMAL(12,2),
    "fecha_cotizacion" DATE,
    "motivo_perdida_id" UUID,
    "intentos_sin_respuesta" INTEGER NOT NULL DEFAULT 0,
    "captado_por_id" UUID NOT NULL,
    "responsable_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,
    "actualizado_por" UUID,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "prospecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospecto_contacto" (
    "prospecto_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "prospecto_contacto_pkey" PRIMARY KEY ("prospecto_id","persona_id")
);

-- CreateTable
CREATE TABLE "prospecto_evento" (
    "id" UUID NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "tipo" "tipo_evento_prospecto" NOT NULL,
    "detalle" TEXT NOT NULL,
    "datos" JSONB,
    "usuario_id" UUID,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospecto_evento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipo_trabajo_nombre_key" ON "tipo_trabajo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "prioridad_trabajo_nombre_key" ON "prioridad_trabajo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "universidad_nombre_key" ON "universidad"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "carrera_nombre_key" ON "carrera"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "nivel_academico_nombre_key" ON "nivel_academico"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "origen_contacto_nombre_key" ON "origen_contacto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "etapa_prospecto_nombre_key" ON "etapa_prospecto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "motivo_perdida_nombre_key" ON "motivo_perdida"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "persona_celular_key" ON "persona"("celular");

-- CreateIndex
CREATE UNIQUE INDEX "persona_tipo_documento_numero_documento_key" ON "persona"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "prospecto_codigo_key" ON "prospecto"("codigo");

-- CreateIndex
CREATE INDEX "prospecto_responsable_id_etapa_id_idx" ON "prospecto"("responsable_id", "etapa_id");

-- CreateIndex
CREATE INDEX "prospecto_etapa_id_idx" ON "prospecto"("etapa_id");

-- CreateIndex
CREATE INDEX "prospecto_creado_en_idx" ON "prospecto"("creado_en");

-- CreateIndex
CREATE INDEX "prospecto_contacto_persona_id_idx" ON "prospecto_contacto"("persona_id");

-- CreateIndex
CREATE INDEX "prospecto_evento_prospecto_id_fecha_idx" ON "prospecto_evento"("prospecto_id", "fecha");

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_tipo_trabajo_id_fkey" FOREIGN KEY ("tipo_trabajo_id") REFERENCES "tipo_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_prioridad_id_fkey" FOREIGN KEY ("prioridad_id") REFERENCES "prioridad_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_universidad_id_fkey" FOREIGN KEY ("universidad_id") REFERENCES "universidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_carrera_id_fkey" FOREIGN KEY ("carrera_id") REFERENCES "carrera"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_nivel_academico_id_fkey" FOREIGN KEY ("nivel_academico_id") REFERENCES "nivel_academico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_origen_id_fkey" FOREIGN KEY ("origen_id") REFERENCES "origen_contacto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_referido_por_id_fkey" FOREIGN KEY ("referido_por_id") REFERENCES "persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapa_prospecto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_motivo_perdida_id_fkey" FOREIGN KEY ("motivo_perdida_id") REFERENCES "motivo_perdida"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_captado_por_id_fkey" FOREIGN KEY ("captado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto_contacto" ADD CONSTRAINT "prospecto_contacto_prospecto_id_fkey" FOREIGN KEY ("prospecto_id") REFERENCES "prospecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto_contacto" ADD CONSTRAINT "prospecto_contacto_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto_evento" ADD CONSTRAINT "prospecto_evento_prospecto_id_fkey" FOREIGN KEY ("prospecto_id") REFERENCES "prospecto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto_evento" ADD CONSTRAINT "prospecto_evento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Restricciones que Prisma no expresa en el esquema
ALTER TABLE "persona" ADD CONSTRAINT "persona_documento_completo_chk"
  CHECK (("tipo_documento" IS NULL) = ("numero_documento" IS NULL));
ALTER TABLE "correlativo" ADD CONSTRAINT "correlativo_ultimo_chk" CHECK ("ultimo" >= 0);
