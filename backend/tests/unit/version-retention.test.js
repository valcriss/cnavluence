import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/config/env.js', () => ({
    env: {
        VERSION_RETENTION_ALL_DAYS: 30,
        VERSION_RETENTION_DAILY_DAYS: 90,
        VERSION_RETENTION_MAX_DAYS: 3650,
    },
}));
import { shouldKeepVersion } from '../../src/modules/versions/version-retention.js';
describe('version retention', () => {
    it('keeps all recent versions', () => {
        expect(shouldKeepVersion({ ageDays: 10, isFirstOfDay: false, isFirstOfWeek: false })).toBe(true);
    });
    it('keeps one per day in daily window', () => {
        expect(shouldKeepVersion({ ageDays: 40, isFirstOfDay: true, isFirstOfWeek: false })).toBe(true);
        expect(shouldKeepVersion({ ageDays: 40, isFirstOfDay: false, isFirstOfWeek: false })).toBe(false);
    });
    it('keeps one per week after daily window', () => {
        expect(shouldKeepVersion({ ageDays: 180, isFirstOfDay: false, isFirstOfWeek: true })).toBe(true);
    });
});
