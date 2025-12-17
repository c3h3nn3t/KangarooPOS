import http from 'node:http';
import { cors, rateLimit } from './api/middleware';
import { router } from './api/router';
import { registerRoutes } from './api/routes';
import { config } from './config/env';
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

// Start server
server.listen(config.server.port, () => {
  logger.info(
    {
      port: config.server.port,
      env: config.server.nodeEnv,
      offlineRefundsEnabled: config.features.offlineRefundsEnabled
    },
    `KangarooPOS server started on http://0.0.0.0:${config.server.port}`
  );
});
