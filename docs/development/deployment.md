# Deployment Guide

This guide covers different deployment strategies for LLM Crafter, from development to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Deployment Options](#deployment-options)
- [Production Checklist](#production-checklist)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum Requirements:**
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **Network**: Stable internet connection

**Recommended for Production:**
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ SSD
- **Network**: High-speed connection with CDN

### Software Dependencies

- **Node.js**: v18.0.0 or higher
- **npm**: v8.0.0 or higher
- **MongoDB**: v6.0 or higher
- **Process Manager**: PM2 (recommended)
- **Reverse Proxy**: Nginx (recommended)

## Environment Configuration

### Environment Variables

Create a comprehensive `.env` file for your deployment environment:

```bash
# Application
NODE_ENV=production
PORT=3000
APP_NAME=LLM Crafter
APP_URL=https://your-domain.com

# Database
MONGODB_URI=mongodb://localhost:27017/llm-crafter
# For MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/llm-crafter

# JWT Configuration
JWT_SECRET=your-very-secure-jwt-secret-key-here
JWT_EXPIRES_IN=7d

# OpenAI API (default provider)
OPENAI_API_KEY=your-openai-api-key

# Email Configuration (optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Security
CORS_ORIGIN=https://your-frontend-domain.com
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379
```

### Security Configuration

#### JWT Secret Generation

Generate a strong JWT secret:

```bash
# Generate a random secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

#### CORS Configuration

Configure CORS for your domain:

```javascript
// In production, set specific origins
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};
```

## Deployment Options

### Option 1: Traditional VPS/Server Deployment

#### 1. Server Setup

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Install PM2 globally
sudo npm install -g pm2
```

#### 2. Application Deployment

```bash
# Clone the repository
git clone https://github.com/your-username/llm-crafter.git
cd llm-crafter

# Install dependencies
npm ci --production

# Copy environment configuration
cp .env.example .env
# Edit .env with your production values
nano .env

# Start the application with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

#### 3. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'llm-crafter',
    script: 'src/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

#### 4. Nginx Configuration

Install and configure Nginx as a reverse proxy:

```bash
# Install Nginx
sudo apt install nginx

# Create configuration file
sudo nano /etc/nginx/sites-available/llm-crafter
```

Nginx configuration:

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    # Proxy Configuration
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
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Static files (if serving frontend)
    location /static/ {
        alias /path/to/llm-crafter/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://localhost:3000/health;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/llm-crafter /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 5. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Test automatic renewal
sudo certbot renew --dry-run
```

### Option 2: Docker Deployment

#### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Bundle app source
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /usr/src/app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node health-check.js

CMD ["node", "src/app.js"]
```

#### 2. Create Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongodb:27017/llm-crafter
    depends_on:
      - mongodb
      - redis
    volumes:
      - ./logs:/usr/src/app/logs
    restart: unless-stopped

  mongodb:
    image: mongo:6.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    environment:
      - MONGO_INITDB_ROOT_USERNAME=root
      - MONGO_INITDB_ROOT_PASSWORD=password
      - MONGO_INITDB_DATABASE=llm-crafter
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  mongodb_data:
  redis_data:
```

#### 3. Deploy with Docker

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f app

# Scale the application
docker-compose up -d --scale app=3
```

### Option 3: Cloud Platform Deployment

#### Heroku Deployment

1. **Prepare the application:**

```bash
# Install Heroku CLI
npm install -g heroku

# Login to Heroku
heroku login

# Create Heroku app
heroku create your-app-name
```

2. **Configure environment variables:**

```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-jwt-secret
heroku config:set OPENAI_API_KEY=your-openai-key
heroku config:set MONGODB_URI=your-mongodb-atlas-uri
```

3. **Deploy:**

```bash
git push heroku main
```

#### DigitalOcean App Platform

Create `app.yaml`:

```yaml
name: llm-crafter
services:
- name: api
  source_dir: /
  github:
    repo: your-username/llm-crafter
    branch: main
  run_command: npm start
  environment_slug: node-js
  instance_count: 1
  instance_size_slug: basic-xxs
  env:
  - key: NODE_ENV
    value: production
  - key: JWT_SECRET
    value: your-jwt-secret
    type: SECRET
  - key: MONGODB_URI
    value: your-mongodb-uri
    type: SECRET

databases:
- name: llm-crafter-db
  engine: MONGODB
  version: "5"
```

## Production Checklist

### Security

- [ ] **Environment Variables**: All secrets stored securely
- [ ] **HTTPS**: SSL/TLS certificate installed and configured
- [ ] **CORS**: Configured for specific domains
- [ ] **Rate Limiting**: Implemented to prevent abuse
- [ ] **Helmet**: Security headers configured
- [ ] **Input Validation**: All inputs validated and sanitized
- [ ] **Authentication**: JWT tokens properly secured
- [ ] **Database**: MongoDB authentication enabled

### Performance

- [ ] **Process Management**: PM2 or similar process manager
- [ ] **Clustering**: Multiple Node.js instances running
- [ ] **Reverse Proxy**: Nginx configured for load balancing
- [ ] **Caching**: Redis or similar caching solution
- [ ] **Database Indexing**: Proper indexes on frequently queried fields
- [ ] **Connection Pooling**: MongoDB connection pool configured
- [ ] **Compression**: Gzip compression enabled

### Monitoring

- [ ] **Health Checks**: Application health endpoint
- [ ] **Logging**: Structured logging with appropriate levels
- [ ] **Error Tracking**: Error monitoring service configured
- [ ] **Performance Monitoring**: APM tool setup
- [ ] **Uptime Monitoring**: External uptime monitoring
- [ ] **Database Monitoring**: MongoDB monitoring tools

### Backup and Recovery

- [ ] **Database Backups**: Automated database backups
- [ ] **Application Backups**: Source code and configuration backups
- [ ] **Recovery Testing**: Backup restoration tested
- [ ] **Disaster Recovery Plan**: Documented recovery procedures

## Monitoring and Maintenance

### Application Monitoring

#### Health Check Endpoint

Add a health check endpoint to your application:

```javascript
// src/routes/health.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

router.get('/health', async (req, res) => {
  try {
    // Check database connection
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    
    // Check uptime
    const uptime = process.uptime();
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: uptime,
      database: {
        status: dbStatus,
        connection: dbState
      },
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB'
      }
    };
    
    res.status(200).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

module.exports = router;
```

#### Logging Configuration

Configure structured logging:

```javascript
// src/config/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'llm-crafter' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

module.exports = logger;
```

### Database Maintenance

#### MongoDB Maintenance Script

```bash
#!/bin/bash
# mongo-maintenance.sh

# Variables
DB_NAME="llm-crafter"
BACKUP_DIR="/backup/mongodb"
LOG_FILE="/var/log/mongo-maintenance.log"

# Create backup directory
mkdir -p $BACKUP_DIR

# Database backup
mongodump --db $DB_NAME --out $BACKUP_DIR/$(date +%Y%m%d_%H%M%S) >> $LOG_FILE 2>&1

# Remove backups older than 7 days
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} \; >> $LOG_FILE 2>&1

# Database optimization
mongo $DB_NAME --eval "db.runCommand({compact: 'agents'})" >> $LOG_FILE 2>&1
mongo $DB_NAME --eval "db.runCommand({compact: 'conversations'})" >> $LOG_FILE 2>&1

# Index maintenance
mongo $DB_NAME --eval "db.runCommand({reIndex: 'agents'})" >> $LOG_FILE 2>&1

echo "$(date): Maintenance completed" >> $LOG_FILE
```

Set up as a cron job:

```bash
# Add to crontab (run daily at 2 AM)
0 2 * * * /path/to/mongo-maintenance.sh
```

## Troubleshooting

### Common Issues

#### High Memory Usage

```bash
# Check memory usage
pm2 monit

# Restart application if memory usage is high
pm2 restart llm-crafter

# Check for memory leaks
node --inspect src/app.js
```

#### Database Connection Issues

```bash
# Check MongoDB status
sudo systemctl status mongod

# Check connection logs
tail -f /var/log/mongodb/mongod.log

# Test connection
mongo --eval "db.runCommand({connectionStatus : 1})"
```

#### SSL Certificate Issues

```bash
# Check certificate expiration
openssl x509 -in /etc/letsencrypt/live/your-domain.com/cert.pem -text -noout | grep "Not After"

# Renew certificate
sudo certbot renew

# Test SSL configuration
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

### Performance Optimization

#### Database Optimization

```javascript
// Add to your MongoDB queries
// Use indexes for frequent queries
db.agents.createIndex({ "organization": 1, "project": 1 })
db.conversations.createIndex({ "agent": 1, "createdAt": -1 })

// Use projection to limit returned fields
db.agents.find({}, { name: 1, type: 1, status: 1 })

// Use aggregation for complex queries
db.conversations.aggregate([
  { $match: { agent: agentId } },
  { $sort: { createdAt: -1 } },
  { $limit: 50 }
])
```

#### Application Optimization

```javascript
// Connection pooling
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4
});

// Caching frequently accessed data
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 });

// Cache agent configurations
const getCachedAgent = async (agentId) => {
  const cacheKey = `agent:${agentId}`;
  let agent = cache.get(cacheKey);
  
  if (!agent) {
    agent = await Agent.findById(agentId);
    cache.set(cacheKey, agent);
  }
  
  return agent;
};
```

This comprehensive deployment guide covers everything needed to deploy LLM Crafter in production environments, from basic VPS setups to cloud platforms and containerized deployments.
