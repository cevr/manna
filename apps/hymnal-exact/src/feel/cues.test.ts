/* oxlint-disable effect/noNodeBuiltinImport, effect/noTernary, effect/noNullish, effect/noGlobals -- a Bun test that reads the app's own Contract text for sound lines, its app.json for the iOS resources (JSON.parse), and the current app's body as plain values. */

/**
 * The port's Feel table is the current hymnal's body, cue by cue: each
 * cue's haptic is the one `bodyOf` gives it, by Exact's name; its sounds
 * are the files of the sounds `bodyOf` gives it (the key dial's twelve,
 * by pitch class); its lengths are the voice's own (`soundLength`); a tick
 * keeps the current `FLOOR`. Each sound file is the current voice's
 * render, in memory: a RIFF WAV of 16-bit mono PCM at the voice's rate, as
 * long as its recipe, the same bytes at each render. The Contract declares
 * no sound, so Exact's web plan fetches none; the iOS app ships exactly
 * the files `tools/sounds.ts` writes, where `modules/apple/Feel.swift`
 * reads them. No test here reads a generated file.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

import { Option } from 'effect';

import * as body from '@manna/hymnal-app/feel/body';
import type { Cue, DialName, PlainCue } from '@manna/hymnal-app/feel/cues';
import { lengthMs, RATE, RECIPES, soundLength, voiced } from '@manna/hymnal-app/feel/voice';

import { FEEL_ROWS, FEEL_SOUNDS, SOUND_FOLDER, soundPath } from './cues.ts';
import { soundFiles } from './sounds.ts';
import { feelSources } from './sources.ts';

const PLAIN: ReadonlyArray<PlainCue> = [
  'wall',
  'reset',
  'chords-on',
  'chords-off',
  'play',
  'pause',
  'switch-on',
  'switch-off',
  'favourite-on',
  'favourite-off',
  'press',
  'choose',
  'tab',
  'zoom-out',
  'zoom-in',
  'sheet-open',
  'seek-grab',
  'seek-tick',
  'seek-release',
  'rail-tick',
];

const DIALS: ReadonlyArray<DialName> = [
  'key',
  'capo',
  'size',
  'tempo',
  'placement',
  'hundreds',
  'tens',
  'ones',
];

/** Every cue the current app tells, by the name the port tells it by, with each of its forms. */
const CUES: ReadonlyArray<{ readonly name: string; readonly forms: ReadonlyArray<Cue> }> = [
  ...PLAIN.map((name) => ({ name, forms: [{ _tag: name } as const] })),
  { name: 'section', forms: [{ _tag: 'section', place: 0 } as const] },
  ...DIALS.map((dial) => ({
    name: `detent-${dial}`,
    forms: Array.from(
      { length: dial === 'key' ? 12 : 1 },
      (_, at) => ({ _tag: 'detent', dial, at }) as const,
    ),
  })),
  { name: 'beat-accent', forms: [{ _tag: 'beat', accent: true } as const] },
  { name: 'beat', forms: [{ _tag: 'beat', accent: false } as const] },
];

/** A haptic of the current Feel, by Exact's name. */
const exactName = (haptic: body.Haptic): string => {
  if (haptic._tag === 'impact') return `impact-${haptic.style}`;
  if (haptic._tag === 'notification') return haptic.type;
  return haptic._tag;
};

/** The row the current app's body gives cue `name`. */
const currentRow = (name: string, forms: ReadonlyArray<Cue>) => {
  const first = forms[0] ?? { _tag: 'press' };
  const sounds = forms.flatMap((cue) => Option.toArray(body.bodyOf(cue).sound));
  return {
    cue: name,
    haptic: exactName(body.bodyOf(first).haptic),
    floor: body.isTick(first) ? body.FLOOR : 0,
    sounds,
    lengths: sounds.map(soundLength),
  };
};

const appDir = new URL('../../', import.meta.url);

/** Every `sound` line in the app's Contract files: what Exact's plan would fetch on the web. */
const declared = [
  'app.contract',
  ...readdirSync(new URL('features/', appDir)).map((name) => `features/${name}`),
]
  .filter((file) => file.endsWith('.contract'))
  .flatMap((file) =>
    [...readFileSync(new URL(file, appDir), 'utf8').matchAll(/^\s*sound "([^"]+)"/gmu)].map(
      (found) => found[1],
    ),
  );

/** The trees app.json ships in the iOS app. */
const shipped = (
  JSON.parse(readFileSync(new URL('app.json', appDir), 'utf8')) as {
    readonly host: {
      readonly ios: { readonly resources: ReadonlyArray<{ from: string; to: string }> };
    };
  }
).host.ios.resources;

describe('the Feel table is the current hymnal’s body', () => {
  it('gives every cue the current app tells its haptic, floor, sounds and lengths', () => {
    expect(FEEL_ROWS.map((row) => row.cue).toSorted()).toEqual(CUES.map((c) => c.name).toSorted());
    for (const { name, forms } of CUES)
      expect(FEEL_ROWS.find((row) => row.cue === name)).toEqual(currentRow(name, forms));
  });

  it('answers the table to the view as it holds it', () => {
    expect(feelSources().feelRows()).toEqual(
      FEEL_ROWS.map((row) => ({ ...row, sounds: [...row.sounds], lengths: [...row.lengths] })),
    );
  });

  it('declares no sound to Exact, so the web fetches none, as the current app’s web has no voice', () => {
    expect(declared).toEqual([]);
  });

  it('ships the iOS app exactly the sounds the table names, where its module reads them', () => {
    const written = soundFiles().map((file) => file.path);
    expect(written.toSorted()).toEqual(FEEL_SOUNDS.map(soundPath).toSorted());
    expect(FEEL_SOUNDS.length).toBe(13);
    expect(shipped).toContainEqual({ from: SOUND_FOLDER, to: `Resources/${SOUND_FOLDER}` });
    const swift = readFileSync(new URL('modules/apple/Feel.swift', appDir), 'utf8');
    expect(swift).toContain(`"ExactResources/Resources/${SOUND_FOLDER}"`);
  });
});

describe('the sound files are the current voice’s render', () => {
  const files = soundFiles();

  it('renders every sound of the voice, each a WAV of 16-bit mono PCM at the voice’s rate, as long as its recipe', () => {
    expect(files.map((file) => file.path)).toEqual(RECIPES.map(([name]) => soundPath(name)));
    for (const [index, { path, bytes }] of files.entries()) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const word = (at: number) => String.fromCharCode(...bytes.slice(at, at + 4));
      const recipe = RECIPES[index]?.[1];
      expect({
        path,
        riff: word(0),
        wave: word(8),
        format: view.getUint16(20, true),
        channels: view.getUint16(22, true),
        rate: view.getUint32(24, true),
        bits: view.getUint16(34, true),
        data: word(36),
        ms: (view.getUint32(40, true) / 2 / RATE) * 1000,
      }).toEqual({
        path,
        riff: 'RIFF',
        wave: 'WAVE',
        format: 1,
        channels: 1,
        rate: RATE,
        bits: 16,
        data: 'data',
        ms: recipe === undefined ? -1 : lengthMs(recipe),
      });
    }
  });

  it('ships each sound as the bytes the current voice renders from its recipe', () => {
    for (const [index, [name, recipe]] of RECIPES.entries())
      expect({
        name,
        same: Buffer.from(files[index]?.bytes ?? []).equals(Buffer.from(voiced(name, recipe).wav)),
      }).toEqual({ name, same: true });
  });

  it('renders the same bytes each time', () => {
    const again = soundFiles();
    for (const [index, file] of files.entries())
      expect(Buffer.from(file.bytes).equals(Buffer.from(again[index]?.bytes ?? []))).toBe(true);
  });
});
