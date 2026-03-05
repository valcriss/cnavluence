export type CursorPayload = {
  createdAt: string;
  id: string;
  score?: number;
};

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string): CursorPayload | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    if (!parsed.createdAt || !parsed.id) {
      return null;
    }
    if (parsed.score !== undefined && (typeof parsed.score !== 'number' || Number.isNaN(parsed.score))) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
