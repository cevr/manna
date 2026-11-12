/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop -- a React screen test: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` until the frame the test waits on lands, at most 3 s; it reads nodes whose absent attributes are null, and picks a held or a said recital by a plain branch. */

/**
 * The first minute in dark and across flips of the system: a fresh install
 * mounted in happy-dom under the app's own layer over the real store on the
 * device's `One.Database` (`src/test/one.tsx`), a voice source the test
 * drives and a scripted recital, held listening or said through. Each phase
 * (hear while the voice reads a word, letters while their recital listens,
 * alone, Planted, and home's done state after Continue) is shown in dark,
 * then the system flips to light and back, and every frame (each DOM
 * mutation batch) holds the frame oracle (`src/test/look.ts`) for the
 * system's last value and the root's frame rule (`rootFaults`); each
 * settled phase in each scheme draws the plant image it owes in that scheme
 * (`src/test/plant-image-rule.ts`), Planted's seed and no other. It counts words without
 * printing one.
 */

import { RegistryProvider } from '@effect/atom-react';
import { describe, expect, it } from 'bun:test';
import { Effect, Layer, MutableRef } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { Haptics } from '../sayit';
import { store } from '../store';
import { clockOf, START } from '../test/clock';
import { deadline } from '../test/elapsed';
import { lookFaults, setSystem, watchLook } from '../test/look';
import { device } from '../test/one';
import { introFaults, plantFaults } from '../test/plant-image-rule';
import { cardLine, watchRoot } from '../test/root-rule';
import type { Scheme } from '../theme';
import { VoiceSource, type VoiceEvent } from '../voice';
import { wordSpans } from '../voice/reading';

const SPANS = wordSpans(passage.text);

/** The model of the system: the appearance it last named. */
interface Model {
  system: Scheme;
}

/** A fresh install's launch under `scheme`, its recital held listening (`held`) or said through with one word missed. */
const mount = async (scheme: Scheme, held: boolean) => {
  const model: Model = { system: scheme };
  setSystem(scheme);
  device.launch([]);
  const listener = MutableRef.make<(event: VoiceEvent) => void>(() => {});
  const voice = Layer.succeed(
    VoiceSource,
    VoiceSource.of({
      voices: Effect.succeed([]),
      speak: () => Effect.void,
      pause: Effect.void,
      resume: Effect.void,
      stop: Effect.void,
      subscribe: (next) =>
        Effect.acquireRelease(
          Effect.sync(() => MutableRef.set(listener, next)),
          () => Effect.sync(() => MutableRef.set(listener, () => {})),
        ),
    }),
  );
  const source = held
    ? scriptedSource([{ at: 600_000, final: false, runs: [] }])
    : scriptedSource(recite(passage.text, { skip: [3], every: 5, pace: 1 }));
  const layer = appLayer({
    source,
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store,
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice,
  }).pipe(Layer.provideMerge(clockOf({ now: START })));
  const host = document.createElement('div');
  document.body.append(host);
  const look = watchLook(host, () => model.system);
  const rule = watchRoot(host, 'read');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const until = async (holds: () => boolean, ms = 3000) => {
    const late = deadline(ms);
    while (!holds()) {
      if (late()) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const heading = () => host.querySelector('[role="heading"]')?.textContent ?? '';
  /** Home's Today card line, none before a plan. */
  const counts = () =>
    host.querySelector('[data-testid="today-card"]') === null ? '' : cardLine(host);
  const has = (label: string) =>
    [...host.querySelectorAll('[role="button"]')].some(
      (node) => node.getAttribute('aria-label') === label,
    );
  const tap = async (label: string) => {
    const node = [...host.querySelectorAll('[role="button"]')].find(
      (each) => each.getAttribute('aria-label') === label,
    );
    if (node === undefined) return false;
    await act(async () => {
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    return true;
  };
  const send = (event: Omit<VoiceEvent, 'utterance'>) =>
    act(async () => MutableRef.get(listener)({ utterance: 1, ...event }));
  const report: string[] = [];
  const flip = async (to: Scheme) => {
    model.system = to;
    await act(async () => setSystem(to));
  };
  /** The plant the phase `name` owes in `scheme` (`plantFaults`): Planted's 112 pt seed of that scheme, home its own, every other phase none. */
  const drawing = (name: string, scheme: Scheme) => {
    if (name === 'home') return [];
    if (name === 'welcome' || name === 'grows') return introFaults(host, name, scheme);
    if (name === 'planted')
      return plantFaults(host, { asset: `assets/home/seed-${scheme}.png`, size: 112 });
    return plantFaults(host, null);
  };
  /** The phase shown now, `name`, settled in dark, then flipped to light and back, each settled screen held to the oracle and to the plant image it owes in that scheme. */
  const phase = async (name: string) => {
    for (const to of ['dark', 'light', 'dark'] as const) {
      if (model.system !== to) await flip(to);
      await until(() => lookFaults(host, to).length === 0, 300);
      const faults = [...lookFaults(host, to), ...drawing(name, to)];
      if (faults.length > 0) report.push(`${name} [${to}]: ${faults.join('; ')}`);
    }
  };
  const leave = async () => {
    look.stop();
    rule.stop();
    await act(async () => root.unmount());
    host.remove();
    setSystem('light');
    return { report, frames: look.faults, root: rule.faults, seen: look.frames.seen };
  };
  return { until, heading, counts, has, tap, send, phase, leave };
};

describe('the first minute in dark and across flips of the system', () => {
  it('holds every frame of hear while the voice reads and of the letters while their recital listens to the oracle', async () => {
    const first = await mount('dark', true);
    const shown: string[] = [];
    if (await first.until(() => first.heading() === 'Heartseed')) shown.push('welcome');
    await first.phase('welcome');
    await first.tap('Begin');
    if (await first.until(() => first.heading() === 'Every verse is a plant')) shown.push('grows');
    await first.phase('grows');
    await first.tap('Plant your first verse');
    if (await first.until(() => first.heading() === 'Hear it')) shown.push('hear');
    await first.phase('hear');
    await first.tap('Listen');
    await first.send({ kind: 'range', location: SPANS[0]?.start ?? 0, length: 1 });
    await first.send({
      kind: 'range',
      location: SPANS[1]?.start ?? 0,
      length: (SPANS[2]?.end ?? 0) - (SPANS[1]?.start ?? 0),
    });
    await first.phase('hear while reading');
    await first.send({ kind: 'finish', location: 0, length: 0 });
    if (await first.until(() => first.heading() === 'Say it with help')) shown.push('letters');
    await first.phase('letters');
    await first.tap('Say it');
    if (await first.until(() => first.has('Listening'))) shown.push('listening');
    await first.phase('letters while listening');
    expect({ shown, ...(await first.leave()) }).toMatchObject({
      shown: ['welcome', 'grows', 'hear', 'letters', 'listening'],
      report: [],
      frames: [],
      root: [],
    });
  });

  it('holds every frame of alone, its recital and Planted to the oracle, and home’s done state after Continue', async () => {
    const first = await mount('dark', false);
    const shown: string[] = [];
    await first.until(() => first.heading() === 'Heartseed');
    await first.tap('Skip');
    await first.until(() => first.heading() === 'Hear it');
    await first.tap('Next');
    await first.until(() => first.heading() === 'Say it with help');
    await first.tap('Say it');
    if (await first.until(() => first.heading() === 'Say it alone' && first.has('Say it')))
      shown.push('alone');
    await first.phase('alone');
    await first.tap('Say it');
    if (await first.until(() => first.heading() === 'Planted')) shown.push('planted');
    await first.phase('planted');
    await first.tap('Continue');
    if (await first.until(() => first.heading() === 'Your field' && first.counts() !== ''))
      shown.push('home');
    await first.phase('home');
    const done = {
      counts: first.counts(),
      begin: first.has('Start'),
      anyway: first.has('Practice anyway'),
    };
    const left = await first.leave();
    expect({ shown, done, ...left, seen: left.seen > 10 }).toEqual({
      shown: ['alone', 'planted', 'home'],
      done: {
        counts: 'All tended for today | Nothing is due right now.',
        begin: false,
        anyway: true,
      },
      report: [],
      frames: [],
      root: [],
      seen: true,
    });
  });
});
