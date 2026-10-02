-- AlterTable
ALTER TABLE "trabajo" ADD COLUMN     "fechas_fijas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fechas_fijas_en" TIMESTAMPTZ(6),
ADD COLUMN     "fechas_fijas_motivo" TEXT,
ADD COLUMN     "fechas_fijas_por_id" UUID;

-- AddForeignKey
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_fechas_fijas_por_id_fkey" FOREIGN KEY ("fechas_fijas_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que Prisma no expresa
ALTER TABLE "trabajo" ADD CONSTRAINT "trabajo_fechas_fijas_chk" CHECK (NOT "fechas_fijas" OR ("fechas_fijas_motivo" IS NOT NULL AND "fechas_fijas_en" IS NOT NULL));
