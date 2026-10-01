-- Reglas que Prisma no expresa
ALTER TABLE "solicitud_urgente_asignacion" ADD CONSTRAINT "solicitud_urgente_asignacion_chk" CHECK ("tareas" > 0 AND "minutos" >= 0);

-- Las urgencias ya ejecutadas tenían un solo auxiliar: queda como su asignación única (sin detalle de entregables).
INSERT INTO "solicitud_urgente_asignacion" ("id", "solicitud_id", "usuario_id", "entregable_id", "tareas", "minutos")
SELECT gen_random_uuid(), "id", "usuario_asignado_id", NULL, 1, 0 FROM "solicitud_urgente" WHERE "estado" = 'ejecutada' AND "usuario_asignado_id" IS NOT NULL;
