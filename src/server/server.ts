import { createServer } from 'http';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import next from 'next';
import { initializeDatabase } from '@/lib/db/init';
import { logger } from '@/lib/logger';
import https from 'https';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const httpPort = parseInt(process.env.HTTP_PORT || '8080', 10);
const httpsPort = parseInt(process.env.HTTPS_PORT || '8443', 10);

const app = next({ dev, hostname, port: httpsPort });
const handle = app.getRequestHandler();

async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();
    logger.info('Database connection established');

    await app.prepare();
    logger.info('Next.js app prepared');

    // HTTP Server (for redirect)
    createServer((req, res) => {
      const { host } = req.headers;
      if (host) {
        res.writeHead(301, {
          Location: `https://${host.split(':')[0]}:${httpsPort}${req.url}`
        });
        res.end();
      }
    }).listen(httpPort, () => {
      logger.info(`HTTP redirect server listening on port ${httpPort}`);
    });

    // HTTPS Server
    const httpsOptions = {
      key: readFileSync(resolve(__dirname, '../../ssl/server.key')),
      cert: readFileSync(resolve(__dirname, '../../ssl/server.crt')),
    };

    https.createServer(httpsOptions, async (req, res) => {
      try {
        await handle(req, res);
      } catch (err) {
        logger.error('Error handling request', { error: err });
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }).listen(httpsPort, () => {
      logger.info(`HTTPS server listening on port ${httpsPort}`);
    });

  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Starting graceful shutdown...');
  process.exit(0);
});

startServer();
