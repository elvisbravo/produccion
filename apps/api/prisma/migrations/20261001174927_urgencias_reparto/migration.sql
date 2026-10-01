-- CreateTable
CREATE TABLE "solicitud_urgente_asignacion" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "entregable_id" UUID,
    "tareas" INTEGER NOT NULL,
    "minutos" INTEGER NOT NULL,

    CONSTRAINT "solicitud_urgente_asignacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "solicitud_urgente_asignacion_solicitud_id_idx" ON "solicitud_urgente_asignacion"("solicitud_id");

-- AddForeignKey
ALTER TABLE "solicitud_urgente_asignacion" ADD CONSTRAINT "solicitud_urgente_asignacion_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud_urgente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_urgente_asignacion" ADD CONSTRAINT "solicitud_urgente_asignacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_urgente_asignacion" ADD CONSTRAINT "solicitud_urgente_asignacion_entregable_id_fkey" FOREIGN KEY ("entregable_id") REFERENCES "entregable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
