import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    VERSION_RETENTION_ALL_DAYS: 30,
    VERSION_RETENTION_DAILY_DAYS: 90,
    VERSION_RETENTION_MAX_DAYS: 3650,
  },
}));

import { selectVersionIdsToDelete, shouldKeepVersion } from '../../src/modules/versions/version-retention.js';

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

  it('selects deletions according to day/week windows', () => {
    const now = new Date('2026-03-03T00:00:00.000Z');
    const versions = [
      { id: 'v1', createdAt: new Date('2026-02-28T10:00:00.000Z') },
      { id: 'v2', createdAt: new Date('2026-01-10T09:00:00.000Z') },
      { id: 'v3', createdAt: new Date('2026-01-10T08:00:00.000Z') },
      { id: 'v4', createdAt: new Date('2025-06-10T09:00:00.000Z') },
      { id: 'v5', createdAt: new Date('2025-06-11T09:00:00.000Z') },
      { id: 'v6', createdAt: new Date('2010-01-01T00:00:00.000Z') },
    ];

    const toDelete = selectVersionIdsToDelete(versions, now);
    expect(toDelete).toContain('v3');
    expect(toDelete).toContain('v6');
    expect(toDelete).not.toContain('v1');
    expect(toDelete).not.toContain('v2');
  });
});
