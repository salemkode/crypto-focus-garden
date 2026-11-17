/**
 * Replaces libauth's `vm/instruction-sets/bch/2025/bch-2025-consensus.js`.
 *
 * The original computes `bigIntRange.maxVmNumber = 2n ** 80_000n` at import time.
 * Hermes caps BigInts at ~65 471 bits, so that line throws
 * `RangeError: Maximum BigInt size exceeded` while loading libauth. `bigIntRange`
 * is not used anywhere inside libauth (it is only a public export), so it is
 * exposed lazily here; everything else is identical to the original module.
 */
// Resolved to the original file: Metro does not redirect imports made from this shim.
import { ConsensusBch2023 } from '@bitauth/libauth/build/lib/vm/instruction-sets/bch/2023/bch-2023-consensus.js';

export const ConsensusBch2025Overrides = {
  maximumStackItemLength: 10_000,
  maximumVmNumberByteLength: 10_000,
};

const computeMaxVmNumber = () => {
  const base = 2n;
  const maxLength = BigInt(ConsensusBch2025Overrides.maximumVmNumberByteLength);
  const bytes = 8n;
  const signed = 2n;
  try {
    // Same expression as libauth (including its operator precedence).
    return base ** (maxLength * bytes) - 1n / signed;
  } catch (error) {
    throw new RangeError(
      `bigIntRange cannot be represented on this JavaScript engine (Hermes limits BigInts to ~65 471 bits): ${String(error)}`
    );
  }
};

let cachedMaxVmNumber: bigint | undefined;
const maxVmNumber = () => (cachedMaxVmNumber ??= computeMaxVmNumber());

export const bigIntRange = {
  get maxVmNumber() {
    return maxVmNumber();
  },
  get minVmNumber() {
    return -maxVmNumber();
  },
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const ConsensusBch2025 = {
  ...ConsensusBch2023,
  ...ConsensusBch2025Overrides,
};

type OperationMetrics = {
  arithmeticCost: number;
  evaluatedInstructionCount: number;
  hashDigestIterations: number;
  signatureCheckCount: number;
  stackPushedBytes: number;
};

export const measureOperationCost = (
  metrics: OperationMetrics,
  {
    baseInstructionCost = ConsensusBch2025.baseInstructionCost,
    hashDigestIterationCost = ConsensusBch2025.hashDigestIterationCostStandard,
    signatureCheckCost = ConsensusBch2025.signatureCheckCost,
  }: { baseInstructionCost?: number; hashDigestIterationCost?: number; signatureCheckCost?: number } = {}
) =>
  metrics.evaluatedInstructionCount * baseInstructionCost +
  metrics.signatureCheckCount * signatureCheckCost +
  metrics.hashDigestIterations * hashDigestIterationCost +
  metrics.arithmeticCost +
  metrics.stackPushedBytes;
