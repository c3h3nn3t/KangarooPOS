import pino from 'pino';
import { config } from '../config/env';

export const logger = pino({
  level: config.logging.level,
  transport: config.server.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined,
  base: {
    env: config.server.nodeEnv
  }
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

export type Logger = typeof logger;
