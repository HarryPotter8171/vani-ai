/**
 * memoryPrefs — pin/temp local store + orphan cleanup
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAllMemoryPrefs,
  forgetMemoryPrefIds,
  getMemoryPrefs,
  setMemoryTemporary,
  toggleMemoryPinned,
} from '@/lib/memoryPrefs';

describe('memoryPrefs', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('forgets pin and temporary prefs for deleted ids', () => {
    toggleMemoryPinned('a');
    toggleMemoryPinned('b');
    setMemoryTemporary('a', 7);
    setMemoryTemporary('c', 7);

    const next = forgetMemoryPrefIds(['a', 'c']);
    expect(next.pinnedIds).toEqual(['b']);
    expect(next.temporary.a).toBeUndefined();
    expect(next.temporary.c).toBeUndefined();
    expect(getMemoryPrefs().pinnedIds).toEqual(['b']);
  });

  it('clearAllMemoryPrefs wipes local store', () => {
    toggleMemoryPinned('x');
    setMemoryTemporary('y', 3);
    clearAllMemoryPrefs();
    expect(getMemoryPrefs()).toEqual({ pinnedIds: [], temporary: {} });
  });
});
