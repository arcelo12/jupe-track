FROM node:20-alpine

WORKDIR /app

# Copy package components
COPY package.json package-lock.json ./

# Install dependencies (use npm ci for reliable builds)
RUN npm ci

# Copy remaining source code
COPY . .

# Build the application
RUN npm run build

# Start the application on port 3040 in production mode
CMD ["npm", "start", "--", "-p", "3040"]
