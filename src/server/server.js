/* global process, console */
import { createServer as createHttpsServer } from 'https';
import { createServer as createHttpServer } from 'http';
import { readFileSync } from 'fs';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import { join } from 'path';
import { config } from 'dotenv';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : '.env.development';

config({
  path: join(projectRoot, envFile),
  override: true
});

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'ai-project-planner';
const httpPort = parseInt(process.env.HTTP_PORT || '8080', 10);
const httpsPort = parseInt(process.env.HTTPS_PORT || '8443', 10);

// SSL certificate paths
const SSL_KEY_PATH = '/etc/ssl/private/ai-project-planner.key';
const SSL_CERT_PATH = '/etc/ssl/certs/ai-project-planner.crt';

async function startServer() {
  try {
    // Verify SSL files exist
    try {
      readFileSync(SSL_KEY_PATH);
      readFileSync(SSL_CERT_PATH);
    } catch (err) {
      console.error('SSL certificates not found:', err);
      process.exit(1);
    }

    const app = next({ dev, hostname, customServer: true });
    const handle = app.getRequestHandler();

    // Ensure we have a build before starting in production
    if (!dev) {
      const buildId = join(process.cwd(), '.next', 'BUILD_ID');
      try {
        readFileSync(buildId);
      } catch (/* eslint-disable-line @typescript-eslint/no-unused-vars */ _err) {
        console.error('Production build not found. Running next build...');
        const { execSync } = await import('child_process');
        execSync('npm run build', { stdio: 'inherit' });
      }
    }

    await app.prepare();

    // Create HTTP server (redirect to HTTPS)
    const httpServer = createHttpServer((req, res) => {
      const host = req.headers.host?.split(':')[0] || hostname;
      const httpsUrl = `https://${host}:${httpsPort}${req.url}`;
      res.writeHead(301, { Location: httpsUrl });
      res.end();
    });

    // Create HTTPS server with SSL configuration
    const httpsServer = createHttpsServer(
      {
        key: readFileSync(SSL_KEY_PATH),
        cert: readFileSync(SSL_CERT_PATH),
        // Enable modern TLS versions and disable older ones
        minVersion: 'TLSv1.2',
        // Prefer modern cipher suites
        ciphers: [
          'TLS_AES_128_GCM_SHA256',
          'TLS_AES_256_GCM_SHA384',
          'TLS_CHACHA20_POLY1305_SHA256',
          'ECDHE-ECDSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-ECDSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES256-GCM-SHA384',
        ].join(':'),
      },
      async (req, res) => {
        try {
          const parsedUrl = parse(req.url ?? '/', true);
          await handle(req, res, parsedUrl);
        } catch (err) {
          console.error('Error handling request:', err);
          res.statusCode = 500;
          res.end('Internal Server Error');
        }
      }
    );

    // Setup Socket.IO with SSL
    const io = new Server(httpsServer, {
      cors: {
        origin: `https://${hostname}:${httpsPort}`,
        methods: ['GET', 'POST'],
      },
    });

    io.on('connection', (socket) => {
      console.log('Client connected');
      
      socket.on('disconnect', () => {
        console.log('Client disconnected');
      });

      socket.on('error', (error) => {
        console.error('Socket error:', error);
      });
    });

    // Start servers
    httpServer.listen(httpPort, () => {
      console.log(`HTTP server running on http://${hostname}:${httpPort}`);
    });

    httpsServer.listen(httpsPort, () => {
      console.log(`HTTPS server running on https://${hostname}:${httpsPort}`);
    });

  } catch (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
}

startServer();
