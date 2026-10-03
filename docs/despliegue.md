# Despliegue en un VPS con Ubuntu (con Docker)

Guía para publicar el sistema en un servidor Ubuntu **sin instalar Node ni PostgreSQL en el servidor**: la base de datos, la API y la web corren en contenedores de Docker. Sirve incluso en Ubuntu 18.04, cuyo sistema es demasiado antiguo para Node 22.

```
Internet ──► Caddy (HTTPS automático, puertos 80/443)
                └─► web (Nginx: archivos de la web y reenvía /api) ──► api (Node 22) ──► db (PostgreSQL 16)
```

Los archivos están en la raíz y en [`deploy/`](../deploy):

| Archivo | Para qué sirve |
|---|---|
| `docker-compose.prod.yml` | Define los contenedores: `db`, `api`, `web` y `caddy` |
| `deploy/Dockerfile` | Construye la API y la web con Node 22 (dentro de Docker) |
| `deploy/nginx-web.conf` | Nginx de la web: archivos estáticos y reenvío de `/api` (con WebSocket) |
| `deploy/Caddyfile` | HTTPS automático para tu dominio |
| `deploy/env.produccion.example` | Plantilla del archivo `.env` con tus datos |
| `deploy/actualizar.sh` | Actualiza el sistema (respaldo, código, construcción, migraciones, reinicio) |
| `deploy/respaldo.sh` | Respaldo de la base de datos |

## 0. Antes de empezar

- **Dominio o subdominio** (por ejemplo `produccion.tudominio.com`) con un registro **A** que apunte a la IP del VPS. Es obligatorio: en producción la cookie de sesión solo viaja por HTTPS, así que sin dominio y certificado **no se podrá iniciar sesión**.
- **El código en un repositorio privado** (GitHub o GitLab). Hoy el proyecto no tiene repositorio remoto: créalo y súbelo desde tu PC con `git remote add origin <url>` y `git push -u origin main`.
- **Memoria:** 2 GB de RAM o más. Con menos, crea memoria de intercambio (paso 1): construir la web usa bastante memoria.
- **Puertos 80 y 443 libres.** Si el VPS ya tiene otro sitio en esos puertos (otro Nginx o Apache), mira la sección «Si ya tienes un Nginx en el servidor» al final.

> **Sobre Ubuntu 18.04:** terminó su soporte en 2023, así que ya no recibe actualizaciones de seguridad. Con Docker puedes publicar el sistema hoy, pero a mediano plazo conviene pasar a Ubuntu 22.04 o 24.04 (idealmente creando un servidor nuevo y moviendo el respaldo).

## 1. Preparar el servidor

Entra por SSH y comprueba qué tienes (anota lo que salga):

```bash
docker --version
docker compose version        # si da error, prueba:  docker-compose --version
git --version
```

- Si **`docker compose version` funciona**, todo lo de esta guía va tal cual.
- Si solo funciona **`docker-compose`** (con guion), reemplaza `docker compose` por `docker-compose` en los comandos. Los scripts de `deploy/` ya detectan cuál tienes. Aun así, en Ubuntu 18.04 conviene instalar el complemento moderno: `sudo apt install docker-compose-plugin` (si no existe, `docker-compose` v1 también sirve).
- Si no tienes `git`: `sudo apt install -y git`.

Firewall: solo SSH y web.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

(Ojo: Docker publica puertos saltándose `ufw`. Por eso en este proyecto la base de datos y la API **no** publican puertos: solo `caddy` abre el 80 y el 443.)

Si el servidor tiene 1 GB de RAM, agrega 2 GB de intercambio:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Bajar el código

```bash
sudo mkdir -p /srv/grupoes && sudo chown $USER:$USER /srv/grupoes
cd /srv/grupoes
git clone <URL-de-tu-repositorio-privado> produccion
cd produccion
```

(Para un repositorio privado por HTTPS, usa un *token de acceso personal* de GitHub como contraseña, o configura una *deploy key* por SSH.)

## 3. Configurar las variables

Copia la plantilla y complétala:

```bash
cp deploy/env.produccion.example .env
nano .env
```

- `DOMINIO`: tu dominio, **sin** `https://`.
- `POSTGRES_PASSWORD`: genera una con `openssl rand -hex 24` (usa ese formato, sin símbolos raros).
- `JWT_ACCESS_SECRET`: genera uno con `openssl rand -hex 48`.
- `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`: tu correo y una clave temporal fuerte. El sistema obliga a cambiarla en el primer ingreso.
- `COMPOSE_PROFILES=https`: activa el HTTPS automático con Caddy.

```bash
chmod 600 .env
```

El archivo `.env` no se sube a git y no debe compartirse.

## 4. Construir y arrancar

```bash
docker compose -f docker-compose.prod.yml build      # tarda varios minutos la primera vez
docker compose -f docker-compose.prod.yml up -d db   # la base
docker compose -f docker-compose.prod.yml run --rm api sh -c "pnpm exec prisma migrate deploy && pnpm exec prisma db seed"
docker compose -f docker-compose.prod.yml up -d      # todo lo demás
```

El tercer comando crea las tablas y deja listos los roles, los permisos, los catálogos y el usuario administrador. Se puede repetir sin problema: solo agrega lo que falta.

Para no repetir `-f docker-compose.prod.yml` en cada comando, puedes definir en el servidor: `echo 'export COMPOSE_FILE=docker-compose.prod.yml' >> ~/.bashrc` y volver a entrar.

Comprueba:

```bash
docker compose -f docker-compose.prod.yml ps                # api, web, db y caddy en "running"/"healthy"
docker compose -f docker-compose.prod.yml logs -f api       # registros de la API (Ctrl+C para salir)
```

Abre `https://produccion.tudominio.com` (Caddy obtiene el certificado solo; la primera vez puede tardar un minuto) e ingresa con el correo y la clave temporal del paso 3.

> Ejecuta **una sola instancia** de la API. Los recordatorios y avisos automáticos corren dentro de ella; con dos se enviarían duplicados.
>
> **No ejecutes** el comando `db:demo` en producción: crea usuarios de demostración.

## 5. Primer ingreso: qué configurar

1. Cambia la contraseña del administrador (te lo exige).
2. **Configuración → Parámetros**: revisa los valores (garantía, recargo de horas extra, límites de Turnitin, avisos).
3. **Configuración → Horarios y feriados**: carga los feriados del año.
4. **Configuración → Catálogos → Actividades**: ajusta tiempos, roles y prioridades.
5. **Usuarios**: crea al equipo y asígnales sus roles.

## 6. Respaldos (imprescindible)

La base de datos es lo más valioso. Prueba el respaldo a mano:

```bash
bash deploy/respaldo.sh      # guarda un .sql.gz en ~/respaldos y conserva los últimos 14
```

Prográmalo cada noche con cron (`crontab -e`):

```
0 2 * * * cd /srv/grupoes/produccion && bash deploy/respaldo.sh >> ~/respaldo.log 2>&1
```

**Guarda también una copia fuera del VPS** (si el servidor se pierde, los respaldos locales se pierden con él). Una opción gratuita es `rclone` hacia Google Drive; otra, descargar el archivo a tu PC cada semana con `scp`.

Para restaurar en una base vacía:

```bash
gunzip -c ~/respaldos/produccion-FECHA.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U produccion produccion
```

## 7. Actualizar el sistema cuando haya cambios

Desde tu PC: `git push`. En el servidor:

```bash
cd /srv/grupoes/produccion
bash deploy/actualizar.sh
```

El script hace un respaldo, trae el código, construye las imágenes, migra la base, sincroniza los permisos y reinicia. Si algo falla, se detiene antes de reiniciar.

## 8. Seguridad básica

- Inicia sesión por **clave SSH** y desactiva la contraseña (`PasswordAuthentication no` en `/etc/ssh/sshd_config`).
- Instala `fail2ban` (`sudo apt install fail2ban`) para frenar intentos de acceso por fuerza bruta.
- La base de datos y la API **no están expuestas**: solo `caddy` publica los puertos 80 y 443. No agregues `ports:` a esos contenedores.
- Usa contraseñas largas y distintas para el servidor, la base y el administrador.
- Mantén Docker y el sistema al día (`sudo apt update && sudo apt upgrade`).

## Si ya tienes un Nginx en el servidor

Si los puertos 80 y 443 ya los usa otro sitio, **no actives Caddy**: quita (o comenta) la línea `COMPOSE_PROFILES=https` de `.env` y define `WEB_PORT=8080`. La web quedará disponible solo en `127.0.0.1:8080`. Luego haz que tu Nginx la use:

```nginx
server {
    server_name produccion.tudominio.com;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

y obtén el certificado con `sudo certbot --nginx -d produccion.tudominio.com`. Tras cambiar `.env`, aplica con `docker compose -f docker-compose.prod.yml up -d`.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Se inicia sesión pero se cierra al recargar | Se entra por `http://` o por IP: en producción la cookie exige HTTPS con el dominio |
| Caddy no obtiene el certificado | El dominio no apunta a la IP del servidor, o los puertos 80/443 están cerrados u ocupados. Mira `docker compose -f docker-compose.prod.yml logs caddy` |
| «Falta DOMINIO / POSTGRES_PASSWORD / JWT_ACCESS_SECRET en .env» | El archivo `.env` está en otra carpeta o le falta esa variable |
| «Variables de entorno inválidas» en los registros de la API | Variable faltante o corta (el secreto JWT necesita 32 caracteres o más) |
| 502 Bad Gateway | La API no arrancó: `docker compose -f docker-compose.prod.yml logs api` |
| La construcción se queda sin memoria o muere con «Killed» | Agrega intercambio (paso 1) |
| `permission denied` al usar Docker | Agrega tu usuario al grupo: `sudo usermod -aG docker $USER` y vuelve a entrar |
| Las notificaciones no llegan en vivo | Revisa que ningún proxy intermedio bloquee WebSocket (el de esta guía ya lo permite) |
