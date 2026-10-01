-- CreateTable
CREATE TABLE "costo_hora_usuario" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "costo" DECIMAL(10,2) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "creado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costo_hora_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "costo_hora_usuario_usuario_id_vigente_desde_key" ON "costo_hora_usuario"("usuario_id", "vigente_desde");

-- AddForeignKey
ALTER TABLE "costo_hora_usuario" ADD CONSTRAINT "costo_hora_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "costo_hora_usuario" ADD CONSTRAINT "costo_hora_positivo" CHECK (costo >= 0);
