-- CreateEnum
CREATE TYPE "tipo_canje" AS ENUM ('dias', 'dinero');

-- AlterEnum
ALTER TYPE "tipo_ausencia" ADD VALUE 'compensacion';

-- CreateTable
CREATE TABLE "canje_horas" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" "tipo_canje" NOT NULL,
    "minutos" INTEGER NOT NULL,
    "monto" DECIMAL(10,2),
    "fecha_desde" DATE,
    "fecha_hasta" DATE,
    "nota" TEXT,
    "ausencia_id" UUID,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(6),
    "anulado_por_id" UUID,

    CONSTRAINT "canje_horas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canje_horas_ausencia_id_key" ON "canje_horas"("ausencia_id");

-- CreateIndex
CREATE INDEX "canje_horas_usuario_id_idx" ON "canje_horas"("usuario_id");

-- AddForeignKey
ALTER TABLE "canje_horas" ADD CONSTRAINT "canje_horas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canje_horas" ADD CONSTRAINT "canje_horas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canje_horas" ADD CONSTRAINT "canje_horas_anulado_por_id_fkey" FOREIGN KEY ("anulado_por_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canje_horas" ADD CONSTRAINT "canje_horas_ausencia_id_fkey" FOREIGN KEY ("ausencia_id") REFERENCES "ausencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

