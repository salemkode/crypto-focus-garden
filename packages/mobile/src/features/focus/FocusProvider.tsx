import * as Data from 'effect/Data';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Storage from 'expo-sqlite/kv-store';
import { FocusShield } from 'focus-shield';
import {
  configure as configureGarden, dismiss as dismissGarden, gardenSchema, giveUp as giveUpGarden, heartbeat, initialGarden,
  leave, migrateLegacy, plant as plantGarden, restoreGarden, returnTo, settleGarden, type FocusGarden,
} from './session';

const STORAGE_KEY = 'focus-garden-v2';
// The v1 practice-timer record is read for migration only and never overwritten.
const LEGACY_KEY = 'focus-garden-v1';
const HEARTBEAT_MS = 5_000;
const KEEP_AWAKE_TAG = 'focus-garden-growing';

async function loadGarden(now: number) {
  const saved = await Storage.getItem(STORAGE_KEY);
  if (saved) return restoreGarden(gardenSchema.parse(JSON.parse(saved)), now);
  const legacy = await Storage.getItem(LEGACY_KEY);
  return legacy ? migrateLegacy(JSON.parse(legacy)) : sampleGarden(initialGarden(), now);
}

/**
 * Measurement builds only: bundled with EXPO_PUBLIC_VALLEY_SAMPLE=<n>, a phone with no saved garden
 * starts with n grown sessions (mixed lengths and species) so the valley can be profiled on device.
 * Never touches an existing garden; normal builds leave the variable unset.
 */
function sampleGarden(garden: FocusGarden, now: number): FocusGarden {
  const count = Number(process.env.EXPO_PUBLIC_VALLEY_SAMPLE ?? 0);
  if (!(count > 0)) return garden;
  const species = ['oak', 'pine', 'birch', 'cherry', 'maple', 'cashtree'] as const;
  const lengths = [512, 1024, 1536, 2048, 2560, 3072, 3584];
  const records = Array.from({ length: Math.min(count, 200) }, (_, i): FocusGarden['records'][number] => {
    const duration = lengths[(i * 3) % lengths.length], endedAt = now - (count - i) * 3_600_000;
    return { id: `sample-${i}`, duration, species: species[i % species.length], tag: 'focus', startedAt: endedAt - duration * 1000, endedAt, outcome: 'grown', reason: null };
  });
  return { ...garden, records };
}

function useGardenStore() {
  const [garden, setGarden] = useState<FocusGarden>(initialGarden);
  const [storage, setStorage] = useState<'loading' | 'ready' | 'error'>('loading');
  const [now, setNow] = useState(Date.now);
  const lastBeat = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    loadGarden(Date.now()).then((restored) => {
      if (controller.signal.aborted) return;
      setGarden(restored);
      setStorage('ready');
    }).catch(() => {
      // Keep failed/corrupt storage intact rather than replacing a saved garden.
      if (!controller.signal.aborted) setStorage('error');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (storage !== 'ready') return;
    Storage.setItem(STORAGE_KEY, JSON.stringify(garden)).catch(() => setStorage('error'));
  }, [garden, storage]);

  useEffect(() => {
    const ready = storage === 'ready';
    function tick() {
      const time = Date.now();
      setNow(time);
      if (!ready) return;
      setGarden((current) => {
        const settled = settleGarden(current, time);
        if (settled !== current || time - lastBeat.current < HEARTBEAT_MS) return settled;
        lastBeat.current = time;
        return heartbeat(settled, time);
      });
    }
    // On-chain sessions also need a foreground clock even without a local tree.
    const interval = setInterval(() => { if (AppState.currentState === 'active') tick(); }, 1000);
    const listener = AppState.addEventListener('change', (state) => {
      const time = Date.now();
      if (state === 'active') setNow(time);
      if (!ready) return;
      // `inactive` (control centre, incoming call sheet) is not leaving the app.
      if (state === 'background') setGarden((current) => leave(current, time));
      if (state === 'active') setGarden((current) => returnTo(current, time));
    });
    return () => { clearInterval(interval); listener.remove(); };
  }, [storage]);

  const growing = garden.timer.status === 'growing';
  const shieldUntil = garden.timer.status === 'growing' && garden.blockApps ? garden.timer.endsAt : null;
  useEffect(() => {
    if (storage !== 'ready') return;
    // Apply the user's app shield only while a tree grows; lift it the moment the tree
    // is grown, withered or given up (and on launch if a shield outlived its session).
    if (shieldUntil !== null) FocusShield.start(shieldUntil).catch(() => undefined);
    else FocusShield.stop().catch(() => undefined);
  }, [shieldUntil, storage]);

  useEffect(() => {
    if (!growing) return;
    // Auto-lock would otherwise count as leaving the app during a long session.
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => { deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined); };
  }, [growing]);

  // The actions read only `storage`, so they keep their identity while the clock ticks.
  const actions = useMemo(() => {
    function update(change: (current: FocusGarden, time: number) => FocusGarden) {
      if (storage !== 'ready') return;
      const time = Date.now();
      setNow(time);
      setGarden((current) => change(current, time));
    }
    return {
      plant: () => update((current, time) => plantGarden(current, time, crypto.randomUUID())),
      giveUp: () => update(giveUpGarden),
      dismiss: () => update(dismissGarden),
      configure: (change: Parameters<typeof configureGarden>[1]) => update((current) => configureGarden(current, change)),
    };
  }, [storage]);
  return { garden, storage, now, actions };
}

type FocusStore = Pick<ReturnType<typeof useGardenStore>, 'garden' | 'storage'> & ReturnType<typeof useGardenStore>['actions'];

class MissingFocusProvider extends Data.TaggedError('MissingFocusProvider') {}

const FocusContext = createContext<FocusStore | null>(null);
/** The one-second clock, apart from the garden, so only components that call `useNow` tick with it. */
const ClockContext = createContext(0);

export function FocusProvider({ children }: { children: ReactNode }) {
  const { garden, storage, now, actions } = useGardenStore();
  const value = useMemo((): FocusStore => ({ garden, storage, ...actions }), [garden, storage, actions]);
  return <FocusContext.Provider value={value}><ClockContext.Provider value={now}>{children}</ClockContext.Provider></FocusContext.Provider>;
}
/**
 * The current time, ticking every second. Only components that call this re-render with the clock;
 * screens that never read it (a hidden Profile tab, an open sheet) stay still.
 */
export function useNow() {
  return useContext(ClockContext);
}
export function useFocusGarden() {
  const value = useContext(FocusContext);
  if (!value) throw new MissingFocusProvider();
  return value;
}
