# Despliegue en un VPS con Ubuntu

Guía para publicar el sistema en un servidor Ubuntu 22.04 o 24.04. La web y la API quedan detrás de Nginx, con HTTPS, y la base de datos (PostgreSQL) corre en Docker solo para el propio servidor.

Los archivos listos para copiar están en la carpeta [`deploy/`](../deploy):

| Archivo | Para qué sirve |
|---|---|
| `grupoes-api.service` | Servicio de systemd que mantiene la API encendida y la reinicia si falla |
| `nginx-grupoes.conf` | Sitio de Nginx: sirve la web, reenvía `/api` (con WebSocket) a la API |
| `actualizar.sh` | Actualiza el sistema (respaldo, código, construcción, migraciones, reinicio) |
| `respaldo.sh` | Respaldo de la base de datos |

## 0. Antes de empezar

- **Servidor:** 2 GB de RAM o más. Con 1 GB, crea memoria de intercambio (paso 1) o la construcción de la web puede fallar.
- **Dominio o subdominio** (por ejemplo `produccion.tudominio.com`) con un registro **A** que apunte a la IP del VPS. Es obligatorio: en producción la cookie de sesión solo viaja por HTTPS, así que sin dominio y certificado **no se podrá iniciar sesión**.
- **El código en un repositorio privado** (GitHub o GitLab). Hoy el proyecto no tiene repositorio remoto: créalo y súbelo desde tu PC con `git remote add origin <url>` y `git push -u origin main`.

## 1. Preparar el servidor

Entra por SSH y actualiza:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw nginx certbot python3-certbot-nginx
```

Crea un usuario para la aplicación (no uses `root`) y dale acceso a sudo:

```bash
sudo adduser grupoes
sudo usermod -aG sudo grupoes
```

Firewall: solo SSH y web.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Si el servidor tiene 1 GB de RAM, agrega 2 GB de intercambio:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Instalar Node 22, pnpm y Docker

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm (la versión que usa el proyecto)
sudo corepack enable
corepack prepare pnpm@10.15.1 --activate

# Docker (para PostgreSQL)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker grupoes
```

Cierra la sesión y vuelve a entrar como `grupoes` para que el grupo `docker` surta efecto.

## 3. Bajar el código

```bash
sudo mkdir -p /srv/grupoes && sudo chown grupoes:grupoes /srv/grupoes
cd /srv/grupoes
git clone <URL-de-tu-repositorio-privado> produccion
cd produccion
```

(Para clonar un repositorio privado por HTTPS, usa un *token de acceso personal* de GitHub como contraseña, o configura una *deploy key* por SSH.)

## 4. Configurar las variables

**Base de datos** — crea el archivo `.env` en la raíz del proyecto (lo lee Docker Compose):

```bash
cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
EOF
cat .env
```

Anota esa contraseña: la necesitas en el siguiente archivo.

**API** — crea `apps/api/.env` con tus valores reales:

```bash
cat > apps/api/.env <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://produccion:LA_CONTRASEÑA_DE_ARRIBA@127.0.0.1:5433/produccion?schema=public"
WEB_ORIGIN=https://produccion.tudominio.com
JWT_ACCESS_SECRET=PEGA_AQUI_UN_VALOR_LARGO
SEED_ADMIN_EMAIL=tu-correo@tudominio.com
SEED_ADMIN_PASSWORD=UNA_CLAVE_TEMPORAL_FUERTE
EOF
# Genera el secreto del JWT y pégalo en JWT_ACCESS_SECRET:
openssl rand -hex 48
chmod 600 apps/api/.env .env
```

Notas:
- `SEED_ADMIN_PASSWORD` es temporal: el sistema obliga a cambiarla en el primer ingreso.
- **No ejecutes** `pnpm db:demo` en producción: crea usuarios de demostración.
- Los archivos `.env` no se suben a git y no deben compartirse.

## 5. Levantar la base, construir y migrar

```bash
docker compose up -d db          # PostgreSQL; escucha solo en 127.0.0.1
pnpm install --frozen-lockfile   # instala y genera el cliente de la base
pnpm build                       # compila shared, API y web
pnpm db:deploy                   # crea las tablas (migraciones)
pnpm db:seed                     # roles, permisos, catálogos y el usuario administrador
```

`db:seed` se puede repetir sin problema: solo agrega lo que falta.

## 6. Dejar la API corriendo (systemd)

Copia el servicio (revisa que el usuario y la ruta coincidan) y actívalo:

```bash
sudo cp deploy/grupoes-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now grupoes-api
sudo systemctl status grupoes-api      # debe decir "active (running)"
curl http://127.0.0.1:3000/api/salud   # responde si la API y la base están bien
```

Para ver los registros: `journalctl -u grupoes-api -f`.

> Importante: ejecuta **una sola instancia** de la API. Los recordatorios y avisos automáticos corren dentro de ella; con dos instancias se enviarían duplicados.

## 7. Nginx y HTTPS

```bash
sudo cp deploy/nginx-grupoes.conf /etc/nginx/sites-available/grupoes
sudo nano /etc/nginx/sites-available/grupoes     # cambia produccion.tudominio.com por tu dominio
sudo ln -s /etc/nginx/sites-available/grupoes /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Certificado gratuito de Let's Encrypt (renovación automática)
sudo certbot --nginx -d produccion.tudominio.com
```

Nginx debe poder leer la carpeta de la web. Si da "403", da permiso de paso a las carpetas: `chmod o+x /srv /srv/grupoes /srv/grupoes/produccion`.

Abre `https://produccion.tudominio.com` e ingresa con el correo y la clave temporal del paso 4.

## 8. Primer ingreso: qué configurar

1. Cambia la contraseña del administrador (te lo exige).
2. **Configuración → Parámetros**: revisa los valores (garantía, recargo de horas extra, límites de Turnitin, avisos).
3. **Configuración → Horarios y feriados**: carga los feriados del año.
4. **Configuración → Catálogos → Actividades**: ajusta tiempos, roles y prioridades.
5. **Usuarios**: crea al equipo y asígnales sus roles.

## 9. Respaldos (imprescindible)

La base de datos es lo más valioso. Prueba el respaldo a mano:

```bash
bash deploy/respaldo.sh      # guarda un .sql.gz en ~/respaldos y conserva los últimos 14
```

Prográmalo cada noche con cron (`crontab -e`, como el usuario `grupoes`):

```
0 2 * * * cd /srv/grupoes/produccion && bash deploy/respaldo.sh >> ~/respaldo.log 2>&1
```

**Guarda también una copia fuera del VPS** (si el servidor se pierde, los respaldos locales se pierden con él). Una opción gratuita es `rclone` hacia Google Drive; otra, descargar el archivo a tu PC cada semana con `scp`.

Para restaurar en una base vacía:

```bash
gunzip -c ~/respaldos/produccion-FECHA.sql.gz | docker compose exec -T db psql -U produccion produccion
```

## 10. Actualizar el sistema cuando haya cambios

Desde tu PC: `git push`. En el servidor:

```bash
cd /srv/grupoes/produccion
bash deploy/actualizar.sh
```

El script hace un respaldo, trae el código, instala, construye, migra la base, sincroniza permisos y reinicia la API. Si algo falla, se detiene antes de reiniciar.

> Si el script dice que `sudo systemctl` pide contraseña, ejecútalo desde una sesión con sudo o agrega una regla en `/etc/sudoers.d/` solo para ese comando.

## 11. Seguridad básica

- Inicia sesión por **clave SSH** y desactiva la contraseña (`PasswordAuthentication no` en `/etc/ssh/sshd_config`).
- Instala `fail2ban` (`sudo apt install fail2ban`) para frenar intentos de acceso por fuerza bruta.
- PostgreSQL **no está expuesto**: el puerto 5433 escucha solo en `127.0.0.1` y el firewall solo abre 22, 80 y 443. No lo cambies.
- Activa las actualizaciones de seguridad automáticas: `sudo apt install unattended-upgrades`.
- Usa contraseñas largas y distintas para el servidor, la base y el administrador.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Se inicia sesión pero se cierra al recargar | Se entra por `http://` o por IP: en producción la cookie exige HTTPS con el dominio |
| «Variables de entorno inválidas» al iniciar la API | Falta o es corta alguna variable de `apps/api/.env` (el secreto JWT necesita 32 caracteres o más) |
| Las notificaciones no llegan en vivo | Falta `Upgrade`/`Connection` en el bloque `/api/` de Nginx (ya está en el archivo de ejemplo) |
| 502 Bad Gateway | La API no está corriendo: `sudo systemctl status grupoes-api` y `journalctl -u grupoes-api` |
| La construcción de la web se queda sin memoria | Agrega intercambio (paso 1) |
| `permission denied` al usar Docker | Cierra sesión y vuelve a entrar tras agregar el usuario al grupo `docker` |
