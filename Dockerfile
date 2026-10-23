# One image for the web app. Build: docker build -t sanchalix .
# Run:   docker run -p 3000:3000 --env-file .env.production sanchalix
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV BUILD_STANDALONE=1 NEXT_TELEMETRY_DISABLED=1
# The build only needs these to exist; the real values are given when the container runs.
RUN APP_URL=http://localhost:3000 MONGODB_URI=mongodb://localhost:27017/build AUTH_SECRET=build-only-secret-build-only-secret-0123 npm run build
# Whole copies of the packages the server loads without bundling, laid over the build's partial ones below.
RUN node scripts/copyExternalPackages.mjs .external pdfkit

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.external/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/assets ./assets
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/welcome >/dev/null || exit 1
CMD ["node", "server.js"]
