#!/usr/bin/env bash
# Actualiza el sistema en el servidor: bash deploy/actualizar.sh
# Hace un respaldo, trae el código, construye las imágenes, migra la base y reinicia. Si algo falla, se detiene.
set -euo pipefail
cd "$(dirname "$0")/.."
if docker compose version >/dev/null 2>&1; then COMPOSE="docker compose"; else COMPOSE="docker-compose"; fi
COMPOSE="$COMPOSE -f docker-compose.prod.yml"

echo "→ Respaldo previo de la base"
bash deploy/respaldo.sh

echo "→ Trayendo la última versión"
git pull --ff-only

echo "→ Construyendo (puede tardar unos minutos)"
$COMPOSE build

echo "→ Migrando la base y sincronizando permisos iniciales"
$COMPOSE up -d db
$COMPOSE run --rm api sh -c "pnpm exec prisma migrate deploy && pnpm exec prisma db seed"

echo "→ Reiniciando"
$COMPOSE up -d
sleep 8
$COMPOSE exec -T web wget -qO- http://api:3000/api/salud && echo && echo "Listo."
