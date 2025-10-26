# Use the official Node.js 20 LTS image as base
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files for both root and widget
COPY package*.json ./
COPY packages/chat-widget/package*.json ./packages/chat-widget/

# Install dependencies for main app
RUN npm ci --only=production && npm cache clean --force

# Install dependencies and build widget
WORKDIR /app/packages/chat-widget
RUN npm ci && npm run build && npm cache clean --force

# Go back to main app directory
WORKDIR /app

# Copy application source code
COPY src/ ./src/

# Copy widget source and built files
COPY packages/chat-widget/src/ ./packages/chat-widget/src/
COPY packages/chat-widget/dist/ ./packages/chat-widget/dist/
COPY packages/chat-widget/rollup.config.js ./packages/chat-widget/

# Create necessary directories and set permissions
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose the port the app runs on
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); \
    const options = { hostname: 'localhost', port: 3000, path: '/health', timeout: 2000 }; \
    const req = http.request(options, (res) => { \
      if (res.statusCode === 200) process.exit(0); \
      else process.exit(1); \
    }); \
    req.on('error', () => process.exit(1)); \
    req.end();" || exit 1

# Start the application
CMD ["node", "src/app.js"]
