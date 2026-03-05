import http from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { setupCollab } from './modules/collab/collab.server.js';
import { startVersionScheduler, stopVersionScheduler } from './modules/versions/version-scheduler.js';

const app = createApp();
const server = http.createServer(app);

setupCollab(server);
startVersionScheduler();

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'Backend started');
});

const shutdown = async () => {
  stopVersionScheduler();
  await prisma.$disconnect();
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
