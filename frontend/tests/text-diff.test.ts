import { describe, expect, it } from 'vitest';
import { computeLineDiff } from '../src/utils/text-diff';

describe('computeLineDiff', () => {
  it('returns added and removed lines between snapshots', () => {
    const diff = computeLineDiff('alpha\nbeta', 'alpha\ngamma');
    expect(diff).toEqual([
      { type: 'equal', text: 'alpha' },
      { type: 'removed', text: 'beta' },
      { type: 'added', text: 'gamma' },
    ]);
  });
});
