-- Las tareas de un cliente registrado sin título decían «Trabajo de proveedor»: se dejan sin título (se ve el nombre de la actividad)
UPDATE "tarea" SET "titulo" = NULL
WHERE "titulo" = 'Trabajo de proveedor'
  AND "trabajo_id" IN (SELECT "id" FROM "trabajo" WHERE "prospecto_id" IS NOT NULL);
