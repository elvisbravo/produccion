-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "mensaje" TEXT,
    "enlace" VARCHAR(300),
    "clave" VARCHAR(150),
    "leida_en" TIMESTAMPTZ(6),
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacion_usuario_id_creada_en_idx" ON "notificacion"("usuario_id", "creada_en");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_usuario_id_clave_key" ON "notificacion"("usuario_id", "clave");

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
