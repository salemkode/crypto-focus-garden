import { z } from 'zod';
import { gardenSchema, readGarden } from '@focus-garden/protocol/garden';
import { parseRewardAddress } from '../wallet/address';
import { chain } from './chain';
import { DEPLOYMENT } from './network';

export { gardenSchema };

export function claimedSessions(sessions: z.infer<typeof gardenSchema>['sessions']) {
  return sessions.filter((entry) => entry.state === 'claimed');
}
/** Matured trees still in the contract (mergeable) plus trees claimed to the external wallet. */
export function forestTrees(sessions: z.infer<typeof gardenSchema>['sessions']) {
  return sessions.filter((entry) => entry.state === 'claimed' || entry.state === 'claimable');
}
/** Trees the contract can still merge: matured and not yet claimed. */
export function mergeableTrees(sessions: z.infer<typeof gardenSchema>['sessions']) {
  return sessions.filter((entry) => entry.state === 'claimable');
}

/** The garden of this app wallet, read from Bitcoin Cash. `linked` is the wallet that receives trees. */
export async function loadGarden(appAddress: string, linked: string | null) {
  const garden = await readGarden({
    chain,
    deployment: DEPLOYMENT,
    appLockingBytecode: parseRewardAddress(appAddress).lockingBytecode,
    ownerLockingBytecodes: linked ? [parseRewardAddress(linked).lockingBytecode] : [],
    nowMs: Date.now(),
  });
  return { state: 'connected' as const, ...garden };
}

const cacheIdentity = z.object({ address: z.string().min(1), category: z.string().regex(/^[0-9a-f]{64}$/) });
export const cachedGardenSchema = z.object({ checkedAt: z.number().int().positive(), garden: gardenSchema });
export function gardenCacheKey(identity: z.input<typeof cacheIdentity>) {
  const parsed = cacheIdentity.safeParse(identity);
  if (!parsed.success) return null;
  return `focusgarden.chain.garden.v1:${parsed.data.address}:${parsed.data.category}`;
}
