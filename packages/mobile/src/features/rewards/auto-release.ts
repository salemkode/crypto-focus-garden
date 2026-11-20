import { z } from 'zod';
import { parseTree } from '@focus-garden/protocol/forest';
import { NETWORKS } from '@focus-garden/protocol/network';
import { NETWORK } from '../../services/network';

/**
 * Automatic release of a grown tree to the user's own wallet (the hybrid model): the app wallet
 * only pays the fee and signs, and the NFT goes straight to the linked wallet.
 *
 * Nothing is spent from a background refresh on its own. A release runs only under a consent the
 * user gave when they tapped Plant, and each consent covers exactly one tree: the same linked
 * wallet, network and lock length, planted within minutes of that tap, at no more than the
 * approved network fee. A consent is used once, before the claim starts, so an interrupted or
 * ambiguous claim is never retried automatically; the saved-operation guard takes over.
 */
export const RELEASE_FEE_CEILING_SATS = 2000;
/** How long after the Plant tap the planting transaction may be recorded on chain. */
export const PLANT_WINDOW_MS = 15 * 60 * 1000;

export const consentSchema = z.object({
  id: z.string().min(1),
  network: z.enum(NETWORKS),
  /** Locking bytecode (hex) of the user's linked wallet: the only allowed destination. */
  recipientBytecode: z.string().regex(/^[0-9a-f]+$/),
  units: z.number().int().positive(),
  feeCeilingSats: z.number().int().positive(),
  approvedAt: z.number().int().positive(),
  /** The tree this consent was spent on, once a release starts. */
  usedFor: z.string().nullable(),
});
export type ReleaseConsent = z.infer<typeof consentSchema>;
export const consentsSchema = z.array(consentSchema);

export interface ReleasableSession { commitment: string; state: string; plantedAt: number }

export function newConsent(input: { id: string; recipientBytecode: string; units: number; approvedAt: number }): ReleaseConsent {
  return consentSchema.parse({ ...input, recipientBytecode: input.recipientBytecode.toLowerCase(), network: NETWORK, feeCeilingSats: RELEASE_FEE_CEILING_SATS, usedFor: null });
}

/** The next tree to release and the consent that covers it, or null. One at a time. */
export function nextRelease(consents: readonly ReleaseConsent[], sessions: readonly ReleasableSession[], options: { networkFeeSats: number; busy: boolean }) {
  if (options.busy) return null;
  const used = new Set(consents.map((consent) => consent.usedFor).filter(Boolean));
  for (const session of [...sessions].sort((a, b) => a.plantedAt - b.plantedAt)) {
    if (session.state !== 'claimable' || used.has(session.commitment)) continue;
    const tree = parseTree(session.commitment);
    if (!tree || tree.merged) continue;
    const consent = consents.find((candidate) => candidate.usedFor === null
      && candidate.network === NETWORK
      && candidate.recipientBytecode === tree.ownerBytecode.toLowerCase()
      && candidate.units === tree.units
      && options.networkFeeSats <= candidate.feeCeilingSats
      && session.plantedAt >= candidate.approvedAt - 60_000
      && session.plantedAt <= candidate.approvedAt + PLANT_WINDOW_MS);
    if (consent) return { commitment: session.commitment, consent };
  }
  return null;
}

/** Marks a consent as spent on one tree. Returns the same list if it was already spent. */
export function spendConsent(consents: readonly ReleaseConsent[], id: string, commitment: string): ReleaseConsent[] {
  return consents.map((consent) => consent.id === id && consent.usedFor === null ? { ...consent, usedFor: commitment } : consent);
}
