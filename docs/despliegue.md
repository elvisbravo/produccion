# Despliegue en un VPS con Ubuntu (Docker + Apache)

Guía para publicar el sistema en un servidor Ubuntu que **ya tiene otras aplicaciones** y usa **Apache2**, bajo un **subdominio** propio (por ejemplo `produccion.tudominio.com`). No instala Node ni PostgreSQL en el servidor: la base de datos, la API y la web corren en contenedores de Docker. Sirve incluso en Ubuntu 18.04, cuyo sistema es demasiado antiguo para Node 22.

```
Internet ──► Apache (tu servidor: 80/443, HTTPS con certbot)
                └─► 127.0.0.1:8080 ──► web (Nginx: la web y el reenvío de /api)
                                          └─► api (Node 22) ──► db (PostgreSQL 16)
                         (los tres contenedores de Docker; solo el 8080 local es accesible)
```

Tus otras aplicaciones no se tocan: el sistema solo agrega un sitio virtual de Apache para el subdominio.

Los archivos están en la raíz y en [`deploy/`](../deploy):

| Archivo | Para qué sirve |
|---|---|
| `docker-compose.prod.yml` | Define los contenedores: `db`, `api`, `web` (y `caddy`, que aquí no se usa) |
| `deploy/Dockerfile` | Construye la API y la web con Node 22 (dentro de Docker) |
| `deploy/nginx-web.conf` | Nginx de la web: archivos estáticos y reenvío de `/api` (con WebSocket) |
| `deploy/apache-grupoes.conf` | Sitio virtual de Apache para tu subdominio |
| `deploy/env.produccion.example` | Plantilla del archivo `.env` con tus datos |
| `deploy/actualizar.sh` | Actualiza el sistema (respaldo, código, construcción, migraciones, reinicio) |
| `deploy/respaldo.sh` | Respaldo de la base de datos |
| `deploy/limpiar-datos.sh` | Borra prospectos, clientes, trabajos y proveedores para empezar de cero (conserva usuarios y actividades; hace un respaldo y pide confirmación) |

## 0. Antes de empezar

- **Un registro DNS** del subdominio (tipo **A**) que apunte a la IP del VPS. Se crea en el panel donde administras el dominio. Es obligatorio: en producción la cookie de sesión solo viaja por HTTPS, así que sin subdominio y certificado **no se podrá iniciar sesión**.
- **El código en un repositorio privado** (GitHub o GitLab). Hoy el proyecto no tiene repositorio remoto: créalo y súbelo desde tu PC con `git remote add origin <url>` y `git push -u origin main`.
- **Memoria:** 2 GB de RAM o más. Con menos, crea memoria de intercambio (paso 1): construir la web usa bastante memoria. Además, la API, la base y la web consumen unos 400–600 MB en uso; ten en cuenta lo que ya usan tus otras aplicaciones.

> **Sobre Ubuntu 18.04:** terminó su soporte en 2023, así que ya no recibe actualizaciones de seguridad. Con Docker puedes publicar hoy, pero a mediano plazo conviene pasar a Ubuntu 22.04 o 24.04 (idealmente creando un servidor nuevo y moviendo el respaldo).

## 1. Revisar el servidor

Entra por SSH y comprueba qué tienes:

```bash
docker --version
docker compose version        # si da error, prueba:  docker-compose --version
git --version
apache2 -v
```

- Si **`docker compose version` funciona**, todo lo de esta guía va tal cual.
- Si solo funciona **`docker-compose`** (con guion), reemplaza `docker compose` por `docker-compose` en los comandos. Los scripts de `deploy/` ya detectan cuál tienes. Si puedes, instala el complemento moderno: `sudo apt install docker-compose-plugin`.
- Si no tienes `git`: `sudo apt install -y git`.

Si el servidor tiene 1 GB de RAM, agrega 2 GB de intercambio:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

El firewall que ya tengas para Apache (80 y 443) sirve. **No abras el 8080**: es solo para Apache dentro del propio servidor (queda ligado a `127.0.0.1`).

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

- `DOMINIO`: tu **subdominio**, sin `https://`.
- `POSTGRES_PASSWORD`: genera una con `openssl rand -hex 24` (usa ese formato, sin símbolos raros).
- `JWT_ACCESS_SECRET`: genera uno con `openssl rand -hex 48`.
- `SEED_ADMIN_EMAIL` y `SEED_ADMIN_PASSWORD`: tu correo y una clave temporal fuerte. El sistema obliga a cambiarla en el primer ingreso.
- `WEB_PORT=8080`: déjalo como está. **No actives** `COMPOSE_PROFILES=https` (eso es Caddy, que usaría los puertos 80 y 443 que ya tiene Apache).

```bash
chmod 600 .env
```

El archivo `.env` no se sube a git y no debe compartirse. Si el puerto 8080 ya lo usa otra aplicación, cambia `WEB_PORT` (por ejemplo a `8081`) y usa ese mismo número en el paso 5.

## 4. Construir y arrancar

```bash
docker compose -f docker-compose.prod.yml build      # tarda varios minutos la primera vez
docker compose -f docker-compose.prod.yml up -d db   # la base
docker compose -f docker-compose.prod.yml run --rm api sh -c "pnpm exec prisma migrate deploy && pnpm exec prisma db seed"
docker compose -f docker-compose.prod.yml up -d      # la API y la web
```

El tercer comando crea las tablas y deja listos los roles, los permisos, los catálogos y el usuario administrador. Se puede repetir sin problema: solo agrega lo que falta.

Comprueba que todo responde (aún sin Apache):

```bash
docker compose -f docker-compose.prod.yml ps               # db, api y web en "running"
curl -s http://127.0.0.1:8080/api/salud                    # debe responder que la API y la base están bien
docker compose -f docker-compose.prod.yml logs -f api      # registros de la API (Ctrl+C para salir)
```

Para no repetir `-f docker-compose.prod.yml`, puedes definir: `echo 'export COMPOSE_FILE=docker-compose.prod.yml' >> ~/.bashrc` y volver a entrar.

> Ejecuta **una sola instancia** de la API. Los recordatorios y avisos automáticos corren dentro de ella; con dos se enviarían duplicados.
>
> **No ejecutes** el comando `db:demo` en producción: crea usuarios de demostración.

## 5. Publicar el subdominio con Apache

Activa los módulos que hacen falta (una sola vez; no afecta a tus otros sitios):

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel rewrite headers
```

Copia el sitio, cambia el subdominio y actívalo:

```bash
sudo cp deploy/apache-grupoes.conf /etc/apache2/sites-available/grupoes.conf
sudo nano /etc/apache2/sites-available/grupoes.conf      # cambia produccion.tudominio.com en la línea ServerName
sudo a2ensite grupoes
sudo apachectl configtest                                # debe decir "Syntax OK"
sudo systemctl reload apache2
```

Prueba `http://produccion.tudominio.com` (todavía sin HTTPS: debería mostrar la pantalla de ingreso). Luego, el certificado gratuito de Let's Encrypt:

```bash
sudo apt install -y certbot python3-certbot-apache      # si no lo tienes
sudo certbot --apache -d produccion.tudominio.com
```

Cuando pregunte, elige **redirigir** el tráfico HTTP a HTTPS. Certbot crea el sitio del puerto 443 y renueva el certificado solo.

Abre `https://produccion.tudominio.com` e ingresa con el correo y la clave temporal del paso 3.

## 6. Primer ingreso: qué configurar

1. Cambia la contraseña del administrador (te lo exige).
2. **Configuración → Parámetros**: revisa los valores (garantía, recargo de horas extra, límites de Turnitin, avisos).
3. **Configuración → Horarios y feriados**: carga los feriados del año.
4. **Configuración → Catálogos → Actividades**: ajusta tiempos, roles y prioridades.
5. **Usuarios**: crea al equipo y asígnales sus roles.

## 7. Respaldos (imprescindible)

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

## 8. Actualizar el sistema cuando haya cambios

Desde tu PC: `git push`. En el servidor:

```bash
cd /srv/grupoes/produccion
bash deploy/actualizar.sh
```

El script hace un respaldo, trae el código, construye las imágenes, migra la base, sincroniza los permisos y reinicia. Si algo falla, se detiene antes de reiniciar. Apache no hay que tocarlo.

## 9. Seguridad básica

- Inicia sesión por **clave SSH** y desactiva la contraseña (`PasswordAuthentication no` en `/etc/ssh/sshd_config`).
- Instala `fail2ban` (`sudo apt install fail2ban`) para frenar intentos de acceso por fuerza bruta.
- La base de datos y la API **no están expuestas**: solo la web escucha en `127.0.0.1:8080`, y únicamente Apache puede llegar a ella. No agregues `ports:` a `db` ni `api`.
- Usa contraseñas largas y distintas para el servidor, la base y el administrador.
- Mantén Docker y el sistema al día (`sudo apt update && sudo apt upgrade`).

## Si el servidor está libre (sin Apache ni Nginx)

Puedes dejar que el propio sistema publique el sitio con HTTPS automático: en `.env` quita `WEB_PORT` y descomenta `COMPOSE_PROFILES=https`; luego `docker compose -f docker-compose.prod.yml up -d`. Caddy usará los puertos 80 y 443 y pedirá el certificado solo. Si en cambio usas **Nginx** como entrada, apúntalo a `127.0.0.1:8080` con `proxy_pass` y las cabeceras `Upgrade`/`Connection "upgrade"` para WebSocket.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| Se inicia sesión pero se cierra al recargar | Se entra por `http://` o por IP: en producción la cookie exige HTTPS con el subdominio |
| `curl http://127.0.0.1:8080/api/salud` no responde | La API no arrancó: `docker compose -f docker-compose.prod.yml logs api` |
| 503 / 502 al abrir el subdominio | Falta activar los módulos de Apache (`a2enmod …`) o el contenedor `web` está caído (`docker compose … ps`) |
| Apache abre otra de tus aplicaciones en vez de esta | El `ServerName` no coincide con el subdominio, o falta el registro DNS |
| Las notificaciones no llegan en vivo | Falta `proxy_wstunnel` o la regla `RewriteRule … ws://` del sitio de Apache |
| «Falta DOMINIO / POSTGRES_PASSWORD / JWT_ACCESS_SECRET en .env» | El archivo `.env` está en otra carpeta o le falta esa variable |
| «Variables de entorno inválidas» en los registros de la API | Variable faltante o corta (el secreto JWT necesita 32 caracteres o más) |
| La construcción se queda sin memoria o muere con «Killed» | Agrega intercambio (paso 1) |
| `permission denied` al usar Docker | Agrega tu usuario al grupo: `sudo usermod -aG docker $USER` y vuelve a entrar |
