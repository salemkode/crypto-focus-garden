import { binToHex, hexToBin, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { z } from 'zod';
import type { ElectrumNetworkProvider } from 'cashscript';
import { GardenTransactionError } from '@focus-garden/protocol';

export async function sessionMaturity(provider: Pick<ElectrumNetworkProvider, 'performRequest' | 'getBlockHeight'>, contractAddress: string, txid: string, duration: number) {
  const decoded = cashAddressToLockingBytecode(contractAddress);
  if (typeof decoded === 'string') throw new GardenTransactionError({ message: decoded });
  const { sha256 } = await import('@bitauth/libauth');
  const scriptHash = binToHex(sha256.hash(decoded.bytecode).reverse());
  const history = z.array(z.object({ tx_hash: z.string(), height: z.number().int() })).parse(await provider.performRequest('blockchain.scripthash.get_history', scriptHash));
  const confirmed = history.find((entry) => entry.tx_hash === txid && entry.height > 0);
  if (!confirmed) return 'confirming' as const;
  const tip = await provider.getBlockHeight();
  async function median(height: number) {
    const times = await Promise.all(Array.from({ length: 11 }, (_, i) => height - i).map(async (block) => {
      if (block < 0) throw new GardenTransactionError({ message: 'Insufficient header history.' });
      const raw = z.string().regex(/^[0-9a-f]{160}$/i).parse(await provider.performRequest('blockchain.block.header', block));
      const bytes = hexToBin(raw);
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(68, true);
    }));
    return times.sort((a, b) => a - b)[5];
  }
  const [origin, current] = await Promise.all([median(confirmed.height - 1), median(tip)]);
  return current >= origin + duration ? 'claimable' as const : 'locked' as const;
}
