-- AlterEnum
ALTER TYPE "estado_tarea" ADD VALUE 'en_pausa';

-- AlterEnum
ALTER TYPE "tipo_evento_trabajo" ADD VALUE 'pausa';

-- CreateTable
CREATE TABLE "pausa_trabajo" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "motivo" TEXT NOT NULL,
    "estado_anterior" "estado_trabajo" NOT NULL,
    "tareas_pausadas" JSONB NOT NULL,
    "creada_por_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reanudada_por_id" UUID,
    "reanudada_en" TIMESTAMPTZ(6),
    "nota_reanudacion" TEXT,
    "ultimo_recordatorio_en" TIMESTAMPTZ(6),

    CONSTRAINT "pausa_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pausa_trabajo_trabajo_id_idx" ON "pausa_trabajo"("trabajo_id");

-- AddForeignKey
ALTER TABLE "pausa_trabajo" ADD CONSTRAINT "pausa_trabajo_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pausa_trabajo" ADD CONSTRAINT "pausa_trabajo_creada_por_id_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pausa_trabajo" ADD CONSTRAINT "pausa_trabajo_reanudada_por_id_fkey" FOREIGN KEY ("reanudada_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que Prisma no expresa
-- Un trabajo tiene a lo más una pausa abierta.
CREATE UNIQUE INDEX "pausa_trabajo_abierta_key" ON "pausa_trabajo" ("trabajo_id") WHERE "reanudada_en" IS NULL;
ALTER TABLE "pausa_trabajo" ADD CONSTRAINT "pausa_trabajo_reanudada_chk" CHECK (("reanudada_en" IS NULL) = ("reanudada_por_id" IS NULL));
ALTER TABLE "pausa_trabajo" ADD CONSTRAINT "pausa_trabajo_motivo_chk" CHECK (length(btrim("motivo")) > 0);
