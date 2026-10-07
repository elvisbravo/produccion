-- Horas extra que se acumulan en la bolsa de la persona
ALTER TABLE "hora_extra_bono" ADD COLUMN "acumula" BOOLEAN NOT NULL DEFAULT false;
