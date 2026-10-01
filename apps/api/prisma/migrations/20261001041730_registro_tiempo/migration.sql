-- CreateTable
CREATE TABLE "registro_tiempo" (
    "id" UUID NOT NULL,
    "tarea_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "fin" TIMESTAMPTZ(6),
    "minutos" INTEGER,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT,
    "auto_cerrado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_tiempo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_tiempo_tarea_id_idx" ON "registro_tiempo"("tarea_id");

-- CreateIndex
CREATE INDEX "registro_tiempo_usuario_id_inicio_idx" ON "registro_tiempo"("usuario_id", "inicio");

-- AddForeignKey
ALTER TABLE "registro_tiempo" ADD CONSTRAINT "registro_tiempo_tarea_id_fkey" FOREIGN KEY ("tarea_id") REFERENCES "tarea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_tiempo" ADD CONSTRAINT "registro_tiempo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Un solo cronómetro corriendo por persona.
CREATE UNIQUE INDEX "registro_tiempo_uno_abierto" ON "registro_tiempo" (usuario_id) WHERE fin IS NULL;
-- Un tramo cerrado termina después de empezar y tiene sus minutos; uno manual siempre está cerrado y explica por qué.
ALTER TABLE "registro_tiempo" ADD CONSTRAINT "registro_tiempo_coherente" CHECK (
  (fin IS NULL AND minutos IS NULL AND NOT manual) OR (fin IS NOT NULL AND fin > inicio AND minutos IS NOT NULL AND minutos >= 0)
);
ALTER TABLE "registro_tiempo" ADD CONSTRAINT "registro_tiempo_manual_con_motivo" CHECK (NOT manual OR motivo IS NOT NULL);
