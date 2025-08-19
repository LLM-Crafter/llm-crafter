const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const connectDB = require("./config/database");
const { initializeSystemTools } = require("./config/systemTools");
const { initializeDefaultProviders } = require("./config/defaultProviders");

const app = express();
const authRoutes = require("./routes/auth");
const organizationRoutes = require("./routes/organizations");
const providerRoutes = require("./routes/providers");
const proxyRoutes = require("./routes/proxy");
const toolRoutes = require("./routes/tools");
const statisticsRoutes = require("./routes/statistics");

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/organizations", statisticsRoutes);
app.use("/api/v1/providers", providerRoutes);
app.use("/api/v1/proxy", proxyRoutes);
app.use("/api/v1/tools", toolRoutes);

// Connect to database
connectDB();

// Initialize system tools
initializeSystemTools().catch(console.error);

// Initialize default providers
initializeDefaultProviders().catch(console.error);

// Basic route for testing
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "llm-crafter" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

module.exports = app;
