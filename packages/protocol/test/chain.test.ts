import { describe, expect, test } from 'bun:test';
import { chainReader } from '../src/chain';

/** 11 fake 80-byte headers, every timestamp `time`. */
function headers(time: number) {
  const bytes = new Uint8Array(80 * 11);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < 11; index += 1) view.setUint32(index * 80 + 68, time, true);
  return Buffer.from(bytes).toString('hex');
}

describe('chain reader median time', () => {
  test('re-reads recent blocks, so a reorganization cannot leave a stale time; caches settled ones', async () => {
    let time = 1_000;
    const calls: number[] = [];
    const reader = chainReader(async (method, ...params) => {
      if (method === 'blockchain.headers.get_tip') return { height: 100 };
      if (method === 'blockchain.block.headers') { calls.push(Number(params[0]) + 10); return { hex: headers(time), count: 11 }; }
      throw new Error(`unexpected ${method}`);
    });
    await reader.tipHeight();

    expect(await reader.medianTimePast(99)).toBe(1_000);
    time = 2_000; // block 99 was replaced
    expect(await reader.medianTimePast(99)).toBe(2_000);

    expect(await reader.medianTimePast(80)).toBe(2_000);
    time = 3_000;
    expect(await reader.medianTimePast(80)).toBe(2_000);
    expect(calls).toEqual([99, 99, 80]);
  });
});
