# Hosted MCP server (mcp.playquiznow.com) — see src/http-server.ts
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# --ignore-scripts: the package's `prepare` script runs tsc (a devDependency)
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 8300
USER node
CMD ["node", "dist/http-server.js"]
