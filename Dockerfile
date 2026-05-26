FROM node:22-alpine AS builder
WORKDIR /usr/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app

# Build args → env vars
ARG FIREBASE_PROJECT_ID
ARG NODE_ENV=production
ARG LOG_LEVEL=info
ARG PORT=8080
ARG HOST=0.0.0.0

ENV FIREBASE_PROJECT_ID=$FIREBASE_PROJECT_ID
ENV NODE_ENV=$NODE_ENV
ENV LOG_LEVEL=$LOG_LEVEL
ENV PORT=$PORT
ENV HOST=$HOST

# AUTH_SERVICE_ACCOUNT_EMAIL is injected at runtime via Cloud Run env var

COPY --from=builder /usr/app/dist/. ./
COPY --from=builder /usr/app/node_modules ./node_modules
COPY --from=builder /usr/app/src/public ./public
EXPOSE 8080
CMD ["node", "server.js"]
