import { useCallback, useEffect, useRef, useState } from 'react';
import Storage from 'expo-sqlite/kv-store';
import type { PlannedMerge } from '@focus-garden/garden/merge-plan';
import { mergesSchema, type StoredMerge } from './history';

const KEY = 'focus-garden.valley.merges.v1';

/**
 * Merges made on this phone. They are part of the valley's history (and move on chain with
 * contract v6). Unreadable storage is never overwritten.
 */
export function useStoredMerges() {
  const [merges, setMerges] = useState<StoredMerge[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const latest = useRef<StoredMerge[]>([]);

  useEffect(() => {
    let live = true;
    Storage.getItem(KEY).then((saved) => {
      if (!live) return;
      const parsed = saved ? mergesSchema.safeParse(JSON.parse(saved)) : { success: true as const, data: [] };
      if (!parsed.success) { setState('error'); return; }
      latest.current = parsed.data; setMerges(parsed.data); setState('ready');
    }).catch(() => { if (live) setState('error'); });
    return () => { live = false; };
  }, []);

  const record = useCallback((plan: readonly PlannedMerge[], at = Date.now()) => {
    if (state !== 'ready' || !plan.length) return;
    const next = [...latest.current, ...plan.map((merge, index) => ({ at: at + index, ingredients: [...merge.ingredients], result: { ...merge.result } }))];
    latest.current = next; setMerges(next);
    void Storage.setItem(KEY, JSON.stringify(next)).catch(() => setState('error'));
  }, [state]);

  return { merges, state, record };
}

const NOTE = (key: string) => `focus-garden.${key}`;
export async function readNote(key: string) { return (await Storage.getItem(NOTE(key))) ?? ''; }
export async function writeNote(key: string, text: string) {
  if (text.trim()) await Storage.setItem(NOTE(key), text.slice(0, 280)); else await Storage.removeItem(NOTE(key));
}
