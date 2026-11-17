import { assertSuccess, encodeCashAddress, hash160, hexToBin, secp256k1 } from '@bitauth/libauth';
import { SignatureTemplate } from 'cashscript';

// Public test vectors only. Never fund these keys on a real network.
function fixture(digit: string) {
  const secret = hexToBin(digit.repeat(64));
  const pkh = hash160(assertSuccess(secp256k1.derivePublicKeyCompressed(secret)));
  return { pkh, address: assertSuccess(encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: pkh })).address, signer: new SignatureTemplate(secret) };
}

const alice = fixture('1');
const bob = fixture('2');
const charlie = fixture('3');
export const aliceAddress = alice.address;
export const alicePkh = alice.pkh;
export const aliceSigTemplate = alice.signer;
export const bobAddress = bob.address;
export const bobPkh = bob.pkh;
export const bobSigTemplate = bob.signer;
export const charliePkh = charlie.pkh;
