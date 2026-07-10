# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .
RUN npm run build

# Final Stage: Node.js only (standalone output)
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3040
COPY --from=frontend-builder --chown=node:node /app/.next/standalone ./
COPY --from=frontend-builder --chown=node:node /app/.next/static ./.next/static
COPY --from=frontend-builder --chown=node:node /app/public ./public
USER node
EXPOSE 3040
CMD ["node", "server.js"]
