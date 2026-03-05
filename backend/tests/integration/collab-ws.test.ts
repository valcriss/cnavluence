import express from 'express';
import http from 'node:http';
import { io as ioClient, type Socket } from 'socket.io-client';
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedPrisma = {
  user: {
    findUnique: vi.fn(),
  },
  pageContent: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
};

const mockedCanViewPage = vi.fn();
const mockedCanEditPage = vi.fn();
const mockedVerifyRefreshToken = vi.fn();
const mockedCreateVersionIfChanged = vi.fn();
const mockedSyncBacklinksForPage = vi.fn();

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: mockedPrisma,
}));

vi.mock('../../src/modules/permissions/permissions.service.js', () => ({
  canViewPage: mockedCanViewPage,
  canEditPage: mockedCanEditPage,
}));

vi.mock('../../src/modules/auth/tokens.js', () => ({
  verifyRefreshToken: mockedVerifyRefreshToken,
}));

vi.mock('../../src/modules/versions/version.service.js', () => ({
  createVersionIfChanged: mockedCreateVersionIfChanged,
}));

vi.mock('../../src/modules/backlinks/backlinks.service.js', () => ({
  syncBacklinksForPage: mockedSyncBacklinksForPage,
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    REFRESH_COOKIE_NAME: 'cnav_refresh',
  },
}));

function toBase64(update: Uint8Array): string {
  return Buffer.from(update).toString('base64');
}

async function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 8_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });
}

async function connect(baseUrl: string, userId: string): Promise<Socket> {
  const socket = ioClient(baseUrl, {
    path: '/ws',
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: {
      Cookie: `cnav_refresh=token_${userId}`,
    },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for connection')), 8_000);
    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  return socket;
}

describe('collab websocket server', () => {
  let server: http.Server | null = null;
  let ioServer: { close: () => void } | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    vi.clearAllMocks();
    mockedVerifyRefreshToken.mockImplementation((token: string) => ({
      sub: token.replace('token_', ''),
      tokenVersion: 1,
    }));
    mockedPrisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id ? { id: where.id } : null);
    mockedPrisma.pageContent.findUnique.mockResolvedValue({
      currentContent: { type: 'doc', content: [] },
      contentText: 'seed',
    });
    mockedPrisma.pageContent.upsert.mockResolvedValue(undefined);
    mockedCanViewPage.mockResolvedValue(true);
    mockedCanEditPage.mockResolvedValue(true);

    const { setupCollab } = await import('../../src/modules/collab/collab.server.js');
    const app = express();
    server = http.createServer(app);
    ioServer = setupCollab(server);

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (ioServer) {
      ioServer.close();
      ioServer = null;
    }

    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it('handles join/leave, apply-update, awareness-update, and persists on last leave', async () => {
    const pageId = 'caaaaaaaaaaaaaaaaaaaaaaa';
    const socketA = await connect(baseUrl, 'user_a');
    const socketB = await connect(baseUrl, 'user_b');

    try {
      socketA.emit('join-page', { pageId });
      await waitForEvent(socketA, 'room-state');

      const presenceJoin = waitForEvent<{ type: 'join'; userId: string }>(socketA, 'presence');
      socketB.emit('join-page', { pageId });
      await waitForEvent(socketB, 'room-state');
      await expect(presenceJoin).resolves.toMatchObject({ type: 'join', userId: 'user_b' });

      const awarenessDoc = new Y.Doc();
      const awareness = new Awareness(awarenessDoc);
      awareness.setLocalStateField('user', { name: 'A' });
      const awarenessUpdate = encodeAwarenessUpdate(awareness, [awarenessDoc.clientID]);

      const awarenessEvent = waitForEvent<{ pageId: string }>(socketB, 'awareness-update');
      socketA.emit('awareness-update', {
        pageId,
        clientId: awarenessDoc.clientID,
        update: toBase64(awarenessUpdate),
      });
      await expect(awarenessEvent).resolves.toMatchObject({ pageId });

      const ydoc = new Y.Doc();
      ydoc.getMap('meta').set('k', 'v');
      const yUpdate = toBase64(Y.encodeStateAsUpdate(ydoc));

      const remoteUpdate = waitForEvent<{ pageId: string; update: string }>(socketB, 'remote-update');
      socketA.emit('apply-update', {
        pageId,
        update: yUpdate,
        snapshotContent: { type: 'doc', content: [{ type: 'paragraph' }] },
        snapshotText: 'snapshot',
      });
      await expect(remoteUpdate).resolves.toMatchObject({ pageId, update: yUpdate });

      const presenceLeave = waitForEvent<{ type: 'leave'; userId: string }>(socketB, 'presence');
      socketA.emit('leave-page', { pageId });
      await expect(presenceLeave).resolves.toMatchObject({ type: 'leave', userId: 'user_a' });

      socketB.emit('leave-page', { pageId });
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(mockedPrisma.pageContent.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { pageId },
          update: expect.objectContaining({
            contentText: 'snapshot',
          }),
        }),
      );
      expect(mockedSyncBacklinksForPage).toHaveBeenCalledWith(
        pageId,
        expect.objectContaining({ type: 'doc' }),
      );
    } finally {
      socketA.disconnect();
      socketB.disconnect();
    }
  });

  it('blocks edit updates when user has no edit permission', async () => {
    const pageId = 'cbbbbbbbbbbbbbbbbbbbbbbb';
    mockedCanEditPage.mockResolvedValue(false);
    const socket = await connect(baseUrl, 'user_c');

    try {
      socket.emit('join-page', { pageId });
      await waitForEvent(socket, 'room-state');

      const denied = waitForEvent<{ message: string }>(socket, 'error-event');
      socket.emit('apply-update', {
        pageId,
        update: 'AA==',
      });

      await expect(denied).resolves.toMatchObject({ message: 'No edit access' });
      expect(mockedPrisma.pageContent.upsert).not.toHaveBeenCalled();
    } finally {
      socket.disconnect();
    }
  });

  it('does not crash on leave when awareness metadata is missing for tracked clientId', async () => {
    const pageId = 'cccccccccccccccccccccccc';
    const socketA = await connect(baseUrl, 'user_d');
    const socketB = await connect(baseUrl, 'user_e');

    try {
      socketA.emit('join-page', { pageId });
      await waitForEvent(socketA, 'room-state');

      socketB.emit('join-page', { pageId });
      await waitForEvent(socketB, 'room-state');

      socketA.emit('awareness-update', {
        pageId,
        clientId: 424242,
        update: 'AA==',
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const presenceLeave = waitForEvent<{ type: 'leave'; userId: string }>(socketB, 'presence');
      socketA.emit('leave-page', { pageId });
      await expect(presenceLeave).resolves.toMatchObject({ type: 'leave', userId: 'user_d' });
    } finally {
      socketA.disconnect();
      socketB.disconnect();
    }
  });
});
