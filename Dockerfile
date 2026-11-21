# Production image: build the React frontend, then serve it with the Express API.
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=3000
COPY backend/package*.json ./
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./client-dist
RUN mkdir -p uploads/site uploads/diagrams
EXPOSE 3000
CMD ["node", "server.js"]
