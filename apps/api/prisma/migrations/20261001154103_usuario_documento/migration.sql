-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "numero_documento" VARCHAR(20),
ADD COLUMN     "tipo_documento" "tipo_documento";

-- Tipo y número van juntos, o ninguno (los usuarios anteriores no tienen documento).
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_documento_chk" CHECK (("tipo_documento" IS NULL) = ("numero_documento" IS NULL));

-- Un documento identifica a un solo usuario (los eliminados no cuentan).
CREATE UNIQUE INDEX "usuario_documento_key" ON "usuario" ("tipo_documento", "numero_documento") WHERE "eliminado_en" IS NULL AND "numero_documento" IS NOT NULL;
