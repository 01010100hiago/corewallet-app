FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN npm ci --omit=dev -w @corewallet/api -w @corewallet/shared

FROM node:26-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY shared shared
COPY api api
USER node
EXPOSE 4000
CMD ["node", "api/src/server.js"]
