import { createVirtualMachineBch2026, hexToBin } from '@bitauth/libauth';
import { z } from 'zod';
import { GardenTransactionError, chainIdentitySchema, address, decode, hex, intentSchema, ownershipContext, preparedSchema, resolvePrepared, transactionId, unsignedFingerprint } from '@focus-garden/protocol';
import { parseTree, planterTag } from '@focus-garden/protocol/forest';
import { observationSchema } from './chain';
import { Ledger, operationSchema } from './ledger';
import { lockingBytecode, outpoint, prepareGrant, prepareReward } from './transactions';
import type { NetworkProvider } from 'cashscript';

const requestSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('whoami') }),
  z.object({ method: z.literal('rebroadcast'), id: z.string().uuid() }),
  z.object({ method: z.literal('challenge'), wallet: address }),
  z.object({ method: z.literal('prove'), wallet: address, nonce: z.string().uuid(), unlockingBytecode: hex }),
  z.object({ method: z.literal('credit'), wallet: address, key: z.string().uuid(), action: z.enum(['plant', 'claim', 'merge', 'register']) }),
  z.object({ method: z.literal('leaderboard'), period: z.enum(['week', 'all']).default('week') }),
  z.object({ method: z.literal('profile'), wallet: address }),
  z.object({ method: z.literal('prepare'), wallet: address, key: z.string().uuid(), intent: intentSchema }),
  z.object({ method: z.literal('submit'), id: z.string().uuid(), raw: hex }),
  z.object({ method: z.literal('reconcile'), id: z.string().uuid() }),
  z.object({ method: z.literal('recover'), key: z.string().uuid().optional(), wallet: address.optional() }),
  z.object({ method: z.literal('garden'), wallet: address }),
]);
const profileSchema = z.object({ wallet: z.string(), account: z.string(), name: z.string(), about: z.string(), operation: z.string(), registeredAt: z.number() });
const WEEK_MS = 7 * 86_400_000;
function binToHexOf(wallet: string) {
  return Array.from(lockingBytecode(wallet), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
const sessionSchema = z.object({ commitment: z.string(), account: z.string(), wallet: z.string(), reward: z.string(), duration: z.number().int().nonnegative().max(24 * 512).refine((seconds) => seconds % 512 === 0), plantedAt: z.number(), plant: z.string(), claim: z.string().nullable(), mergedInto: z.string().nullable() });
export function createGardenService(config: {
  ledger: Ledger; minimumConfirmations: number; writesEnabled: boolean; chainIdentity: z.infer<typeof chainIdentitySchema>; provider: NetworkProvider; category: string; budget: number; dailyBudget?: number; treasuryKey?: string; directoryCategory?: string;
  observe: (txid: string) => Promise<z.infer<typeof observationSchema>>;
  rewardHeld: (txid: string, commitment: string, script: string) => Promise<boolean>;
  maturity: (txid: string, duration: number) => Promise<'confirming' | 'locked' | 'claimable'>;
}) {
  const { ledger, provider } = config;
  if (provider.network !== 'chipnet' || !Number.isSafeInteger(config.budget) || config.budget < 0) throw new GardenTransactionError({ message: 'Invalid chipnet service configuration.' });
  z.number().int().min(2).max(144).parse(config.minimumConfirmations);
  const vm = createVirtualMachineBch2026();
  async function reconcile(account: string, id: string) {
    const operation = ledger.operation(account, id);
    if (!operation.txid || !operation.raw) return operation;
    const observed = observationSchema.parse(await config.observe(operation.txid));
    const state = observed.state === 'confirmed' ? 'seen' : observed.state === 'confirming' || observed.state === 'mempool' ? 'confirming' : 'pending';
    ledger.db.transaction(() => {
      ledger.db.run('UPDATE operations SET state=? WHERE id=?', [state, id]);
      ledger.db.run('INSERT INTO observations VALUES(?,?,?,?,?,?) ON CONFLICT(operation) DO UPDATE SET state=excluded.state,confirmations=excluded.confirmations,blockHash=excluded.blockHash,blockTime=excluded.blockTime,checkedAt=excluded.checkedAt', [id, observed.state, observed.confirmations, observed.blockHash, observed.blockTime, Date.now()]);
      if (operation.state !== state) ledger.audit(account, `chain_state:${state}`, id);
    }).immediate();
    return { ...ledger.operation(account, id), confirmations: observed.confirmations, confirmedAt: observed.blockTime };
  }

  async function broadcast(account: string, id: string, raw: string) {
    const operation = ledger.operation(account, id);
    if (operation.raw) {
      if (operation.raw !== raw) throw new GardenTransactionError({ message: 'An operation cannot be replaced with a different transaction.' });
      return reconcile(account, id);
    }
    if (!config.writesEnabled) throw new GardenTransactionError({ message: 'The bounded Chipnet test-write route is not configured. Read-only recovery remains available.' });
    ledger.requireWrites();
    const txid = transactionId(raw);
    const started = ledger.db.transaction(() => {
      const latest = ledger.operation(account, id);
      if (latest.raw) {
        if (latest.raw !== raw) throw new GardenTransactionError({ message: 'An operation cannot be replaced.' });
        return false;
      }
      ledger.db.run("UPDATE operations SET state='pending',raw=?,txid=? WHERE id=?", [raw, txid, id]);
      return true;
    }).immediate();
    if (!started) return reconcile(account, id);
    try {
      const returned = await provider.sendRawTransaction(raw);
      if (returned === txid) return reconcile(account, id);
    } catch { /* Ambiguous: persist pending and reconcile by the recorded txid. */ }
    return ledger.operation(account, id);
  }
  function row(entry: z.infer<typeof sessionSchema>, plant: Awaited<ReturnType<typeof reconcile>>, claim: Awaited<ReturnType<typeof reconcile>> | null) {
    const claimedAt = claim && 'confirmedAt' in claim ? claim.confirmedAt ?? null : null;
    return { commitment: entry.commitment, plantedAt: entry.plantedAt, releaseAt: Math.max(entry.plantedAt, ('confirmedAt' in plant ? plant.confirmedAt : null) ?? entry.plantedAt) + entry.duration * 1000, claimedAt, duration: entry.duration, plantTxid: plant.txid, claimTxid: claim?.txid ?? null, confirmations: claim && 'confirmations' in claim ? claim.confirmations : 'confirmations' in plant ? plant.confirmations : 0 };
  }
  async function growing(account: string, entry: z.infer<typeof sessionSchema>) {
    if (entry.claim || entry.mergedInto) return false;
    const plant = await reconcile(account, entry.plant);
    return plant.state !== 'seen' || await config.maturity(plant.txid!, entry.duration) !== 'claimable';
  }
  /** A profile is public once its registration transaction reached the confirmation depth. */
  async function publicProfiles() {
    const rows = z.array(profileSchema).parse(ledger.db.query('SELECT * FROM profiles').all());
    const live = await Promise.all(rows.map(async (row) => (await reconcile(row.account, row.operation)).state === 'seen' ? row : null));
    return live.filter((row) => row !== null);
  }
  /** Tips go to the external reward wallet named in the member's most recent confirmed tree. */
  function tipAddressOf(wallet: string) {
    const latest = z.object({ reward: z.string() }).nullable().parse(ledger.db.query("SELECT s.reward FROM sessions s JOIN operations o ON o.id=s.plant WHERE s.wallet=? AND o.state='seen' ORDER BY s.plantedAt DESC LIMIT 1").get(wallet));
    return latest?.reward ?? null;
  }
  /**
   * Verified focus per member: every confirmed planted tree scores its tier's points
   * (Sprout 1, Tree 3, Big Tree 6, House 12). Merges keep value, so they never add points.
   */
  async function leaderboard(period: 'week' | 'all') {
    const since = period === 'week' ? Date.now() - WEEK_MS : 0;
    const profiles = await publicProfiles();
    const entries = profiles.map((profile) => {
      const planted = z.array(z.object({ commitment: z.string(), plantedAt: z.number() })).parse(ledger.db.query("SELECT s.commitment, s.plantedAt FROM sessions s JOIN operations o ON o.id=s.plant WHERE s.wallet=? AND s.duration>0 AND o.state='seen' AND s.plantedAt>=?").all(profile.wallet, since));
      const trees = planted.map((entry) => parseTree(entry.commitment)).filter((tree) => tree !== null);
      const best = trees.reduce((top, tree) => Math.max(top, tree.tier), 0);
      return { id: planterTag(binToHexOf(profile.wallet)), name: profile.name, about: profile.about, points: trees.reduce((sum, tree) => sum + tree.points, 0), trees: trees.length, bestTier: best, tipAddress: tipAddressOf(profile.wallet) };
    }).filter((entry) => entry.points > 0).sort((a, b) => b.points - a.points || b.trees - a.trees || a.name.localeCompare(b.name));
    return { period, entries: entries.slice(0, 100).map((entry, index) => ({ rank: index + 1, ...entry })) };
  }
  async function handle(account: string, input: z.input<typeof requestSchema>) {
    const request = requestSchema.parse(input);
    if (request.method === 'whoami') return { account, network: 'chipnet' as const, chainIdentity: chainIdentitySchema.parse(config.chainIdentity), category: config.category, writesEnabled: config.writesEnabled, minimumConfirmations: config.minimumConfirmations };
    if (request.method === 'leaderboard') return leaderboard(request.period);
    if (request.method === 'profile') {
      ledger.bound(account, request.wallet);
      const row = profileSchema.nullable().parse(ledger.db.query('SELECT * FROM profiles WHERE wallet=?').get(request.wallet));
      if (!row) return { state: 'none' as const };
      const operation = await reconcile(account, row.operation);
      return { state: operation.state === 'seen' ? 'public' as const : 'pending' as const, name: row.name, about: row.about, id: planterTag(binToHexOf(row.wallet)) };
    }
    if (request.method === 'rebroadcast') {
      const operation = await reconcile(account, request.id);
      if (!operation.raw || !operation.txid || operation.state !== 'pending') throw new GardenTransactionError({ message: 'Only the same unresolved signed transaction can be explicitly resubmitted.' });
      if (!config.writesEnabled) throw new GardenTransactionError({ message: 'The bounded Chipnet test-write route is not configured. Read-only recovery remains available.' });
    ledger.requireWrites();
      ledger.audit(account, 'explicit_same_bytes_rebroadcast', request.id);
      try { await provider.sendRawTransaction(operation.raw); } catch { return ledger.operation(account, request.id); }
      return reconcile(account, request.id);
    }
    if (request.method === 'recover') {
      if (request.wallet) ledger.bound(account, request.wallet);
      return { operations: request.key ? [ledger.get(account, request.key)].filter((entry) => entry !== null) : z.array(operationSchema).parse(request.wallet ? ledger.db.query("SELECT * FROM operations WHERE account=? AND wallet=? AND state NOT IN ('seen','cancelled') ORDER BY rowid DESC LIMIT 100").all(account, request.wallet) : ledger.db.query("SELECT * FROM operations WHERE account=? ORDER BY rowid DESC LIMIT 100").all(account)) };
    }
    if (request.method === 'reconcile') return reconcile(account, request.id);
    if (request.method === 'challenge') {
      lockingBytecode(request.wallet);
      const nonce = crypto.randomUUID();
      ledger.db.run('DELETE FROM challenges WHERE expires<?', [Date.now()]);
      ledger.db.run('DELETE FROM challenges WHERE account=?', [account]);
      ledger.db.run('INSERT INTO challenges VALUES(?,?,?,?)', [nonce, account, request.wallet, Date.now() + 120000]);
      return { account, nonce };
    }
    if (request.method === 'prove') {
      const context = ownershipContext(account, request.nonce, lockingBytecode(request.wallet));
      context.transaction.inputs[0].unlockingBytecode = hexToBin(request.unlockingBytecode);
      if (vm.verify(context) !== true) throw new GardenTransactionError({ message: 'Wallet ownership signature is invalid.' });
      ledger.db.transaction(() => {
        const deleted = ledger.db.run('DELETE FROM challenges WHERE nonce=? AND account=? AND address=? AND expires>=?', [request.nonce, account, request.wallet, Date.now()]);
        if (deleted.changes !== 1) throw new GardenTransactionError({ message: 'Ownership challenge expired or already consumed.' });
        const owner = z.object({ account: z.string() }).nullable().parse(ledger.db.query('SELECT account FROM wallets WHERE address=?').get(request.wallet));
        if (owner && owner.account !== account) throw new GardenTransactionError({ message: 'Wallet is already linked to another account.' });
        if (!owner) {
          const linked = z.object({ count: z.number() }).parse(ledger.db.query('SELECT COUNT(*) count FROM wallets WHERE account=?').get(account));
          if (linked.count >= 8) throw new GardenTransactionError({ message: 'This account has reached its linked app-wallet limit. Restore an existing app wallet instead.' });
        }
        ledger.db.run('INSERT OR IGNORE INTO wallets VALUES(?,?)', [request.wallet, account]);
      }).immediate();
      return { state: 'verified' as const };
    }
    if (request.method === 'garden') {
      ledger.bound(account, request.wallet);
      const coins = await provider.getUtxos(request.wallet);
      const sessions = z.array(sessionSchema).parse(ledger.db.query('SELECT * FROM sessions WHERE account=? AND wallet=?').all(account, request.wallet));
      const rows = await Promise.all(sessions.map(async (entry) => {
        const plant = await reconcile(account, entry.plant);
        // A tree burned by a confirmed merge leaves the forest; a pending merge shows as merging.
        if (entry.mergedInto) {
          const merge = await reconcile(account, entry.mergedInto);
          if (merge.state === 'seen') return null;
          if (merge.raw) return { ...row(entry, plant, null), state: 'merging' as const };
        }
        const claim = entry.claim ? await reconcile(account, entry.claim) : null;
        const held = claim?.state === 'seen' && claim.txid ? await config.rewardHeld(claim.txid, entry.commitment, parseTree(entry.commitment)!.ownerBytecode) : false;
        const state = plant.state !== 'seen' ? 'confirming' as const : claim?.state === 'seen' ? held ? 'claimed' as const : 'transferred' as const : claim?.raw ? 'claiming' as const : await config.maturity(plant.txid!, entry.duration);
        return { ...row(entry, plant, claim), state };
      }));
      return { network: 'chipnet' as const, minimumConfirmations: config.minimumConfirmations, creditSatoshis: Number(coins.filter((coin) => !coin.token && ledger.available(outpoint(coin))).reduce((sum, coin) => sum + coin.satoshis, 0n)), sessions: rows.filter((row) => row !== null) };
    }
    if (request.method === 'submit') {
      if (!config.writesEnabled) throw new GardenTransactionError({ message: 'The bounded Chipnet test-write route is not configured. Read-only recovery remains available.' });
    ledger.requireWrites();
      const operation = ledger.operation(account, request.id);
      if (operation.kind === 'credit' || !operation.payload) throw new GardenTransactionError({ message: 'No prepared reward transaction.' });
      const prepared = preparedSchema.parse(JSON.parse(operation.payload));
      const resolved = resolvePrepared(prepared);
      const signed = decode(request.raw);
      if (unsignedFingerprint(signed) !== unsignedFingerprint(resolved.transaction)) throw new GardenTransactionError({ message: 'Signed transaction differs from the prepared operation.' });
      const verified = vm.verify({ transaction: signed, sourceOutputs: resolved.sourceOutputs });
      if (verified !== true) throw new GardenTransactionError({ message: `Transaction validation failed: ${verified}` });
      return broadcast(account, operation.id, request.raw);
    }
    ledger.bound(account, request.wallet);
    // Refresh earlier financial observations before allocating another grant or
    // plant. A previously confirmed transaction can regress after a reorg.
    const recorded = z.array(operationSchema).parse(ledger.db.query("SELECT * FROM operations WHERE account=? AND raw IS NOT NULL AND state!='cancelled'").all(account));
    for (const entry of recorded) await reconcile(account, entry.id);
    const prior = ledger.get(account, request.key);
    const intent = request.method === 'credit' ? JSON.stringify({ action: request.action }) : JSON.stringify(request.intent);
    if (prior) {
      if (prior.wallet !== request.wallet || prior.intent !== intent || prior.kind !== (request.method === 'credit' ? 'credit' : request.intent.action)) throw new GardenTransactionError({ message: 'Idempotency key mismatch.' });
      return prior;
    }
    if (request.method === 'credit') {
      const coins = await provider.getUtxos(request.wallet);
      const amount = request.action === 'plant' ? 8000 : 4000;
      if (coins.some((coin) => !coin.token && coin.satoshis >= BigInt(amount) && ledger.available(outpoint(coin)))) {
        const receipt = ledger.reserve({ account, key: request.key, wallet: request.wallet, kind: 'credit', intent, amount: 0, budget: config.budget, dailyBudget: config.dailyBudget });
        ledger.markSeen(receipt.id);
        return { state: 'funded' as const };
      }
      if (!config.treasuryKey) throw new GardenTransactionError({ message: 'Treasury is not configured.' });
      const operation = ledger.reserve({ account, key: request.key, wallet: request.wallet, kind: 'credit', intent, amount, budget: config.budget, dailyBudget: config.dailyBudget });
      const grant = await prepareGrant(provider, ledger, operation.id, request.wallet, amount, config.treasuryKey);
      return broadcast(account, operation.id, grant.raw);
    }
    const session = request.intent.action === 'claim' ? sessionSchema.nullable().parse(ledger.db.query('SELECT * FROM sessions WHERE commitment=? AND account=? AND wallet=?').get(request.intent.commitment, account, request.wallet)) : null;
    if (request.intent.action === 'claim') {
      if (!session || session.mergedInto) throw new GardenTransactionError({ message: 'This account has no matching tree.' });
      const plant = await reconcile(account, session.plant);
      if (plant.state !== 'seen' || await config.maturity(plant.txid!, session.duration) !== 'claimable') throw new GardenTransactionError({ message: 'The confirmed blockchain time lock has not matured.' });
      if (session.claim) throw new GardenTransactionError({ message: 'This tree already has a claim operation.' });
    } else if (request.intent.action === 'register') {
      if (!config.directoryCategory) throw new GardenTransactionError({ message: 'The Focus Directory is not configured.' });
      if (ledger.db.query('SELECT 1 FROM profiles WHERE wallet=?').get(request.wallet)) throw new GardenTransactionError({ message: 'This app wallet already has a profile card.' });
      if (ledger.db.query('SELECT 1 FROM profiles WHERE lower(name)=lower(?)').get(request.intent.name.trim())) throw new GardenTransactionError({ message: 'That name is taken. Try another.' });
    } else if (request.intent.action === 'tip') {
      const target = (await publicProfiles()).find((profile) => planterTag(binToHexOf(profile.wallet)) === (request.intent as { profile: string }).profile);
      const tipAddress = target ? tipAddressOf(target.wallet) : null;
      if (!target || !tipAddress || tipAddress !== request.intent.recipient) throw new GardenTransactionError({ message: 'This member cannot receive tips right now.' });
      if (target.wallet === request.wallet) throw new GardenTransactionError({ message: 'You cannot tip yourself.' });
    } else if (request.intent.action === 'merge') {
      for (const commitment of request.intent.commitments) {
        const tree = sessionSchema.nullable().parse(ledger.db.query('SELECT * FROM sessions WHERE commitment=? AND account=? AND wallet=?').get(commitment, account, request.wallet));
        if (!tree || tree.claim || tree.mergedInto) throw new GardenTransactionError({ message: 'Every tree must still be in the contract and not claimed or merged.' });
        if (await growing(account, tree)) throw new GardenTransactionError({ message: 'Every tree must finish its confirmed time lock before merging.' });
      }
    } else {
      // Only one tree grows at a time; matured trees may wait in the contract to be merged or claimed.
      const active = z.array(sessionSchema).parse(ledger.db.query('SELECT * FROM sessions WHERE account=?').all(account));
      for (const entry of active) if (await growing(account, entry)) throw new GardenTransactionError({ message: 'Wait for your growing tree to mature before planting another.' });
    }
    const operation = ledger.reserve({ account, key: request.key, wallet: request.wallet, kind: request.intent.action, intent, amount: 0, budget: config.budget, dailyBudget: config.dailyBudget });
    const reward = await prepareReward(provider, ledger, operation.id, account, request.wallet, config.category, request.intent, { directoryCategory: config.directoryCategory });
    if (request.intent.action === 'register') ledger.db.run('INSERT INTO profiles VALUES(?,?,?,?,?,?)', [request.wallet, account, request.intent.name.trim(), request.intent.about.trim(), operation.id, Date.now()]);
    const prepared = { ...reward, chainIdentity: config.chainIdentity };
    ledger.db.run("UPDATE operations SET state='prepared',payload=? WHERE id=?", [JSON.stringify(prepared), operation.id]);
    if (session) ledger.db.run('UPDATE sessions SET claim=? WHERE commitment=?', [operation.id, session.commitment]);
    return ledger.operation(account, operation.id);
  }
  // Serialize this instance across awaits; SQLite uniqueness/reservations also
  // protect account caps and coins across processes sharing this ledger.
  const queue = { tail: Promise.resolve(), depth: 0 };
  return async function fetch(request: Request) {
    const context = { account: '', key: '' };
    try {
      if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/rpc') return Response.json({ error: 'Not found' }, { status: 404 });
      if (Number(request.headers.get('content-length')) > 250000) return Response.json({ error: 'Request too large' }, { status: 413 });
      ledger.throttle('unauthenticated-global', 600);
      const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
      const account = ledger.authenticate(token);
      ledger.throttle(`account:${account}`, 90);
      const text = await request.text();
      if (text.length > 250000) return Response.json({ error: 'Request too large' }, { status: 413 });
      const parsed = requestSchema.parse(JSON.parse(text));
      if (['credit', 'prepare', 'submit', 'rebroadcast'].includes(parsed.method)) ledger.throttle(`writes:${account}`, 20);
      if (parsed.method === 'challenge') ledger.throttle(`challenges:${account}`, 10);
      context.account = account;
      context.key = parsed.method === 'credit' || parsed.method === 'prepare' ? parsed.key : '';
      if (queue.depth >= 32) throw new GardenTransactionError({ message: 'The service is busy. Preserve this request and check status before resuming.' });
      queue.depth++;
      const result = queue.tail.then(() => { ledger.authenticate(token); return handle(account, parsed); }).catch((cause: unknown) => {
        // A preparation that has never produced a persisted/returned payload or
        // broadcast record can safely release its reservation. Pending writes
        // and returned prepared transactions are never canceled automatically.
        const failed = context.key ? ledger.get(account, context.key) : null;
        if (failed?.state === 'reserved' && !failed.raw && !failed.payload) ledger.db.transaction(() => {
          ledger.db.run('DELETE FROM coins WHERE operation=?', [failed.id]);
          ledger.db.run('DELETE FROM sessions WHERE plant=?', [failed.id]);
          ledger.db.run('UPDATE sessions SET mergedInto=NULL WHERE mergedInto=?', [failed.id]);
          ledger.db.run('DELETE FROM profiles WHERE operation=?', [failed.id]);
          ledger.db.run('DELETE FROM operations WHERE id=?', [failed.id]);
        }).immediate();
        throw cause;
      });
      void result.finally(() => { queue.depth--; }).catch(() => undefined);
      queue.tail = result.then(() => undefined, () => undefined);
      return Response.json(await result, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
    } catch (cause) {
      // Never serialize keys, provider errors, raw requests or stack traces.
      const message = cause instanceof GardenTransactionError ? cause.message : 'The operation could not be completed. Recover its recorded status before trying another request.';
      return Response.json({ error: message, ...(context.key ? { recorded: ledger.get(context.account, context.key) !== null } : {}) }, { status: message === 'Unauthorized account.' ? 401 : 409 });
    }
  };
}
