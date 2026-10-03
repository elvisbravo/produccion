#!/usr/bin/env bash
# Respaldo de la base: bash deploy/respaldo.sh   (se programa con cron, ver docs/despliegue.md)
# Guarda un .sql.gz en ~/respaldos y conserva los últimos 14.
set -euo pipefail
cd "$(dirname "$0")/.."
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi
DESTINO="${RESPALDOS_DIR:-$HOME/respaldos}"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/produccion-$(date +%Y%m%d-%H%M%S).sql.gz"
$COMPOSE -f docker-compose.prod.yml exec -T db pg_dump -U produccion produccion | gzip > "$ARCHIVO"
echo "Respaldo guardado en $ARCHIVO"
ls -1t "$DESTINO"/produccion-*.sql.gz | tail -n +15 | xargs -r rm --
