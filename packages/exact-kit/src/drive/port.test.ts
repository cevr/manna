import { createServer } from 'node:net';

import { Duration, Effect } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { LIVE_MS, WATCHDOG, watched } from '../watchdog/testing.ts';
import { claimAppPort, claimPorts, takePort } from './port.ts';

/** A claim of one port of `range`: a block of one, read as its port. */
const claimPort = async (
  range: readonly [number, number],
  options?: Parameters<typeof claimPorts>[2],
) => {
  const { lo, give } = await claimPorts(range, 1, options);
  return { port: lo, give };
};

/** Ports no run of the apps uses, below the Mac's ephemeral range, for the claims these tests make. */
const LO = 47_310;
const RANGE = [LO, LO + 3] as const;

/**
 * A claim made from another process, with no turn of this one's inherited: its port, once the process prints it
 * (its readiness), and `end`, which closes its input and waits for its exit, when the kernel frees its turn. Each
 * wait is a handshake under the watchdog.
 */
const elsewhere = (range: readonly [number, number]) =>
  Effect.gen(function* () {
    const child = Bun.spawn(
      [
        'bun',
        '-e',
        `const { claimPorts } = await import(${JSON.stringify(`${import.meta.dir}/port.ts`)});
       const { lo } = await claimPorts([${range[0]}, ${range[1]}], 1, { label: 'run b', waitMs: 0 });
       console.log(lo);
       for await (const _ of process.stdin) {}`,
      ],
      {
        stdin: 'pipe',
        stdout: 'pipe',
        env: { ...process.env, EXACT_PORT_TURNS: '' },
      },
    );
    const said = yield* watched(
      Effect.promise(() => child.stdout.getReader().read()),
      `the claim of ${range.join('-')} in another process never said its port`,
    );
    const port = Number(new TextDecoder().decode(said.value).trim());
    return {
      port,
      end: watched(
        Effect.promise(async () => {
          void child.stdin.end();
          await child.exited;
        }),
        `the claim of ${port} in another process did not exit once its input closed`,
      ),
    };
  });

/** What a claim waits on a holder to answer with its card: the watchdog's time, so a busy holder is still named. */
const ASK_MS = Duration.toMillis(WATCHDOG);

describe('claimPort', () => {
  it.effect(
    'two claims at once in one process never share a port, and each is held until given',
    () =>
      Effect.promise(async () => {
        const [a, b] = await Promise.all([claimPort(RANGE), claimPort(RANGE)]);
        expect(a.port).not.toBe(b.port);
        expect([a.port, b.port].every((p) => p >= RANGE[0] && p <= RANGE[1])).toBe(true);
        const whileHeld = await claimPort([a.port, a.port], { waitMs: 0, say: () => {} }).then(
          () => 'claimed',
          () => 'refused',
        );
        expect(whileHeld).toBe('refused');
        a.give();
        b.give();
        const again = await claimPort([a.port, a.port], { waitMs: 0 });
        expect(again.port).toBe(a.port);
        again.give();
      }),
  );

  it.live(
    "a claim in another process, which inherits none of this one's, takes another port; its end frees its own",
    () =>
      Effect.gen(function* () {
        const mine = yield* Effect.promise(() => claimPort([LO, LO + 1]));
        const theirs = yield* elsewhere([LO, LO + 1]);
        expect(theirs.port).not.toBe(mine.port);
        yield* theirs.end;
        mine.give();
        const again = yield* Effect.promise(() =>
          claimPort([theirs.port, theirs.port], { waitMs: 0 }),
        );
        expect(again.port).toBe(theirs.port);
        again.give();
      }),
    LIVE_MS,
  );

  it.live(
    'waits for a range all taken, naming the holder, and rejects when the wait is out',
    () =>
      Effect.gen(function* () {
        const theirs = yield* elsewhere([LO, LO]);
        const said: Array<string> = [];
        const refused = yield* watched(
          Effect.promise(() =>
            claimPort([LO, LO], {
              waitMs: 0,
              askMs: ASK_MS,
              say: (line) => said.push(line),
            }).catch((error: Error) => error.message),
          ),
          'the claim of a range all taken neither took it nor was refused',
        );
        yield* theirs.end;
        expect(refused).toContain('run b');
      }),
    LIVE_MS,
  );

  it.effect('passes over a port something listens on without a turn', () =>
    Effect.promise(async () => {
      const foreign = createServer();
      await new Promise<void>((done) => foreign.listen(LO, '127.0.0.1', () => done()));
      const claim = await claimPort([LO, LO + 1]);
      foreign.close();
      expect(claim.port).toBe(LO + 1);
      claim.give();
    }),
  );

  it.effect(
    'a relaunch takes the port its drive holds again at once; an ancestor holds it for it',
    () =>
      Effect.promise(async () => {
        const drive = await claimPort(RANGE);
        const relaunch = await takePort(drive.port, { waitMs: 0 });
        expect(relaunch.port).toBe(drive.port);
        relaunch.give();
        const other = await claimPort(RANGE);
        expect(other.port).not.toBe(drive.port);
        other.give();
        drive.give();
      }),
  );

  it.effect(
    'a block claim holds adjacent ports a single claim then passes over, each free to listen on, and never more than the range',
    () =>
      Effect.promise(async () => {
        const block = await claimPorts(RANGE, 2);
        expect(block.hi - block.lo).toBe(1);
        const single = await claimPort(RANGE);
        expect(single.port < block.lo || single.port > block.hi).toBe(true);
        const servers = await Promise.all(
          [block.lo, block.hi].map(
            (port) =>
              new Promise<ReturnType<typeof createServer>>((done, fail) => {
                const server = createServer();
                server.once('error', fail);
                server.listen(port, '127.0.0.1', () => done(server));
              }),
          ),
        );
        servers.forEach((s) => s.close());
        block.give();
        single.give();
        const whole = await claimPorts([LO, LO + 1], 5, { waitMs: 0 });
        expect([whole.lo, whole.hi]).toEqual([LO, LO + 1]);
        whole.give();
      }),
  );

  it.live(
    'a block claim passes over a block one of whose ports another run holds',
    () =>
      Effect.gen(function* () {
        const theirs = yield* elsewhere([LO + 1, LO + 1]);
        const block = yield* Effect.promise(() => claimPorts(RANGE, 2, { waitMs: 0 }));
        yield* theirs.end;
        expect([block.lo, block.hi]).toEqual([LO + 2, LO + 3]);
        block.give();
      }),
    LIVE_MS,
  );

  it.effect('refuses a drive of an app the wrapper does not run, naming it', () =>
    Effect.promise(async () => {
      const refused = await claimAppPort('/x/apps/heartseed').catch(
        (error: Error) => error.message,
      );
      expect(refused).toContain('heartseed is not an app the wrapper runs');
    }),
  );
});
