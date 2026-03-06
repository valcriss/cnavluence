import { io, type Socket } from 'socket.io-client';

const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL ?? window.location.origin;

type ConnectionState = {
  socket: Socket | null;
};

const connectionState: ConnectionState = {
  socket: null,
};

export function ensureCollabSocket(): Socket {
  if (connectionState.socket) {
    return connectionState.socket;
  }

  connectionState.socket = io(wsBaseUrl, {
    path: '/ws',
    withCredentials: true,
    transports: ['websocket'],
  });

  return connectionState.socket;
}

export function joinPageRoom(pageId: string): Socket {
  const socket = ensureCollabSocket();
  socket.emit('join-page', { pageId });
  return socket;
}

export function leavePageRoom(pageId: string): void {
  if (!connectionState.socket) {
    return;
  }

  connectionState.socket.emit('leave-page', { pageId });
}
