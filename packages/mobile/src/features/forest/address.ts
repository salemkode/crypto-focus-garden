import { assertSuccess, hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import { PREFIX } from '../../services/network';

export function rewardAddressOf(ownerBytecode: string) {
  return assertSuccess(lockingBytecodeToCashAddress({ bytecode: hexToBin(ownerBytecode), prefix: PREFIX })).address;
}
