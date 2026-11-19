import { z } from "zod";

// A planting transaction consumes 3,000 sats (2,000 fee + 1,000 deposit).
// Leave one >=4,000-sat change UTXO to pay for release with the current SDK.
export const CREDIT_POLICY = {
  network: "chipnet",
  plantingGrantSatoshis: 8000,
  releaseGrantSatoshis: 4000,
  dailyAccountLimitSatoshis: 16000,
} as const;
const creditRequest = z.object({
  authenticatedAccountId: z.string().min(1),
  deviceWalletOwnershipVerified: z.literal(true),
  action: z.enum(["plant", "claim"]),
  largestAvailablePlainUtxoSatoshis: z.number().int().nonnegative(),
  grantedTodaySatoshis: z.number().int().nonnegative(),
  reservedTodaySatoshis: z.number().int().nonnegative(),
  remainingTreasuryBudgetSatoshis: z.number().int().nonnegative(),
  unresolvedGrant: z.boolean(),
});
export function decideTransactionCredit(
  request: z.input<typeof creditRequest>,
) {
  const input = creditRequest.parse(request);
  if (input.unresolvedGrant)
    return { state: "pending" as const, grantSatoshis: 0 };
  const grantSatoshis =
    input.action === "plant"
      ? CREDIT_POLICY.plantingGrantSatoshis
      : CREDIT_POLICY.releaseGrantSatoshis;
  if (input.largestAvailablePlainUtxoSatoshis >= grantSatoshis)
    return { state: "funded" as const, grantSatoshis: 0 };
  if (
    input.grantedTodaySatoshis + input.reservedTodaySatoshis + grantSatoshis >
    CREDIT_POLICY.dailyAccountLimitSatoshis
  )
    return { state: "daily_limit" as const, grantSatoshis: 0 };
  if (input.remainingTreasuryBudgetSatoshis < grantSatoshis)
    return { state: "budget_exhausted" as const, grantSatoshis: 0 };
  return { state: "eligible" as const, grantSatoshis };
}
