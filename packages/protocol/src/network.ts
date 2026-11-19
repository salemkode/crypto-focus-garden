import { binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { z } from 'zod';

/**
 * Where Focus Garden lives. There is no server: the app reads and writes the shared contracts
 * directly through public Electrum (Fulcrum) servers. A deployment record pins the contracts.
 */
export type NetworkName = 'mainnet' | 'chipnet';
export const NETWORKS = ['mainnet', 'chipnet'] as const;
export const PREFIX = { mainnet: 'bitcoincash', chipnet: 'bchtest' } as const satisfies Record<NetworkName, string>;
export type Prefix = (typeof PREFIX)[NetworkName];

/** Public Fulcrum servers (WSS). The first one that answers is used. */
export const ELECTRUM_SERVERS: Record<NetworkName, readonly string[]> = {
  mainnet: ['bch.imaginary.cash', 'electroncash.de', 'bch.loping.net'],
  chipnet: ['chipnet.bch.ninja', 'chipnet.imaginary.cash'],
};

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const contract = z.object({
  category: hash,
  address: z.string(),
  tokenAddress: z.string(),
  lockingBytecode: z.string().regex(/^aa20[0-9a-f]{64}87$/),
});
const recordSchema = z.object({
  schema: z.literal('focus-garden-deployment-v1'),
  network: z.enum(NETWORKS),
  forest: contract,
  directory: contract.nullable().optional(),
});
export type ContractDeployment = z.infer<typeof contract>;
export interface Deployment {
  network: NetworkName;
  prefix: Prefix;
  forest: ContractDeployment;
  directory: ContractDeployment | null;
}

/** Reads a packages/contracts/deployments/<network>.json record and checks it is self-consistent. */
export function deploymentFromRecord(input: unknown): Deployment {
  const record = recordSchema.parse(input);
  const prefix = PREFIX[record.network];
  for (const entry of [record.forest, record.directory].filter((value) => value != null)) {
    for (const address of [entry.address, entry.tokenAddress]) {
      const decoded = cashAddressToLockingBytecode(address);
      if (typeof decoded === 'string' || !address.startsWith(`${prefix}:`) || binToHex(decoded.bytecode) !== entry.lockingBytecode) {
        throw new Error(`Deployment record for ${record.network} has an address that does not match its contract.`);
      }
    }
  }
  return { network: record.network, prefix, forest: record.forest, directory: record.directory ?? null };
}
