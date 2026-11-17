import { z } from "zod";
import { TREE_COMMITMENT } from "@focus-garden/protocol/forest";

const session = z.object({
  commitment: z.string().regex(TREE_COMMITMENT),
  plantedAt: z.number().int().positive(),
  releaseAt: z.number().int().positive(),
  duration: z.number().int().nonnegative().max(24 * 512).refine((seconds) => seconds % 512 === 0),
  confirmations: z.number().int().nonnegative().default(0),
  claimedAt: z.number().int().positive().nullable().default(null),
  plantTxid: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
  claimTxid: z.string().regex(/^[0-9a-f]{64}$/).nullable().default(null),
  state: z.enum(["confirming", "locked", "claimable", "claimed", "claiming", "merging", "transferred"]),
});
export const gardenSchema = z.object({
  network: z.literal("chipnet"),
  minimumConfirmations: z.number().int().min(2).max(144).default(6),
  creditSatoshis: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sessions: z.array(session),
}).superRefine((garden, context) => {
  if (new Set(garden.sessions.map((entry) => entry.commitment.toLowerCase())).size !== garden.sessions.length) {
    context.addIssue({ code: 'custom', message: 'Duplicate reward history must not create extra trees.' });
  }
  garden.sessions.forEach((entry, index) => {
    if (entry.state === 'claimed' && entry.confirmations < garden.minimumConfirmations) context.addIssue({ code: 'custom', path: ['sessions', index, 'confirmations'], message: 'A claimed tree requires the configured confirmation depth.' });
    if (entry.releaseAt < entry.plantedAt + entry.duration * 1000) {
      context.addIssue({ code: 'custom', path: ['sessions', index, 'releaseAt'], message: 'Release estimate cannot bypass the contract relative delay.' });
    }
  });
});

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
export async function loadGarden(
  internalAddress: string,
) {
  const endpoint = process.env.EXPO_PUBLIC_GARDEN_API_URL;
  if (!endpoint) return { state: "unconfigured" as const };
  const { rpc, verifyWallet } = await import("./transactions");
  await verifyWallet(internalAddress);
  const data = await rpc({ method: 'garden', wallet: internalAddress });
  return {
    state: "connected" as const,
    ...gardenSchema.parse(data),
  };
}

const cacheIdentity = z.object({ address: z.string().startsWith('bchtest:'), category: z.string().regex(/^[0-9a-f]{64}$/), checkpointHash: z.string().regex(/^[0-9a-f]{64}$/) });
export const cachedGardenSchema = z.object({ checkedAt: z.number().int().positive(), garden: gardenSchema });
export function gardenCacheKey(identity: z.input<typeof cacheIdentity>) {
  const parsed = cacheIdentity.safeParse(identity);
  if (!parsed.success) return null;
  return `focusgarden.verified.garden.v1:${parsed.data.address}:${parsed.data.category}:${parsed.data.checkpointHash}`;
}
