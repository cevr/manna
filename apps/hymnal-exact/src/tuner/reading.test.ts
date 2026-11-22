/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTernary, eslint/no-await-in-loop -- a source answers a Promise the host awaits, one answer after another as the host asks, and a Bun test in an Exact app's folder imports no effect (docs/exact.md): an option is built by its run-time shape. */

/**
 * What the tuner screen draws is the current app's reading of the frames:
 * each frame the ear hands over, fed by count (the agent's feed) or crossed
 * as base64 (a device), goes through the current app's focus, its pitch
 * read against the picked string or the nearest, and the screen's name,
 * note, hint, needle and lit string are what the current app's rules make
 * of it. Generated tones on every string from 60 cents flat to 60 sharp,
 * with their partials, a picked string, and noise, against a reference that
 * runs the same frames through `hear`, `reading` and the rules itself.
 */

import { describe, expect, test } from 'bun:test';

import { hear, unfocused } from '@manna/hymnal-app/tuner/focus';
import { noteOf, SWING } from '@manna/hymnal-app/tuner/screen';
import {
  FEED_RATE,
  FRAME,
  feedFrame,
  hintOf,
  NEEDLE_CENTS,
  nameOf,
  needleOf,
} from '@manna/hymnal-app/tuner/session';
import { reading, readingOn, type StringId } from '@manna/hymnal-app/tuner/tuning';

import { seeded } from '../test/random.ts';
import { base64Of } from './frames.ts';
import { type Mic, type Native, tunerSources } from './sources.ts';

const mic: Mic = {
  status: async () => 'granted',
  open: async () => 'track-1',
  close: async () => {},
};

const STRINGS: ReadonlyArray<StringId> = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

/** A module that hands the frames `frames` makes: by count, or crossed as base64. */
const moduleOf = (crossing: 'fed' | 'frames', frames: (index: number) => Float32Array) => {
  let index = 0;
  const native: Native = {
    available: true,
    later: async (request) => {
      if (request['op'] === 'tuner.listen') return { rate: FEED_RATE, ends: 0 };
      if (request['op'] !== 'tuner.take') return {};
      index += 4;
      if (crossing === 'fed') return { fed: index, ends: 0, ended: '' };
      return {
        frames: [0, 1, 2, 3].map((k) => base64Of(frames(index - 4 + k))),
        ends: 0,
        ended: '',
      };
    },
    watch: () => {},
  };
  return native;
};

/** A frame's reading as the current app's rules take it. */
type Heard = Parameters<typeof hintOf>[1];
/** A picked string, or Auto. */
type Target = Parameters<typeof hintOf>[0];

/** The current app's reading of `frames` 0 to `count - 1`, against `aim` or the nearest string. */
const theirs = (frames: (index: number) => Float32Array, count: number, aim?: StringId) => {
  let focus = unfocused;
  let heard = { _tag: 'None' } as Heard;
  for (let index = 0; index < count; index += 1) {
    const got = hear(focus, frames(index), FEED_RATE);
    focus = got.focus;
    heard = (
      got.hz._tag === 'Some'
        ? {
            _tag: 'Some',
            value: aim === undefined ? reading(got.hz.value) : readingOn(got.hz.value, aim),
          }
        : { _tag: 'None' }
    ) as Heard;
  }
  const target = (aim === undefined ? { _tag: 'None' } : { _tag: 'Some', value: aim }) as Target;
  const name = nameOf('Listening', target, heard);
  return {
    name: name._tag === 'Some' ? name.value : '',
    note: noteOf(heard),
    hint: hintOf(target, heard),
    swing: (needleOf(heard) / NEEDLE_CENTS) * SWING,
    inTune: heard._tag === 'Some' && heard.value.inTune,
    lit: aim ?? (heard._tag === 'Some' ? heard.value.string : ''),
  };
};

/** The port's view after `takes` answers of four frames each. */
const ours = async (
  crossing: 'fed' | 'frames',
  feed: string,
  frames: (index: number) => Float32Array,
  takes: number,
  aim = '',
) => {
  const sources = tunerSources(mic, () => {});
  const native = moduleOf(crossing, frames);
  const stepped = await sources.tunerStep(['open', '', true, false, feed], null, null, native);
  let view = await sources.tunerHear([stepped.serial, aim], null, null, native);
  for (let k = 1; k < takes; k += 1)
    view = await sources.tunerHear([stepped.serial, aim], null, null, native);
  const lit = [...view.left, ...view.right].find((each) => each.lit)?.id ?? '';
  return {
    name: view.name,
    note: view.note,
    hint: view.hint,
    swing: view.swing,
    inTune: view.inTune,
    lit,
  };
};

const tone = (string: StringId, cents: number) => (index: number) =>
  feedFrame({ string, cents }, index, new Float32Array(FRAME));

describe('the tuner’s reading', () => {
  test('a fed tone on every string, 60 cents either side, reads as the current app reads it', async () => {
    const unheard: string[] = [];
    for (const string of STRINGS)
      for (let cents = -60; cents <= 60; cents += 40) {
        const frames = tone(string, cents);
        const got = await ours('fed', `${string}:${cents}`, frames, 3);
        expect(got).toEqual(theirs(frames, 12));
        if (got.note === '') unheard.push(`${string}:${cents}`);
      }
    expect(unheard).toEqual([]);
    const held = await ours('fed', 'D3:2', tone('D3', 2), 3);
    expect([held.inTune, held.hint, held.lit]).toEqual([true, 'In tune', 'D3']);
  });

  test('frames crossed as base64 read as the same frames do, against a picked string too', async () => {
    const random = seeded(5);
    for (let run = 0; run < 4; run += 1) {
      const string = STRINGS[Math.floor(random() * STRINGS.length)] ?? 'E2';
      const cents = Math.round(random() * 120 - 60);
      const aim = STRINGS[Math.floor(random() * STRINGS.length)] ?? 'E2';
      const frames = tone(string, cents);
      expect(await ours('frames', '', frames, 3, aim)).toEqual(theirs(frames, 12, aim));
    }
  });

  test('noise reads as the current app reads it: nothing held', async () => {
    const random = seeded(9);
    const noise = () => {
      const frame = new Float32Array(FRAME);
      for (let k = 0; k < FRAME; k += 1) frame[k] = random() * 0.6 - 0.3;
      return frame;
    };
    const frames = Array.from({ length: 12 }, noise);
    const at = (index: number) => frames[index] ?? new Float32Array(FRAME);
    const got = await ours('frames', '', at, 3);
    expect(got).toEqual(theirs(at, 12));
    expect([got.name, got.hint]).toEqual(['Listening', 'Pluck any string']);
  });
});
