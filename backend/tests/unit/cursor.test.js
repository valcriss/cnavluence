import { describe, expect, it } from 'vitest';
import { encodeCursor, decodeCursor } from '../../src/lib/cursor.js';
describe('cursor', () => {
    it('encodes and decodes', () => {
        const cursor = encodeCursor({ createdAt: '2026-03-02T10:00:00.000Z', id: 'abc' });
        expect(decodeCursor(cursor)).toEqual({ createdAt: '2026-03-02T10:00:00.000Z', id: 'abc' });
    });
    it('returns null on invalid cursor', () => {
        expect(decodeCursor('invalid')).toBeNull();
    });
});
