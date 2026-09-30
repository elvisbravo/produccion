-- Tramos de horario: día 1 (lunes) a 7 (domingo), minutos dentro del día y fin después del inicio.
ALTER TABLE "plantilla_horario_tramo" ADD CONSTRAINT "plantilla_horario_tramo_valido"
  CHECK (dia_semana BETWEEN 1 AND 7 AND minuto_inicio >= 0 AND minuto_fin <= 1440 AND minuto_inicio < minuto_fin);
ALTER TABLE "horario_usuario_tramo" ADD CONSTRAINT "horario_usuario_tramo_valido"
  CHECK (dia_semana BETWEEN 1 AND 7 AND minuto_inicio >= 0 AND minuto_fin <= 1440 AND minuto_inicio < minuto_fin);

-- Solo una plantilla por defecto.
CREATE UNIQUE INDEX "plantilla_horario_una_por_defecto" ON "plantilla_horario" (por_defecto) WHERE por_defecto;

-- Ausencias: rango válido; las horas van juntas y solo en un mismo día.
ALTER TABLE "ausencia" ADD CONSTRAINT "ausencia_rango_valido" CHECK (fecha_hasta >= fecha_desde);
ALTER TABLE "ausencia" ADD CONSTRAINT "ausencia_horas_validas" CHECK (
  (minuto_desde IS NULL AND minuto_hasta IS NULL)
  OR (fecha_desde = fecha_hasta AND minuto_desde >= 0 AND minuto_hasta <= 1440 AND minuto_desde < minuto_hasta)
);
