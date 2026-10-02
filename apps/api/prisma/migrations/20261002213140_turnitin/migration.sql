-- CreateEnum
CREATE TYPE "resultado_turnitin" AS ENUM ('conforme', 'excede', 'omitido');

-- AlterEnum
ALTER TYPE "estado_entregable" ADD VALUE 'en_turnitin';

-- AlterTable
ALTER TABLE "entregable" ADD COLUMN     "turnitin_conforme_en" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "turnitin_registro" (
    "id" UUID NOT NULL,
    "entregable_id" UUID NOT NULL,
    "enviado_por_id" UUID NOT NULL,
    "enviado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" "resultado_turnitin",
    "similitud" DECIMAL(5,2),
    "ia" DECIMAL(5,2),
    "observaciones" VARCHAR(500),
    "registrado_por_id" UUID,
    "registrado_en" TIMESTAMPTZ(6),

    CONSTRAINT "turnitin_registro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "turnitin_registro_entregable_id_enviado_en_idx" ON "turnitin_registro"("entregable_id", "enviado_en");

-- AddForeignKey
ALTER TABLE "turnitin_registro" ADD CONSTRAINT "turnitin_registro_entregable_id_fkey" FOREIGN KEY ("entregable_id") REFERENCES "entregable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnitin_registro" ADD CONSTRAINT "turnitin_registro_enviado_por_id_fkey" FOREIGN KEY ("enviado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnitin_registro" ADD CONSTRAINT "turnitin_registro_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
