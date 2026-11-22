FROM node:24.16.0-alpine AS build
WORKDIR /workspace
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24.16.0-alpine
ENV NODE_ENV=production PORT=4200
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /workspace/dist ./dist
COPY server/auth.mjs server/index.mjs ./server/
USER node
EXPOSE 4200
CMD ["node", "server/index.mjs"]
