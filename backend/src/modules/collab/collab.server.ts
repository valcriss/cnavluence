import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { verifyRefreshToken } from '../auth/tokens.js';
import { canEditPage, canViewPage } from '../permissions/permissions.service.js';
import { extractTextFromProseMirror } from '../../lib/prosemirror-text.js';
import { createVersionIfChanged } from '../versions/version.service.js';
import { VersionReason } from '@prisma/client';
import { syncBacklinksForPage } from '../backlinks/backlinks.service.js';

type RoomState = {
  doc: Y.Doc;
  awareness: Awareness;
  connectedUsers: Set<string>;
  snapshotContent: object | null;
  snapshotText: string;
};

const rooms = new Map<string, RoomState>();
const roomInitialization = new Map<string, Promise<void>>();

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, cookiePart) => {
    const [rawName, ...rawValue] = cookiePart.trim().split('=');
    if (!rawName || rawValue.length === 0) {
      return acc;
    }

    acc[rawName] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function getRoom(pageId: string): RoomState {
  const existing = rooms.get(pageId);
  if (existing) {
    return existing;
  }

  const doc = new Y.Doc();
  const room: RoomState = {
    doc,
    awareness: new Awareness(doc),
    connectedUsers: new Set(),
    snapshotContent: null,
    snapshotText: '',
  };
  room.doc.getXmlFragment('default');
  rooms.set(pageId, room);
  return room;
}

function toBase64(update: Uint8Array): string {
  return Buffer.from(update).toString('base64');
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function buildRemovalAwarenessUpdate(room: RoomState, clientId: number): string | null {
  if (!room.awareness.meta.has(clientId)) {
    return null;
  }

  const removalStates = new Map<number, { [key: string]: unknown }>();
  removalStates.set(clientId, null as unknown as { [key: string]: unknown });
  const removalUpdate = encodeAwarenessUpdate(room.awareness, [clientId], removalStates);
  return toBase64(removalUpdate);
}

async function ensureRoomInitialized(pageId: string): Promise<RoomState> {
  const room = getRoom(pageId);
  const existingTask = roomInitialization.get(pageId);
  if (existingTask) {
    await existingTask;
    return room;
  }

  const task = (async () => {
    const content = await prisma.pageContent.findUnique({
      where: { pageId },
      select: { currentContent: true, contentText: true },
    });
    room.snapshotContent = (content?.currentContent as object | undefined) ?? null;
    room.snapshotText = content?.contentText ?? '';
  })();

  roomInitialization.set(pageId, task);
  try {
    await task;
  } finally {
    roomInitialization.delete(pageId);
  }

  return room;
}

async function persistRoomIfNeeded(pageId: string): Promise<void> {
  const state = rooms.get(pageId);
  if (!state || state.connectedUsers.size > 0) {
    return;
  }

  if (!state.snapshotContent) {
    rooms.delete(pageId);
    roomInitialization.delete(pageId);
    return;
  }

  await prisma.pageContent.upsert({
    where: { pageId },
    update: {
      currentContent: state.snapshotContent,
      contentText: state.snapshotText || extractTextFromProseMirror(state.snapshotContent),
    },
    create: {
      pageId,
      currentContent: state.snapshotContent,
      contentText: state.snapshotText || extractTextFromProseMirror(state.snapshotContent),
    },
  });
  await syncBacklinksForPage(pageId, state.snapshotContent);

  rooms.delete(pageId);
  roomInitialization.delete(pageId);
}

export function setupCollab(server: HttpServer): Server {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
    path: '/ws',
  });

  io.use(async (socket, next) => {
    const cookieHeader = typeof socket.handshake.headers.cookie === 'string' ? socket.handshake.headers.cookie : undefined;
    const cookies = parseCookieHeader(cookieHeader);
    const refreshCookieToken = cookies[env.REFRESH_COOKIE_NAME];

    try {
      if (!refreshCookieToken) {
        throw new Error('Unauthorized');
      }

      const refreshPayload = verifyRefreshToken(refreshCookieToken);
      const user = await prisma.user.findUnique({
        where: { id: refreshPayload.sub },
        select: { id: true },
      });
      if (!user) {
        throw new Error('Unauthorized');
      }

      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const pageClientIds = new Map<string, number>();

    socket.on('join-page', async ({ pageId }: { pageId: string }) => {
      if (!(await canViewPage(socket.data.userId as string, pageId))) {
        socket.emit('error-event', { message: 'No view access' });
        return;
      }

      socket.join(pageId);
      const room = await ensureRoomInitialized(pageId);
      room.connectedUsers.add(socket.data.userId as string);

      const awarenessClientIds = [...room.awareness.getStates().keys()];
      const awarenessUpdate =
        awarenessClientIds.length > 0 ? toBase64(encodeAwarenessUpdate(room.awareness, awarenessClientIds)) : null;

      socket.emit('room-state', {
        pageId,
        activeUsers: [...room.connectedUsers],
        fullUpdate: toBase64(Y.encodeStateAsUpdate(room.doc)),
        snapshotContent: room.snapshotContent,
        awarenessUpdate,
      });

      socket.to(pageId).emit('presence', {
        type: 'join',
        userId: socket.data.userId,
      });
    });

    socket.on('leave-page', async ({ pageId }: { pageId: string }) => {
      socket.leave(pageId);
      const room = rooms.get(pageId);
      if (!room) {
        return;
      }

      room.connectedUsers.delete(socket.data.userId as string);
      socket.to(pageId).emit('presence', {
        type: 'leave',
        userId: socket.data.userId,
      });

      const clientId = pageClientIds.get(pageId);
      if (typeof clientId === 'number') {
        const removalUpdate = buildRemovalAwarenessUpdate(room, clientId);
        removeAwarenessStates(room.awareness, [clientId], socket.id);
        if (removalUpdate) {
          socket.to(pageId).emit('awareness-update', {
            pageId,
            update: removalUpdate,
            userId: socket.data.userId,
          });
        }
        pageClientIds.delete(pageId);
      }

      await persistRoomIfNeeded(pageId);
    });

    socket.on(
      'apply-update',
      async ({
        pageId,
        update,
        snapshotContent,
        snapshotText,
      }: {
        pageId: string;
        update: string;
        snapshotContent?: object;
        snapshotText?: string;
      }) => {
      if (!(await canEditPage(socket.data.userId as string, pageId))) {
        socket.emit('error-event', { message: 'No edit access' });
        return;
      }

        const room = await ensureRoomInitialized(pageId);
        Y.applyUpdate(room.doc, fromBase64(update), 'remote-client');
        if (snapshotContent) {
          room.snapshotContent = snapshotContent;
          room.snapshotText = snapshotText ?? extractTextFromProseMirror(snapshotContent);
        }

        socket.to(pageId).emit('remote-update', {
          pageId,
          update,
          userId: socket.data.userId,
        });
      },
    );

    socket.on('cursor-update', async ({ pageId, selection }: { pageId: string; selection: unknown }) => {
      if (!(await canViewPage(socket.data.userId as string, pageId))) {
        return;
      }

      socket.to(pageId).emit('remote-cursor', {
        pageId,
        userId: socket.data.userId,
        selection,
      });
    });

    socket.on(
      'awareness-update',
      async ({ pageId, clientId, update }: { pageId: string; clientId: number; update: string }) => {
        if (!(await canViewPage(socket.data.userId as string, pageId))) {
          return;
        }

        if (!Number.isFinite(clientId)) {
          return;
        }

        const currentClientId = pageClientIds.get(pageId);
        if (typeof currentClientId === 'number' && currentClientId !== clientId) {
          return;
        }
        pageClientIds.set(pageId, clientId);

        const room = await ensureRoomInitialized(pageId);
        applyAwarenessUpdate(room.awareness, fromBase64(update), socket.id);

        socket.to(pageId).emit('awareness-update', {
          pageId,
          update,
          userId: socket.data.userId,
        });
      },
    );

    socket.on('disconnecting', async () => {
      for (const roomId of socket.rooms) {
        if (roomId === socket.id) {
          continue;
        }

        const room = rooms.get(roomId);
        if (!room) {
          continue;
        }

        room.connectedUsers.delete(socket.data.userId as string);
        socket.to(roomId).emit('presence', {
          type: 'leave',
          userId: socket.data.userId,
        });

        const clientId = pageClientIds.get(roomId);
        if (typeof clientId === 'number') {
          const removalUpdate = buildRemovalAwarenessUpdate(room, clientId);
          removeAwarenessStates(room.awareness, [clientId], socket.id);
          if (removalUpdate) {
            socket.to(roomId).emit('awareness-update', {
              pageId: roomId,
              update: removalUpdate,
              userId: socket.data.userId,
            });
          }
          pageClientIds.delete(roomId);
        }

        if (room.connectedUsers.size === 0) {
          await persistRoomIfNeeded(roomId);
          await createVersionIfChanged({
            pageId: roomId,
            actorUserId: socket.data.userId as string,
            reason: VersionReason.AUTO_SESSION_END,
          });
        }
      }
    });
  });

  return io;
}

export function collabMetrics() {
  let activeConnections = 0;
  for (const room of rooms.values()) {
    activeConnections += room.connectedUsers.size;
  }

  return {
    activeRooms: rooms.size,
    activeConnections,
  };
}
