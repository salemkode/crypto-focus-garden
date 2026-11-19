import { clientPrefix } from '../../services/network';
import { assertSuccess, hexToBin, lockingBytecodeToCashAddress } from '@bitauth/libauth';

export function rewardAddressOf(ownerBytecode: string) {
  return assertSuccess(lockingBytecodeToCashAddress({ bytecode: hexToBin(ownerBytecode), prefix: clientPrefix })).address;
}
