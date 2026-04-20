const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');
require('dotenv').config();

// Validate environment variables before starting
const { validateEnvironment } = require('./utils/environmentValidator');
validateEnvironment();

const connectDB = require('./config/database');
const { initializeSystemTools } = require('./config/systemTools');
const { initializeDefaultProviders } = require('./config/defaultProviders');
const { publicLimiter } = require('./middleware/rateLimiting');

// Initialize Passport
const passport = require('./config/passport');

const app = express();
const authRoutes = require('./routes/auth');
const organizationRoutes = require('./routes/organizations');
const providerRoutes = require('./routes/providers');
const proxyRoutes = require('./routes/proxy');
const toolRoutes = require('./routes/tools');
const statisticsRoutes = require('./routes/statistics');
const sessionRoutes = require('./routes/sessions');
const externalRoutes = require('./routes/external');
const vectorDatabaseRoutes = require('./routes/vectorDatabases');
const handoffRoutes = require('./routes/handoff');
const channelRoutes = require('./routes/channels');
const widgetRoutes = require('./routes/widget');
const externalOperatorRoutes = require('./routes/externalOperators');

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  })
);
app.set('trust proxy', true);
app.use(cors());
app.use(morgan('dev'));

// Session configuration for OAuth
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
app.use(express.json({ limit: '50mb' }));
// Initialize Passport middleware
app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/organizations', statisticsRoutes);
app.use('/api/v1/providers', providerRoutes);
app.use('/api/v1/proxy', proxyRoutes);
app.use('/api/v1/tools', toolRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/external', externalRoutes);
app.use('/api/v1', vectorDatabaseRoutes);
app.use('/api/v1/handoffs', handoffRoutes);
app.use('/api/v1/external', externalOperatorRoutes);
app.use('/api/v1/channels', channelRoutes);

// Serve chat widget files
app.use('/widget', widgetRoutes);

// Conversations routes (for polling latest messages)
const conversationRouter = express.Router();
const handoffController = require('./controllers/handoffController');
const auth = require('./middleware/auth');

conversationRouter.get(
  '/conversations/:conversationId/messages/latest',
  auth,
  handoffController.getLatestMessages
);
app.use('/api/v1', conversationRouter);

// Connect to database
connectDB();

// Initialize system tools
initializeSystemTools().catch(console.error);

// Initialize default providers
initializeDefaultProviders().catch(console.error);

// Initialize background job processor for RAG indexing
console.log('🚀 Initializing RAG indexing job processor...');
require('./services/indexingJobProcessor');

// ─── GDPR Retention Cron ─────────────────────────────────────────────────────
// Runs daily at 02:00 UTC to delete conversations/executions that have exceeded
// the per-agent retention_days policy.
// Schedule is configurable via GDPR_RETENTION_CRON env var (cron syntax).
const gdprService = require('./services/gdprService');
// Default fallback: daily at 02:00 UTC ('0 2 * * *')
const GDPR_RETENTION_CRON = process.env.GDPR_RETENTION_CRON || '0 2 * * *';

(function startGdprRetentionCron() {
  try {
    const cron = require('node-cron');
    if (!cron.validate(GDPR_RETENTION_CRON)) {
      console.warn(`[GDPR] Invalid cron expression "${GDPR_RETENTION_CRON}" — retention cron not started.`);
      return;
    }
    cron.schedule(GDPR_RETENTION_CRON, async () => {
      try {
        await gdprService.runRetention();
      } catch (err) {
        console.error('[GDPR] Retention cron error:', err.message);
      }
    }, { timezone: 'UTC' });
    console.log(`[GDPR] Retention cron scheduled: ${GDPR_RETENTION_CRON} (UTC)`);
  } catch (err) {
    // node-cron not installed — skip silently (cron can also be run externally)
    console.warn('[GDPR] node-cron not available; skipping retention cron setup:', err.message);
  }
})();
// ─────────────────────────────────────────────────────────────────────────────

// Basic route for testing
app.get('/health', publicLimiter, (req, res) => {
  res.json({ status: 'ok', service: 'llm-crafter' });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on ${HOST}:${PORT}`);
});

module.exports = app;
