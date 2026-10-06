#!/usr/bin/env bash
# Borra los datos de trabajo para empezar de cero: bash deploy/limpiar-datos.sh
# Borra: prospectos, clientes (personas), trabajos con sus entregables, tareas, reuniones, contratos y pagos,
#        proveedores, cotizaciones, horas extra y bonos, tiempos, notificaciones y comentarios. Reinicia la numeración.
# NO borra: usuarios (roles, permisos, horarios), catálogo de actividades, plantillas, etapas, universidades y demás catálogos, auditoría.
# Antes hace un respaldo y pide que escribas BORRAR para continuar. Todo ocurre en una transacción.
set -euo pipefail
cd "$(dirname "$0")/.."
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi
COMPOSE="$COMPOSE -f docker-compose.prod.yml"

echo "Esto BORRA los prospectos, clientes, trabajos, proveedores y todo lo que cuelga de ellos en la base de PRODUCCIÓN."
echo "Se conservan los usuarios y el catálogo de actividades."
read -r -p "Escribe BORRAR para continuar: " respuesta
[ "$respuesta" = "BORRAR" ] || { echo "Cancelado: no se borró nada."; exit 1; }

echo "→ Respaldo previo de la base"
bash deploy/respaldo.sh

echo "→ Borrando datos de trabajo"
$COMPOSE exec -T db psql -U produccion -d produccion -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
TRUNCATE TABLE prospecto, trabajo, persona, proveedor, tarea, cotizacion, notificacion, hora_extra_bono, solicitud_urgente, registro_tiempo, comentario, comentario_mencion CASCADE;
UPDATE correlativo SET ultimo = 0;
SELECT 'prospectos' AS tabla, count(*) FROM prospecto
UNION ALL SELECT 'trabajos', count(*) FROM trabajo
UNION ALL SELECT 'usuarios (se conservan)', count(*) FROM usuario
UNION ALL SELECT 'actividades (se conservan)', count(*) FROM actividad;
COMMIT;
SQL
echo "Listo. La numeración volvió a empezar (P-, T-, PR-, R-)."
