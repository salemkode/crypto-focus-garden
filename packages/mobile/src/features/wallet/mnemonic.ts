import { decodeBip39Mnemonic } from '@bitauth/libauth';
import * as Data from 'effect/Data';
import { z } from 'zod';

export class WalletInitializationError extends Data.TaggedError('WalletInitializationError')<{ message: string }> {}
export const recoveryPhraseSchema = z.string().min(1).max(512)
  .transform((value) => value.normalize('NFKD').trim().toLowerCase().replace(/\s+/gu, ' '))
  .superRefine((value, context) => {
    if (typeof decodeBip39Mnemonic(value) === 'string') context.addIssue({ code: 'custom', message: 'Enter a valid English recovery phrase. Check the words and their order.' });
  });
