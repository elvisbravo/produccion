-- CreateTable
CREATE TABLE "valoracion_trabajo" (
    "id" UUID NOT NULL,
    "trabajo_id" UUID NOT NULL,
    "fecha_reunion" DATE NOT NULL,
    "dias_estimados" INTEGER NOT NULL,
    "nota" VARCHAR(500),
    "registrada_por_id" UUID NOT NULL,
    "registrada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "valoracion_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "valoracion_trabajo_trabajo_id_registrada_en_idx" ON "valoracion_trabajo"("trabajo_id", "registrada_en");

-- AddForeignKey
ALTER TABLE "valoracion_trabajo" ADD CONSTRAINT "valoracion_trabajo_trabajo_id_fkey" FOREIGN KEY ("trabajo_id") REFERENCES "trabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valoracion_trabajo" ADD CONSTRAINT "valoracion_trabajo_registrada_por_id_fkey" FOREIGN KEY ("registrada_por_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE "valoracion_trabajo" ADD CONSTRAINT "valoracion_dias_rango" CHECK ("dias_estimados" BETWEEN 1 AND 365);
