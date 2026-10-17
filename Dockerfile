# La receta completa: dos etapas. Primero se construye la app; después se
# copia SOLO lo necesario para servirla — la imagen que corre en Cloud Run no
# lleva claves (van de la nube en tiempo de arranque) ni `data/` (se monta
# desde Cloud Storage en el despliegue).

# ── Etapa 1: construir ────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Dependencias primero, en su propia capa: cambiar código no re-instala nada.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Etapa 2: servir ───────────────────────────────────────────────────
FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# El standalone de Next ya trae su propio node_modules recortado y su
# server.js. Faltan tres piezas que no incluye:
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# data/ en producción es un volumen de Cloud Storage (el disco del contenedor
# desaparece en cada deploy y en cada arranque en frío). El mkdir es para que
# la imagen también corra sola, con `docker run -p 8080:8080`.
RUN mkdir -p data && chown -R node:node /app
USER node

EXPOSE 8080
CMD ["node", "server.js"]
