export type DiffLineKind = 'equal' | 'add' | 'remove';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  leftNo: number | null;
  rightNo: number | null;
}

/**
 * Simple line-based LCS diff — good enough for Canvas version compare
 * without pulling a heavy dependency.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let leftNo = 1;
  let rightNo = 1;

  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ kind: 'equal', text: a[i], leftNo: leftNo++, rightNo: rightNo++ });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ kind: 'remove', text: a[i], leftNo: leftNo++, rightNo: null });
      i++;
    } else {
      result.push({ kind: 'add', text: b[j], leftNo: null, rightNo: rightNo++ });
      j++;
    }
  }
  while (i < n) {
    result.push({ kind: 'remove', text: a[i++], leftNo: leftNo++, rightNo: null });
  }
  while (j < m) {
    result.push({ kind: 'add', text: b[j++], leftNo: null, rightNo: rightNo++ });
  }
  return result;
}
