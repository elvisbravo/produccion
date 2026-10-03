#!/usr/bin/env bash
# Respaldo de la base: bash deploy/respaldo.sh   (se programa con cron, ver docs/despliegue.md)
# Guarda un .sql.gz en ~/respaldos y conserva los últimos 14.
set -euo pipefail
DESTINO="${RESPALDOS_DIR:-$HOME/respaldos}"
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/produccion-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f "$(dirname "$0")/../docker-compose.yml" exec -T db pg_dump -U "${POSTGRES_USER:-produccion}" "${POSTGRES_DB:-produccion}" | gzip > "$ARCHIVO"
echo "Respaldo guardado en $ARCHIVO"
ls -1t "$DESTINO"/produccion-*.sql.gz | tail -n +15 | xargs -r rm --
