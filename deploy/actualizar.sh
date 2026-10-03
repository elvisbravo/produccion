#!/usr/bin/env bash
# Actualiza el sistema en el servidor: bash deploy/actualizar.sh
# Antes de migrar la base hace un respaldo, y si algo falla se detiene.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Respaldo previo de la base"
bash deploy/respaldo.sh

echo "→ Trayendo la última versión"
git pull --ff-only

echo "→ Instalando dependencias y construyendo"
pnpm install --frozen-lockfile
pnpm build

echo "→ Migrando la base y sincronizando permisos iniciales"
pnpm db:deploy
pnpm db:seed

echo "→ Reiniciando la API"
sudo systemctl restart grupoes-api
sleep 3
curl -fsS http://127.0.0.1:3000/api/salud && echo && echo "Listo."
