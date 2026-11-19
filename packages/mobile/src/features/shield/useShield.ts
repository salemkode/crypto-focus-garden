import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { router } from 'expo-router';
import { FocusShield, type ShieldStatus } from 'focus-shield';

/** Live app-blocking status plus the one-tap setup steps for each platform. */
export function useShield() {
  const [status, setStatus] = useState<ShieldStatus | null>(null);
  /** Why iOS couldn't grant Screen Time, when it failed for a reason other than "Don't Allow". */
  const [error, setError] = useState<string | null>(null);
  /** Bumped after the picker closes so the chosen-apps list redraws. */
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => FocusShield.getStatus().then(setStatus).catch(() => setStatus(null)), []);
  useEffect(() => {
    void refresh();
    // Permissions are granted in system Settings; re-check when the user comes back.
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => listener.remove();
  }, [refresh]);

  const ready = Boolean(status?.supported && status.authorized && status.selectionCount > 0 && (Platform.OS !== 'android' || status.overlay));
  /** The next missing step, in order, or null when blocking is fully set up. */
  const nextStep = !status?.supported ? 'unsupported' as const
    : !status.authorized ? 'authorize' as const
    : Platform.OS === 'android' && !status.overlay ? 'overlay' as const
    : status.selectionCount === 0 ? 'choose' as const
    : null;

  async function chooseApps() {
    if (Platform.OS === 'ios') { await FocusShield.pickApps().catch(() => 0); setRevision((value) => value + 1); await refresh(); }
    else router.push('/blocked-apps');
  }
  async function continueSetup() {
    if (nextStep === 'authorize') {
      if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
        // The guard runs as a visible foreground service; ask for its notification first.
        await PermissionsAndroid.request('android.permission.POST_NOTIFICATIONS').catch(() => undefined);
      }
      setError(null);
      try { await FocusShield.requestAuthorization(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    } else if (nextStep === 'overlay') await FocusShield.openOverlaySettings();
    else if (nextStep === 'choose') await chooseApps();
    await refresh();
  }
  const stepLabel = {
    unsupported: status?.pendingApproval ? 'App blocking on iPhone turns on once Apple approves it for Focus Garden.' : 'App blocking needs the iOS or Android app.',
    authorize: Platform.OS === 'ios' ? 'Allow Screen Time access' : 'Allow usage access',
    overlay: 'Allow Focus Garden to return in front',
    choose: 'Choose apps to block',
  } as const;
  /** The blocking hub: the switch, setup, and the chosen apps. */
  const manage = () => router.push('/blocked-apps');
  return { status, ready, nextStep, stepLabel: nextStep ? stepLabel[nextStep] : null, error, revision, continueSetup, chooseApps, manage, refresh };
}
