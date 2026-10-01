-- CreateEnum
CREATE TYPE "estado_adicional" AS ENUM ('propuesto', 'aceptado', 'rechazado', 'anulado');

-- AlterEnum
ALTER TYPE "tipo_evento_trabajo" ADD VALUE 'adicional';

-- AlterTable
ALTER TABLE "cuota" ADD COLUMN     "adicional_id" UUID;

-- CreateTable
CREATE TABLE "adicional" (
    "id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "descripcion" VARCHAR(500) NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "cuotas_propuestas" JSONB NOT NULL,
    "estado" "estado_adicional" NOT NULL DEFAULT 'propuesto',
    "propuesto_por_id" UUID NOT NULL,
    "propuesto_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondido_por_id" UUID,
    "respondido_en" TIMESTAMPTZ(6),
    "motivo" TEXT,

    CONSTRAINT "adicional_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adicional_contrato_id_numero_key" ON "adicional"("contrato_id", "numero");

-- AddForeignKey
ALTER TABLE "cuota" ADD CONSTRAINT "cuota_adicional_id_fkey" FOREIGN KEY ("adicional_id") REFERENCES "adicional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_propuesto_por_id_fkey" FOREIGN KEY ("propuesto_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_respondido_por_id_fkey" FOREIGN KEY ("respondido_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que Prisma no expresa
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_monto_chk" CHECK ("monto" > 0);
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_respuesta_chk" CHECK (("estado" = 'propuesto') = ("respondido_en" IS NULL));
ALTER TABLE "adicional" ADD CONSTRAINT "adicional_motivo_chk" CHECK ("estado" NOT IN ('rechazado', 'anulado') OR "motivo" IS NOT NULL);
CREATE INDEX "cuota_adicional_id_idx" ON "cuota" ("adicional_id") WHERE "adicional_id" IS NOT NULL;
