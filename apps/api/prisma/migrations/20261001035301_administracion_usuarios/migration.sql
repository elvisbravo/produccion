-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "debe_cambiar_clave" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tope_horas_extra_usuario" (
    "usuario_id" UUID NOT NULL,
    "semanal" DECIMAL(5,1),
    "mensual" DECIMAL(5,1),
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tope_horas_extra_usuario_pkey" PRIMARY KEY ("usuario_id")
);

-- AddForeignKey
ALTER TABLE "tope_horas_extra_usuario" ADD CONSTRAINT "tope_horas_extra_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
