import { assertSuccess, cashAddressToLockingBytecode, decodeCashAddress, encodeCashAddress } from '@bitauth/libauth';
import { z } from 'zod';

export function addressToLockScript(address: string) {
  return assertSuccess(cashAddressToLockingBytecode(address)).bytecode;
}

export function toTokenAddress(address: string) {
  const decoded = assertSuccess(decodeCashAddress(address));
  const type = decoded.type === 'p2pkh' ? 'p2pkhWithTokens' : decoded.type === 'p2sh' ? 'p2shWithTokens' : decoded.type;
  return assertSuccess(encodeCashAddress({ ...decoded, type })).address;
}

export function decToHexWithEndianSwap(value: number, width = 3) {
  z.number().int().min(1).max(6).parse(width);
  z.number().int().nonnegative().max(2 ** (width * 8) - 1).parse(value);
  return value.toString(16).padStart(width * 2, '0').match(/../g)!.reverse().join('');
}
