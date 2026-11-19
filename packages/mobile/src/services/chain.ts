import { ElectrumNetworkProvider } from 'cashscript';
import { chainReader, type ChainReader } from '@focus-garden/protocol/chain';
import { GardenTransactionError } from '@focus-garden/protocol';
import { ELECTRUM_HOSTS, NETWORK } from './network';

/**
 * One shared connection to a public Electrum server. If a server stops answering, the next one in
 * the list is tried. Servers are not trusted: transactions are checked against their ids and
 * everything signed is rebuilt from them (see @focus-garden/protocol/chain).
 */
let provider: ElectrumNetworkProvider | null = null;
let connecting: Promise<ElectrumNetworkProvider> | null = null;
let hostIndex = 0;
const TIMEOUT_MS = 20_000;

async function connected() {
  if (provider) return provider;
  connecting ??= (async () => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < ELECTRUM_HOSTS.length; attempt += 1) {
      const hostname = ELECTRUM_HOSTS[(hostIndex + attempt) % ELECTRUM_HOSTS.length]!;
      const candidate = new ElectrumNetworkProvider(NETWORK, { hostname, manualConnectionManagement: true });
      try {
        await withTimeout(candidate.connect());
        hostIndex = (hostIndex + attempt) % ELECTRUM_HOSTS.length;
        provider = candidate;
        return candidate;
      } catch (cause) {
        lastError = cause;
        void candidate.disconnect().catch(() => undefined);
      }
    }
    throw new GardenTransactionError({ message: `Could not reach Bitcoin Cash. Check your connection and try again.${__DEV__ ? ` (${String(lastError)})` : ''}` });
  })().finally(() => { connecting = null; });
  return connecting;
}

function withTimeout<T>(work: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GardenTransactionError({ message: 'Bitcoin Cash did not answer in time. Try again.' })), TIMEOUT_MS);
    work.then((value) => { clearTimeout(timer); resolve(value); }, (cause: unknown) => { clearTimeout(timer); reject(cause); });
  });
}

/** Server-side refusals (a rule, a missing coin) are answers, not connection problems. */
function isAnswer(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /rule|reject|missing|conflict|no such|not found|unknown|invalid|dust|fee|spent|mempool/i.test(message);
}

async function request(method: string, ...params: (string | number | boolean)[]): Promise<unknown> {
  const current = await connected();
  try {
    return await withTimeout(current.performRequest(method, ...params));
  } catch (cause) {
    if (!isAnswer(cause) && provider === current) {
      // Drop this server; the next call connects to the next one.
      provider = null;
      hostIndex = (hostIndex + 1) % ELECTRUM_HOSTS.length;
      void current.disconnect().catch(() => undefined);
    }
    throw cause;
  }
}

export const chain: ChainReader = chainReader(request);
