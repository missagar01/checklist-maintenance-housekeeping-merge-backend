import pino from 'pino';
import config from './config.js';

const isDev = config.env !== 'production';

const logger = pino({
  level: config.logLevel,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined
});

export default logger;
