import { z } from 'zod';
import { GardenTransactionError } from '@focus-garden/protocol';

export function resolveGardenEndpoint(input: { configured?: string; development: boolean; allowLocalTestHttp: boolean }) {
  if (!input.configured) throw new GardenTransactionError({ message: 'Garden service is not connected yet.' });
  const parsed = z.url().safeParse(input.configured);
  if (!parsed.success) throw new GardenTransactionError({ message: 'The garden service address is invalid.' });
  const url = new URL(parsed.data);
  if (url.username || url.password || url.search || url.hash) throw new GardenTransactionError({ message: 'Use a service address without credentials, query parameters or fragments.' });
  const localTest = input.development && input.allowLocalTestHttp && url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) && url.port === '3487' && url.pathname === '/';
  if (url.protocol !== 'https:' && !localTest) throw new GardenTransactionError({ message: 'Configure HTTPS. A debug-only test session may use the local service on loopback port 3487.' });
  return parsed.data.replace(/\/$/, '');
}
