export type DiffLine = {
  type: 'equal' | 'added' | 'removed';
  text: string;
};

export function computeLineDiff(beforeText: string, afterText: string): DiffLine[] {
  const before = beforeText.split(/\r?\n/);
  const after = afterText.split(/\r?\n/);

  const rows = before.length + 1;
  const cols = after.length + 1;
  const lcs: number[][] = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (before[i - 1] === after[j - 1]) {
        lcs[i][j] = lcs[i - 1][j - 1] + 1;
      } else {
        lcs[i][j] = Math.max(lcs[i - 1][j], lcs[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = before.length;
  let j = after.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && before[i - 1] === after[j - 1]) {
      result.push({ type: 'equal', text: before[i - 1] });
      i -= 1;
      j -= 1;
      continue;
    }

    if (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j])) {
      result.push({ type: 'added', text: after[j - 1] });
      j -= 1;
      continue;
    }

    if (i > 0) {
      result.push({ type: 'removed', text: before[i - 1] });
      i -= 1;
    }
  }

  return result.reverse();
}
