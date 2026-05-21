# Use a lightweight Node.js Alpine base image
FROM node:24-alpine

# Set build-time environments
ENV NODE_ENV=production

# Set working directory inside the container
WORKDIR /app

# Copy package configuration files
COPY package*.json ./

# Install only production dependencies (excluding devDependencies like Jest)
RUN npm ci --only=production && npm cache clean --force

# Copy the rest of the application source code and public assets
COPY src/ ./src/
COPY public/ ./public/

# Ensure directory for persistent config and temporary TTS caches exists
RUN mkdir -p /app/config /app/public/temp/tts && \
    chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose standard bridge port
EXPOSE 8888

# Setup volume for persistent config files
VOLUME ["/app/config"]

# Run the bridge
CMD ["node", "src/app.js"]
