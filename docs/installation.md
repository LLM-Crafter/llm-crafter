# Installation

## System Requirements

- **Node.js**: Version 18.0.0 or higher
- **MongoDB**: Version 4.4 or higher
- **Memory**: Minimum 2GB RAM recommended
- **Storage**: At least 1GB free space

## Installation Methods

### Option 1: Development Setup

For development and testing purposes:

#### 1. Install Node.js

**macOS:**

```bash
# Using Homebrew
brew install node

# Or download from https://nodejs.org
```

**Ubuntu/Debian:**

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
Download and install from [nodejs.org](https://nodejs.org)

#### 2. Install MongoDB

**macOS:**

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Ubuntu/Debian:**

```bash
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
```

**Windows:**
Download and install from [MongoDB Download Center](https://www.mongodb.com/try/download/community)

#### 3. Clone and Setup

```bash
git clone https://github.com/your-username/llm-crafter.git
cd llm-crafter
npm install
```

#### 4. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
# Edit .env with your configuration
```

#### 5. Start Development Server

```bash
npm run dev
```

### Option 2: Docker Setup

For containerized deployment:

#### 1. Create docker-compose.yml

```yaml
version: '3.8'

services:
  llm-crafter:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongodb:27017/llm-crafter
      - JWT_SECRET=your-super-secret-jwt-key
    depends_on:
      - mongodb
    volumes:
      - ./logs:/app/logs

  mongodb:
    image: mongo:6.0
    restart: always
    ports:
      - '27017:27017'
    volumes:
      - mongodb_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=llm-crafter

volumes:
  mongodb_data:
```

#### 2. Create Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "start"]
```

#### 3. Run with Docker Compose

```bash
docker-compose up -d
```

### Option 3: Production Deployment

#### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'llm-crafter',
    script: 'src/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
EOF

# Start in production mode
pm2 start ecosystem.config.js --env production
```

#### Using Systemd (Linux)

```bash
# Create systemd service
sudo cat > /etc/systemd/system/llm-crafter.service << EOF
[Unit]
Description=LLM Crafter
After=network.target

[Service]
Type=simple
User=node
WorkingDirectory=/opt/llm-crafter
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl enable llm-crafter
sudo systemctl start llm-crafter
```

## Environment Configuration

### Required Environment Variables

```bash
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/llm-crafter

# Authentication
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Optional Environment Variables

```bash
# Default LLM Provider Keys (can be set via API instead)
OPENAI_API_KEY=sk-your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# CORS Configuration
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=900000

# Session Configuration
SESSION_TIMEOUT=86400000
```

### Database Configuration

#### MongoDB Connection String Examples

**Local MongoDB:**

```bash
MONGODB_URI=mongodb://localhost:27017/llm-crafter
```

**MongoDB with Authentication:**

```bash
MONGODB_URI=mongodb://username:password@localhost:27017/llm-crafter
```

**MongoDB Atlas (Cloud):**

```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/llm-crafter
```

**MongoDB Replica Set:**

```bash
MONGODB_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/llm-crafter?replicaSet=rs0
```

## SSL/HTTPS Configuration

For production deployments, configure HTTPS:

### Using Nginx (Recommended)

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Using Let's Encrypt

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Verification

After installation, verify everything is working:

### 1. Health Check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "llm-crafter"
}
```

### 2. Database Connection

Check the server logs for:

```
MongoDB connected successfully
Server running in production mode on port 3000
```

### 3. Create Test User

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "testpassword"
  }'
```

## Troubleshooting

### Common Installation Issues

**Permission Errors on Linux/macOS:**

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
```

**MongoDB Connection Failed:**

```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

**Port Already in Use:**

```bash
# Find process using port 3000
lsof -ti:3000

# Kill process (replace PID)
kill -9 PID
```

**Node.js Version Issues:**

```bash
# Check Node.js version
node --version

# Use nvm to manage versions
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

## Next Steps

Once installation is complete:

1. Follow the [Getting Started Guide](/getting-started) to create your first agent
2. Read about [Configuration](/configuration) options
3. Explore the [API Reference](/api/index) for integration details
