import { expect, test } from 'bun:test';
import { binToHex, encodeLockingBytecodeP2pkh, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { sessionMaturity } from '../src/maturity';
const address = lockingBytecodeToCashAddress({ bytecode: encodeLockingBytecodeP2pkh(new Uint8Array(20)), prefix: 'bchtest' });
if (typeof address === 'string') throw new Error(address);
function provider(tip: number, height: number) {
  return {
    async getBlockHeight() { return tip; },
    async performRequest(name: string, ...args: (string | number | boolean)[]) {
      if (name === 'blockchain.scripthash.get_history') return [{ tx_hash: 'ab'.repeat(32), height }];
      const header = new Uint8Array(80);
      new DataView(header.buffer).setUint32(68, 1800000000 + Number(args[0]) * 512, true);
      return binToHex(header);
    },
  };
}
test('uses confirmation MTP and tip MTP rather than phone time or a mempool timestamp', async () => {
  expect(await sessionMaturity(provider(101, 0), address.address, 'ab'.repeat(32), 1536)).toBe('confirming');
  expect(await sessionMaturity(provider(101, 100), address.address, 'ab'.repeat(32), 1536)).toBe('locked');
  expect(await sessionMaturity(provider(102, 100), address.address, 'ab'.repeat(32), 1536)).toBe('claimable');
  expect(await sessionMaturity(provider(102, 100), address.address, 'ab'.repeat(32), 3072)).toBe('locked');
});
