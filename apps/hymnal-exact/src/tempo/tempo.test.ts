/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary, effect/noGlobals, import/no-unassigned-import -- the current app's recording.ts and settings.ts are imported after `current.testing.ts` (imported for its loader stand-ins alone) registers what their graph reaches, settings.ts through a cast, as its exact/ declaration names only what Exact stages; an in-memory store holds JSON as the app's does, and the current app's optional fields are read as they are. */

/**
 * The player's tempo, its kept text, its heard key and the key's fallback,
 * held to the current app's own modules: the dial's place, read-out and
 * rate at every stop and in several meters (`tempo.ts`); `Tap` over
 * generated runs of taps (`tap`); the kept tempo as the current
 * `tempo.<n>` setting decodes it (`settings.ts` over an in-memory store);
 * the recording's address for every hymn of a sample, move and chords
 * switch (`heardMove`, `audioUrl`); a key turn's load at the place, at
 * once while it sounds and at the resume while paused; and a missing key's fall back to the
 * printed key's at the place (`recording.ts`'s `recordingsOver`). The
 * declarations Exact's type check reads for `tempo.ts` and `countin.ts`
 * are each assigned the source's export, and the dial's measures are read
 * from the current app's files.
 */

import { describe, expect, it } from 'bun:test';
import { styleIn } from '@manna/exact-kit/look/testing';
import type { Move } from '@manna/hymnal-app/hymns/chords';
import * as countin from '@manna/hymnal-app/player/countin';
import type { PlaybackApi, Status } from '@manna/hymnal-app/player/recording';
import * as tempo from '@manna/hymnal-app/player/tempo';
import { audioUrl } from '@manna/hymnal-app/remote';
import { Effect, Layer, Option, Stream } from 'effect';
import * as KeyValueStore from 'effect/persistence/KeyValueStore';
import type * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';

import { movesTo } from '../chords/move.ts';
import '../player/current.testing.ts';
import { oneFile } from '../look/design.testing.ts';
import { SECTIONS, TIMELINE } from '../player/fixtures.testing.ts';
import type * as CountinDecl from '../player/decl/countin';
import type * as TempoDecl from '../player/decl/tempo';
import { scoreOf } from '../player/score.ts';
import { BUCKET, offsetsOf, recordingAt } from '../player/sources.ts';
import { type Input, type State, type Track, deviceOf, initial, step } from '../player/step.ts';
import { decodeTempos, encodeKept, viewOf } from '../player/view.ts';
import { below, seeded } from '../test/random.ts';
import { TEMPO_PLACES } from './places.ts';

const held = {
  tempo: {
    DEFAULT_TEMPO: tempo.DEFAULT_TEMPO,
    STOPS: tempo.STOPS,
    saidOf: tempo.saidOf,
    stopIndexOf: tempo.stopIndexOf,
    stopAt: tempo.stopAt,
    rateOf: tempo.rateOf,
    beatOf: tempo.beatOf,
    bpmOf: tempo.bpmOf,
    bpmAt: tempo.bpmAt,
    tap: (run, at, hymnBpm) => {
      const tapped = tempo.tap(run, at, hymnBpm);
      return { run: tapped.run, tempo: tapped.tempo };
    },
  } satisfies typeof TempoDecl,
  countin: { countInOf: countin.countInOf } satisfies typeof CountinDecl,
};

/** The meters a hymn is written in, simple and compound, each its first tempo. */
const METERS = [
  { microsPerQuarter: 568_181, numerator: 3, denominator: 4 },
  { microsPerQuarter: 517_241, numerator: 4, denominator: 4 },
  { microsPerQuarter: 600_000, numerator: 6, denominator: 8 },
  { microsPerQuarter: 400_000, numerator: 2, denominator: 2 },
  { microsPerQuarter: 700_000, numerator: 3, denominator: 2 },
];

const hymn = { number: 7, title: 'Seven', firstLine: 'la', topic: 'Test', sections: SECTIONS };

/** Hymn 7 timed in `meter`, its recording at the bucket. */
const trackIn = (meter: (typeof METERS)[number]): Track => ({
  number: 7,
  title: 'Seven',
  url: recordingAt(BUCKET, 7),
  keyed: (offset) => recordingAt(BUCKET, 7, offset),
  score: scoreOf(SECTIONS, { ...TIMELINE, tempo: meter }, hymn),
});

const run = (inputs: ReadonlyArray<Input>, from: State = initial): State =>
  inputs.reduce((state, input) => step(state, input).state, from);

const titleOf = () => 'Seven';

describe('the tempo dial, as the current tempo.ts', () => {
  it('assigns each source export the port reads to its declaration', () => {
    expect(held.tempo.STOPS).toEqual(tempo.STOPS);
    expect(held.countin.countInOf(METERS[0] ?? TIMELINE.tempo)).toEqual(
      countin.countInOf(METERS[0] ?? TIMELINE.tempo),
    );
  });

  it('reads every stop, in every meter: its place, its percent, the bpm and the rate', () => {
    for (const meter of METERS) {
      const track = trackIn(meter);
      for (let at = -2; at < tempo.STOPS.length + 2; at += 1) {
        const state = run([
          { _tag: 'play', track },
          { _tag: 'tempo', at },
        ]);
        const stop = tempo.stopAt(at);
        const view = viewOf(state, undefined, titleOf);
        const beat = tempo.beatOf(meter);
        expect({ meter, at, dial: view.tempo.at, said: view.tempo.said, rate: view.rate }).toEqual({
          meter,
          at,
          dial: tempo.stopIndexOf(stop),
          said: tempo.saidOf(stop),
          rate: tempo.rateOf(stop),
        });
        expect(view.tempo.bpmSaid).toBe(`${beat.name} = ${tempo.bpmAt(tempo.bpmOf(meter), stop)}`);
        expect([view.tempo.note, view.tempo.dotted]).toEqual([beat.note, beat.dotted]);
        expect(view.tempo.away).toBe(stop !== tempo.DEFAULT_TEMPO);
        expect(view.tempo.stops.map((each) => each.percent)).toEqual([...tempo.STOPS]);
        const reset = run([{ _tag: 'tempoReset' }], state);
        expect(viewOf(reset, undefined, titleOf).tempo.percent).toBe(tempo.DEFAULT_TEMPO);
      }
    }
  });

  it('sets the dial from generated runs of taps as the current Tap does', () => {
    const random = seeded(17);
    for (let history = 0; history < 200; history += 1) {
      const meter = METERS[below(random, METERS.length)] ?? TIMELINE.tempo;
      let state = run([{ _tag: 'play', track: trackIn(meter) }]);
      let taps: ReadonlyArray<number> = [];
      let dial = tempo.DEFAULT_TEMPO;
      let now = 1000 + below(random, 5000);
      for (let press = 0; press < 12; press += 1) {
        const gap = [below(random, 1200) + 150, below(random, 4000), -below(random, 300)][
          below(random, 3)
        ];
        now += gap ?? 0;
        const tapped = tempo.tap(taps, now, tempo.bpmOf(meter));
        taps = tapped.run;
        dial = Option.getOrElse(tapped.tempo, () => dial);
        state = run([{ _tag: 'tap', at: now }], state);
        expect({ history, press, dial: viewOf(state, undefined, titleOf).tempo.percent }).toEqual({
          history,
          press,
          dial,
        });
      }
    }
  });
});

/** A store over `kept`: what the device keeps between two launches, every call answered at once. */
const storeOver = (kept: Map<string, string>) => {
  const now = <A>(answer: () => A) => Effect.sync(answer);
  return Layer.succeed(KeyValueStore.KeyValueStore)(
    KeyValueStore.makeStringOnly({
      get: (name) => now(() => kept.get(name)),
      set: (name, text) => now(() => void kept.set(name, text)),
      remove: (name) => now(() => void kept.delete(name)),
      clear: now(() => kept.clear()),
      size: now(() => kept.size),
      keys: now(() => [...kept.keys()]),
    }),
  );
};

/** The current app's settings the port reads: the tempo and the heard move, by hymn. */
interface Settings {
  readonly tempo: (number: number) => Atom.Atom<number>;
  readonly heardMove: (number: number) => Atom.Atom<Move>;
}

/** `settings.ts`'s `settingsOn`: its exact/ declaration, which the port's typecheck reads, names only what Exact's check stages. */
const { settingsOn } = (await import('@manna/hymnal-app/settings')) as unknown as {
  readonly settingsOn: (store: Layer.Layer<KeyValueStore.KeyValueStore>) => Settings;
};

const launch = (map: Map<string, string>) => ({
  settings: settingsOn(storeOver(map)),
  registry: AtomRegistry.make(),
});

describe('the kept tempo, as the current tempo.<n> setting', () => {
  it('reads a kept value as the setting decodes it: off the stops, 100', () => {
    for (let kept = 0; kept <= 200; kept += 1) {
      const { settings, registry } = launch(new Map([['tempo.5', JSON.stringify(kept)]]));
      expect({ kept, read: decodeTempos(`5@${kept}`)['5'] ?? tempo.DEFAULT_TEMPO }).toEqual({
        kept,
        read: registry.get(settings.tempo(5)),
      });
      registry.dispose();
    }
  });

  it('keeps every turned tempo beside the stanza choices, and reads them back', () => {
    const track = trackIn(TIMELINE.tempo);
    for (const [at, stop] of tempo.STOPS.entries()) {
      const state = run([
        { _tag: 'play', track },
        { _tag: 'chooseStanza', stanza: 2 },
        { _tag: 'tempo', at },
      ]);
      const text = encodeKept(state);
      expect(decodeTempos(text)).toEqual(stop === tempo.DEFAULT_TEMPO ? {} : { '7': stop });
    }
  });
});

describe('the recording’s key, as the current heardMove and audioUrl', () => {
  it('names the recording of each hymn’s heard key: its move with chords on, as printed with them off', () => {
    const random = seeded(29);
    for (let history = 0; history < 300; history += 1) {
      const chords = below(random, 2) === 1;
      const number = 1 + below(random, 695);
      const move: Move = { transpose: below(random, 23) - 11, capo: below(random, 12) };
      const map = new Map([
        ['chords', JSON.stringify(chords)],
        [`move.${number}`, JSON.stringify(move)],
      ]);
      const { settings, registry } = launch(map);
      const heard = registry.get(settings.heardMove(number));
      const moves = movesTo([], number, move);
      const offset = offsetsOf(chords, moves)[`${number}`] ?? 0;
      expect({ history, url: recordingAt(BUCKET, number, offset) }).toEqual({
        history,
        url: audioUrl(number, heard.transpose),
      });
      registry.dispose();
    }
  });
});

describe('a key turn, as the current playback.live.ts', () => {
  const track = {
    ...trackIn(TIMELINE.tempo),
    url: audioUrl(7),
    keyed: (by: number) => audioUrl(7, by),
  };
  const sounding = () => {
    const state = run([{ _tag: 'play', track }]);
    const load = deviceOf(state)?.load ?? 0;
    return run(
      [
        { _tag: 'loaded', id: load, duration: 8 },
        { _tag: 'playing', id: load },
        { _tag: 'time', id: load, serial: deviceOf(state)?.seek ?? 0, seconds: 3 },
      ],
      state,
    );
  };

  it('loads the turned key’s recording at the place while the hymn sounds', () => {
    const turned = step(sounding(), { _tag: 'keys', offsets: { '7': 2 } });
    expect(turned.command).toMatchObject({ _tag: 'load', url: audioUrl(7, 2), from: 3 });
  });

  it('loads nothing while paused, and the turned key’s recording at the resume', () => {
    const paused = run([{ _tag: 'pause' }, { _tag: 'keys', offsets: { '7': 2 } }], sounding());
    expect(deviceOf(paused)?.url).toBe(audioUrl(7));
    const resumed = step(paused, { _tag: 'resume' });
    expect(resumed.command).toMatchObject({ _tag: 'load', url: audioUrl(7, 2), from: 3 });
  });
});

/** A device that holds every recording but the key set `refused`, and keeps each play it was asked. */
const deviceRefusing = (refused: string) => {
  const asked: Array<readonly [string, number]> = [];
  const status: Status = { state: 'idle', positionMs: 0 };
  const device: PlaybackApi = {
    play: (uri, fromMs) =>
      Effect.sync(() => {
        asked.push([uri, fromMs]);
        return uri.includes(`/${refused}/`)
          ? { state: 'failed' as const, positionMs: fromMs, replacementMs: fromMs }
          : { state: 'playing' as const, positionMs: fromMs };
      }),
    pause: Effect.succeed(status),
    resume: Effect.succeed(status),
    seek: () => Effect.succeed(status),
    status: Effect.succeed(status),
    stop: Effect.void,
    connection: Stream.make(true),
    announce: () => Effect.void,
    remote: Stream.empty,
  };
  return { device, asked };
};

describe('a key with no recording, as the current recording.ts', () => {
  it('falls back to the printed key’s at the place, and says so', async () => {
    const { recordingsOver } = await import('@manna/hymnal-app/player/recording');
    for (const offset of [-1, 2]) {
      for (const from of [0, 3.5]) {
        const one = deviceRefusing('warm-1-down1');
        const answered = Effect.runSync(
          recordingsOver(one.device).play(audioUrl(7, offset), from * 1000, {
            continuous: false,
            ready: false,
            recording: { number: 7, offset },
          }),
        );
        const track = {
          ...trackIn(TIMELINE.tempo),
          url: audioUrl(7),
          keyed: (by: number) => audioUrl(7, by),
        };
        let state = run([
          { _tag: 'keys', offsets: { '7': offset } },
          { _tag: 'play', track },
        ]);
        const asked: Array<readonly [string, number]> = [];
        const loaded = deviceOf(state);
        if (loaded !== undefined) {
          state = run([{ _tag: 'loaded', id: loaded.load, duration: 8 }], state);
          if (from > 0) state = run([{ _tag: 'seekTo', seconds: from }], state);
        }
        const atLoad = deviceOf(state);
        asked.push([atLoad?.url ?? '', from * 1000]);
        const missing = atLoad?.url.includes('/warm-1-down1/') === true;
        if (missing) {
          state = run([{ _tag: 'failed', id: atLoad?.load ?? 0, why: 'missing' }], state);
          const next = deviceOf(state);
          asked.push([next?.url ?? '', (next?.from ?? 0) * 1000]);
        }
        expect({ offset, from, asked }).toEqual({ offset, from, asked: one.asked });
        const recording = answered.recording;
        expect(viewOf(state, undefined, titleOf).fellBack).toBe(
          recording !== undefined && recording.requested !== recording.effective,
        );
      }
    }
  });
});

/** A number constant in a One file. */
const constant = (path: string, name: string): number => {
  const found = new RegExp(`^(?:export )?const ${name} = (\\d+(?:\\.\\d+)?);$`, 'mu').exec(
    oneFile(path),
  );
  expect(found).not.toBeNull();
  return Number(found?.[1]);
};

/** A style's number property in a One file. */
const styled = (path: string, style: string, prop: string): number =>
  Number(styleIn(oneFile(path), style)?.get(prop));

describe('the tempo dial’s measures', () => {
  it('are the current DialView’s and DialPanel’s', () => {
    const view = 'src/player/DialView.tsx';
    expect(TEMPO_PLACES).toEqual({
      detent: constant('src/player/dial.ts', 'DETENT'),
      pad: constant('src/player/DialPanel.tsx', 'PANEL_PAD'),
      title: constant(view, 'TITLE'),
      titlePad: styled(view, 'title', 'paddingLeft'),
      titleSpacing: styled(view, 'title', 'letterSpacing'),
      notch: styled(view, 'notch', 'height'),
      notchWide: styled(view, 'notch', 'width'),
    });
  });
});
