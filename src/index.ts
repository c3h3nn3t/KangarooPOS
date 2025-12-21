import http from 'node:http';
import { cors, rateLimit } from './api/middleware';
import { router } from './api/router';
import { registerRoutes } from './api/routes';
import { config } from './config/env';
import { db } from './db/hybrid-adapter';
import { initializeEdgeSchema } from './db/edge-schema';
import { logger } from './utils/logger';

// Register global middleware
router.use(cors());
router.use(
  rateLimit({
    windowMs: 60000,
    maxRequests: 100,
    skip: (req) => req.url?.startsWith('/health') || req.url?.startsWith('/ready') || false
  })
);

// Register routes
registerRoutes(router);

// Create server
const server = http.createServer((req, res) => {
  router.handleRequest(req, res).catch((error) => {
    logger.error({ error }, 'Unhandled request error');
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: { message: 'Internal server error' } }));
    }
  });
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutting down server...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Startup function - initializes database and starts server
async function startup(): Promise<void> {
  try {
    // Initialize edge database schema
    logger.info('Initializing edge database schema...');
    initializeEdgeSchema();

    // Initialize hybrid adapter (load pending sync entries)
    logger.info('Initializing hybrid database adapter...');
    await db.initialize();

    // Log sync queue status
    const syncStats = db.getSyncStats();
    if (syncStats.total > 0) {
      logger.info(
        { syncStats },
        'Pending sync entries loaded - will sync when online'
      );
    }

    // Start server
    server.listen(config.server.port, () => {
      logger.info(
        {
          port: config.server.port,
          env: config.server.nodeEnv,
          offlineRefundsEnabled: config.features.offlineRefundsEnabled,
          syncQueue: syncStats
        },
        `KangarooPOS server started on http://0.0.0.0:${config.server.port}`
      );
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the application
startup();
