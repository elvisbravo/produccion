# Imagen de la API y de la web. Se construye con docker-compose.prod.yml (no hace falta Node en el servidor).
FROM node:22-bookworm-slim AS construccion
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
# Solo para generar el cliente de la base al instalar (no se conecta); en ejecución se usa el real.
ENV DATABASE_URL=postgresql://construccion:construccion@localhost:5432/construccion
RUN pnpm install --frozen-lockfile
RUN pnpm build

# API: conserva todas las dependencias porque de aquí también salen las migraciones y el seed.
FROM construccion AS api
ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/main"]

# Web: archivos estáticos con Nginx, que además reenvía /api a la API.
FROM nginx:1.27-alpine AS web
COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=construccion /app/apps/web/dist /usr/share/nginx/html
