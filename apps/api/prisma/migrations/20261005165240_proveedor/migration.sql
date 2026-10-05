-- CreateTable
CREATE TABLE "proveedor" (
    "id" UUID NOT NULL,
    "nombres" VARCHAR(100) NOT NULL,
    "apellidos" VARCHAR(100) NOT NULL,
    "celular" VARCHAR(20),
    "email" VARCHAR(150),
    "notas" VARCHAR(500),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,
    "actualizado_por" UUID,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- Un proveedor no se repite (sin distinguir mayúsculas ni tildes) entre los no eliminados.
CREATE UNIQUE INDEX "proveedor_nombre_unico" ON "proveedor" (f_unaccent(lower("nombres")), f_unaccent(lower("apellidos"))) WHERE "eliminado_en" IS NULL;
