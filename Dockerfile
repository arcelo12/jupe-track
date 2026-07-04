# Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ .
RUN npm run build

# Final Stage: Node.js only
FROM node:20-alpine
WORKDIR /app

# Copy Frontend Build
COPY --from=frontend-builder /app/package*.json ./frontend/
COPY --from=frontend-builder /app/.next ./frontend/.next
COPY --from=frontend-builder /app/public ./frontend/public
COPY --from=frontend-builder /app/node_modules ./frontend/node_modules

# Expose NextJS port
EXPOSE 3040

WORKDIR /app/frontend
CMD ["npm", "start", "--", "-p", "3040"]
