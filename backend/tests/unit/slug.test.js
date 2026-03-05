import { describe, expect, it } from 'vitest';
import { slugify } from '../../src/lib/slug.js';
describe('slugify', () => {
    it('normalizes text', () => {
        expect(slugify('Hello World!')).toBe('hello-world');
    });
    it('handles empty values', () => {
        expect(slugify('***')).toBe('page');
    });
});
