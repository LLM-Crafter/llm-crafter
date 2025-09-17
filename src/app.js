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

// Middleware
app.use(helmet());
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

// Connect to database
connectDB();

// Initialize system tools
initializeSystemTools().catch(console.error);

// Initialize default providers
initializeDefaultProviders().catch(console.error);

// Initialize background job processor for RAG indexing
console.log('🚀 Initializing RAG indexing job processor...');
require('./services/indexingJobProcessor');

// Basic route for testing
app.get('/health', publicLimiter, (req, res) => {
  res.json({ status: 'ok', service: 'llm-crafter' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
