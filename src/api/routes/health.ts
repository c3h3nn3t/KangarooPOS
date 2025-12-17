import { getActiveDatabase, isOnline } from '../../config/database';
import { config } from '../../config/env';
import type { Router } from '../router';

export function registerHealthRoutes(router: Router): void {
  router.get('/health', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }
    });
  });

  router.get('/ready', (_req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ready',
        database: getActiveDatabase(),
        online: isOnline()
      }
    });
  });

  router.get('/api/v1/status', (_req, res) => {
    const supabaseHost = (() => {
      try {
        return new URL(config.supabase.url).host;
      } catch {
        return 'invalid-url';
      }
    })();

    res.json({
      success: true,
      data: {
        version: '1.0.0',
        environment: config.server.nodeEnv,
        supabase: {
          host: supabaseHost,
          configured: Boolean(config.supabase.anonKey)
        },
        edge: {
          nodeId: config.edge.nodeId || null,
          dbPath: config.edge.dbPath
        },
        features: {
          offlineRefundsEnabled: config.features.offlineRefundsEnabled
        },
        online: isOnline(),
        activeDatabase: getActiveDatabase()
      }
    });
  });
}
