import { basename } from 'node:path';
import { createConnection, createServer, type Server } from 'node:net';

import { APPS } from '../apps.ts';

/**
 * A port this process holds for its run, and how to give it back (once; the process's end gives it back too).
 * Every launch of the run passes this one port, so a web relaunch finds the store it left.
 */
export interface Claim {
  readonly port: number;
  readonly give: () => void;
}

/** What a claim is told: who claims (said to a run that waits), how long to wait, and where to say it. */
interface ClaimOptions {
  readonly label?: string;
  readonly waitMs?: number;
  readonly say?: (line: string) => void;
}

/** The variable, Exact's own (`scripts/port-lock.mjs`), naming the ports this process and its ancestors hold. */
const TURNS = 'EXACT_PORT_TURNS';

/**
 * The loopback port that holds `port`'s turn, as Exact's own port lock places it: whoever listens there holds
 * `port`, and the kernel frees it when that process ends however it ends, so a crash leaves no stale claim.
 */
export const turnPort = (port: number) => (port + 10000 <= 65535 ? port + 10000 : port - 10000);

/** The ports this process or an ancestor holds, as `EXACT_PORT_TURNS` names them. */
export const heldPorts = (env: Record<string, string | undefined> = process.env) =>
  (env[TURNS] ?? '')
    .split(',')
    .filter((p) => p !== '')
    .map(Number);

const hold = (port: number) => {
  process.env[TURNS] = [...heldPorts(), port].join(',');
};

const unhold = (port: number) => {
  process.env[TURNS] = heldPorts()
    .filter((p) => p !== port)
    .join(',');
};

/** Listens on `port`'s turn, answering a connection with `card`; null when another process holds it. */
const listenTurn = (port: number, card: string) =>
  new Promise<Server | null>((done) => {
    const server = createServer((socket) => socket.end(card));
    server.once('error', () => done(null));
    server.listen({ host: '127.0.0.1', port: turnPort(port), exclusive: true }, () => {
      server.unref();
      done(server);
    });
  });

/** Whether something listens on `port` now: a run that takes no turn, which a claim leaves to it. */
const answers = (port: number) =>
  new Promise<boolean>((done) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });

/** Who holds `port`'s turn, as its card says, or null when no run does. */
const holderOf = (port: number) =>
  new Promise<string | null>((done) => {
    let text = '';
    const socket = createConnection({ host: '127.0.0.1', port: turnPort(port) });
    socket.setTimeout(2000, () => {
      socket.destroy();
      done('another run');
    });
    socket.on('data', (data) => {
      text += String(data);
    });
    socket.on('end', () => {
      try {
        const card = JSON.parse(text) as { label?: string; pid?: number; at?: string };
        done(`${card.label ?? 'another run'} (pid ${card.pid ?? '?'}, since ${card.at ?? '?'})`);
      } catch {
        done('another run');
      }
    });
    socket.on('error', () => done(null));
  });

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The claim of `port` through `server`, its turn named in `EXACT_PORT_TURNS` for the processes this one starts. */
const claimed = (port: number, server: Server): Claim => {
  hold(port);
  let given = false;
  return {
    port,
    give: () => {
      if (given) return;
      given = true;
      server.close();
      unhold(port);
    },
  };
};

/** Tries each port of `ports` once; the first whose turn is free and on which nothing listens. */
const tryEach = async (ports: ReadonlyArray<number>, card: string) => {
  for (const port of ports) {
    const server = await listenTurn(port, card);
    if (!server) continue;
    if (await answers(port)) {
      server.close();
      continue;
    }
    return claimed(port, server);
  }
  return null;
};

/** The ports from `lo` to `hi`, inclusive. */
const span = ([lo, hi]: readonly [number, number]) =>
  Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

/**
 * A port of `range` for this process's run: the first whose turn no run of any checkout holds and on which
 * nothing listens, held until `give()` or this process's end. A port this process or an ancestor already holds is
 * passed over: it is in use by that holder. With every port taken, it waits (saying once whom for) and rejects after
 * `waitMs`, naming the holders.
 */
export const claimPort = async (
  range: readonly [number, number],
  { label = 'a run', waitMs = 20 * 60_000, say = (line) => console.error(line) }: ClaimOptions = {},
): Promise<Claim> => {
  const card = JSON.stringify({ label, pid: process.pid, at: new Date().toISOString() });
  const end = Date.now() + waitMs;
  let told = false;
  for (;;) {
    const mine = heldPorts();
    const free = await tryEach(
      span(range).filter((p) => !mine.includes(p)),
      card,
    );
    if (free) return free;
    const holders = await Promise.all(span(range).map(holderOf));
    const names = holders.filter((h) => h !== null).join(', ') || 'programs that take no turn';
    if (Date.now() > end)
      // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- a host helper's plain promise: the drive or the wrapper says the rejection's message
      throw new Error(
        `ports ${range[0]}-${range[1]} are all taken after ${Math.round(waitMs / 1000)} s, by ${names}`,
      );
    if (!told) say(`ports ${range[0]}-${range[1]}: waiting for one of ${names}`);
    told = true;
    await sleep(500);
  }
};

/**
 * `port` for this process's run: given back at once (a no-op) when this process or an ancestor holds it, else
 * waited for as `claimPort` waits.
 */
export const takePort = async (port: number, options: ClaimOptions = {}): Promise<Claim> => {
  if (heldPorts().includes(port)) return { port, give: () => {} };
  return claimPort([port, port], options);
};

/** The spare port range of the app whose folder is `appDir`, the range its runs claim from. */
export const appRange = (appDir: string): readonly [number, number] => {
  const name = basename(appDir);
  const app = Object.entries(APPS).find(([folder]) => folder === name)?.[1];
  if (app) return app.spare;
  // oxlint-disable-next-line effect/noThrowStatement, effect/noNewError -- a drive of an app the wrapper does not run is a mistake in the drive, said at once
  throw new Error(`${name} is not an app the wrapper runs (${Object.keys(APPS).join(', ')})`);
};

/** A port of the app's spare range in `appDir` for this process's run: `claimPort` over `appRange(appDir)`. */
export const claimAppPort = (appDir: string, options: ClaimOptions = {}) =>
  claimPort(appRange(appDir), options);
