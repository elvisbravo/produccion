ALTER TABLE "tarea" ADD CONSTRAINT "tarea_no_antes_de_minuto_chk" CHECK ("no_antes_de_minuto" IS NULL OR "no_antes_de_minuto" BETWEEN 0 AND 1439);
