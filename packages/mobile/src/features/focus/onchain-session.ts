import { z } from 'zod';
import { gardenSchema } from '../../services/garden';

/** The tree currently in motion on chain: growing, being claimed or being merged. Matured trees simply wait in the forest. */
export function onchainSessionView(sessions: z.infer<typeof gardenSchema>['sessions'], now: number) {
  const session = sessions.find((entry) => entry.state === 'confirming' || entry.state === 'locked')
    ?? sessions.find((entry) => entry.state === 'claiming' || entry.state === 'merging');
  if (!session) return null;
  const remaining = Math.max(0, Math.ceil((session.releaseAt - now) / 1000));
  const status = {
    confirming: 'Waiting for chain confirmations. Your tree is saved.',
    locked: 'The blockchain lock is running. It continues while this app is closed.',
    claimable: 'This tree has matured in the contract.',
    claiming: 'Your claim is awaiting confirmation. Do not prepare a replacement.',
    merging: 'Your merge is awaiting confirmation. Do not prepare a replacement.',
    claimed: 'Tree confirmed in your wallet.',
    transferred: 'Tree moved from its original receive output.',
  };
  const progress = session.state === 'confirming' || session.duration === 0 ? 0 : Math.max(0, Math.min(1, 1 - remaining / session.duration));
  return { session, remaining, progress, message: status[session.state] };
}
