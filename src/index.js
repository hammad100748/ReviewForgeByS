require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const apiRouter = require('./api/routes');
const { runDetectionCycle } = require('./services/detectReviews');

const PORT = process.env.PORT || 3001;
const CRON_SCHEDULE = '*/30 * * * *'; // Every 30 minutes

/**
 * Returns current timestamp string formatted as [YYYY-MM-DD HH:mm:ss]
 */
function getTimestamp() {
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);
  return dateStr;
}

/**
 * Executes a single review detection cycle wrapped safely in a try/catch block.
 */
async function executeScheduledCycle() {
  const startTime = getTimestamp();
  console.log(`\n[${startTime}] Starting scheduled review detection cycle...`);

  try {
    await runDetectionCycle();
    const endTime = getTimestamp();
    console.log(`[${endTime}] Scheduled review detection cycle complete.\n`);
  } catch (error) {
    const errorTime = getTimestamp();
    console.error(`[${errorTime}] [CRON ERROR] Error during review detection cycle: ${error.message}\n`);
  }
}

/**
 * Starts the ReviewForge automation server (Express REST API + node-cron scheduler).
 */
function startServer() {
  const app = express();

  // Configurable CORS Setup (Allows localhost dev + custom ALLOWED_FRONTEND_ORIGIN environment variable)
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
  ];

  if (process.env.ALLOWED_FRONTEND_ORIGIN) {
    const extraOrigins = process.env.ALLOWED_FRONTEND_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
    allowedOrigins.push(...extraOrigins);
  }

  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g. mobile apps, curl, or server-to-server calls)
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.indexOf(origin) !== -1 ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('http://127.0.0.1:')
      ) {
        return callback(null, true);
      } else {
        return callback(new Error(`CORS policy blocked request from origin: ${origin}`));
      }
    },
    credentials: true,
  };

  // Middleware
  app.use(cors(corsOptions));
  app.use(express.json());

  // Public Health Check Endpoint (Required for Render & Cloud Deployment Health Checks)
  app.get('/health', (req, res) => {
    return res.status(200).json({ status: 'ok' });
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Start HTTP API server
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`          ReviewForge - Automation & API Server       `);
    console.log(`======================================================`);
    console.log(` Status:    SERVER RUNNING (Continuous Process)`);
    console.log(` HTTP API:  Listening on http://localhost:${PORT}`);
    console.log(` Health:    http://localhost:${PORT}/health`);
    console.log(` Cron:      Every 30 minutes ('${CRON_SCHEDULE}')`);
    console.log(` Started:   [${getTimestamp()}]`);
    console.log(`======================================================\n`);
  });

  // Schedule the background cron job
  cron.schedule(CRON_SCHEDULE, () => {
    executeScheduledCycle();
  });
}

startServer();
