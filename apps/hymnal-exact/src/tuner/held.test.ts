/**
 * What the tuner's port takes from the current app stays the current app's:
 * the declarations Exact's type check reads in place of its tuner modules
 * (`src/tuner/decl/*.d.ts`, mapped by the app's `tsconfig.json`; the
 * workspace's typecheck reads the sources) are each assigned the source's
 * exports, so the repo's type check of this file fails the day a source
 * drifts; the screen's measures (`PLACES`), its words, the microphone's
 * purpose and the reading's pace are read from the current app's files.
 */

import { expect, test } from 'bun:test';

import * as focus from '@manna/hymnal-app/tuner/focus';
import * as pitch from '@manna/hymnal-app/tuner/pitch';
import * as screen from '@manna/hymnal-app/tuner/screen';
import * as session from '@manna/hymnal-app/tuner/session';
import * as tuning from '@manna/hymnal-app/tuner/tuning';
import { app } from '@manna/hymnal-app/vite/app';

import { styleIn } from '@manna/exact-kit/look/testing';

import strings from '../../strings/en.json';
import { appFile, oneFile } from '../look/design.testing.ts';
import type * as FocusDecl from './decl/focus';
import type * as PitchDecl from './decl/pitch';
import type * as ScreenDecl from './decl/screen';
import type * as SessionDecl from './decl/session';
import type * as TuningDecl from './decl/tuning';
import { PLACES, TICK_MARKS } from './places.ts';

/** A module's declaration with each function's parameters compared both ways (TypeScript's method bivariance). */
type Held<T> = {
  [K in keyof T]: T[K] extends (...args: infer P) => infer R
    ? { bivariant(...args: P): R }['bivariant']
    : T[K];
};

const held = {
  focus: { unfocused: focus.unfocused, hear: focus.hear } satisfies Held<typeof FocusDecl>,
  pitch: { detect: pitch.detect } satisfies Held<typeof PitchDecl>,
  tuning: {
    STRINGS: tuning.STRINGS,
    IN_TUNE_CENTS: tuning.IN_TUNE_CENTS,
    reading: tuning.reading,
    readingOn: tuning.readingOn,
  } satisfies Held<typeof TuningDecl>,
  screen: {
    noteOf: screen.noteOf,
    LABEL_EVERY: screen.LABEL_EVERY,
    LOWEST: screen.LOWEST,
    pickOf: screen.pickOf,
    autoOf: screen.autoOf,
    BACK_TO_AUTO: screen.BACK_TO_AUTO,
    pickedHint: screen.pickedHint,
    SWING: screen.SWING,
    TICKS: screen.TICKS,
    ACROSS: screen.ACROSS,
  } satisfies Held<typeof ScreenDecl>,
  session: {
    Event: session.Event,
    voiced: session.voiced,
    holdsMicrophone: session.holdsMicrophone,
    opened: session.opened,
    step: session.step,
    STRING_NAMES: session.STRING_NAMES,
    LEFT: session.LEFT,
    RIGHT: session.RIGHT,
    NEEDLE_CENTS: session.NEEDLE_CENTS,
    needleOf: session.needleOf,
    labelOf: session.labelOf,
    hintOf: session.hintOf,
    NOT_LISTENING: session.NOT_LISTENING,
    nameOf: session.nameOf,
    wordsOf: session.wordsOf,
    TUNED_FRAMES: session.TUNED_FRAMES,
    unlatched: session.unlatched,
    latch: session.latch,
    stringLabel: session.stringLabel,
    FEED_RATE: session.FEED_RATE,
    FRAME: session.FRAME,
    feedOf: session.feedOf,
    feedFrame: session.feedFrame,
  } satisfies Held<typeof SessionDecl>,
};

const TUNER = 'src/tuner/Tuner.tsx';
const MARK = 'src/player/TunerMark.tsx';

/** A style's number property in a One file. */
const styled = (path: string, style: string, prop: string): number =>
  Number(styleIn(oneFile(path), style)?.get(prop));

/** A number constant a One file declares, exported or not. */
const constant = (path: string, name: string): number => {
  const found = new RegExp(`^(?:export )?const ${name} = (\\d+(?:\\.\\d+)?);$`, 'mu').exec(
    oneFile(path),
  );
  expect(found).not.toBeNull();
  return Number(found?.[1]);
};

/** The number the current app's file writes after `text`, as in `paddingTop: insets.top + 8`. */
const after = (path: string, text: string): number => {
  const at = oneFile(path).indexOf(text);
  expect(at).toBeGreaterThan(-1);
  return Number(/^\s*(\d+(?:\.\d+)?)/u.exec(oneFile(path).slice(at + text.length))?.[1]);
};

test('every declared export is there at run time', () => {
  for (const module of Object.values(held))
    for (const value of Object.values(module)) expect(value).toBeDefined();
});

test('the screen’s measures are the current app’s', () => {
  const radius = constant(TUNER, 'RADIUS');
  expect(PLACES).toEqual({
    side: styled(TUNER, 'screen', 'paddingHorizontal'),
    gap: styled(TUNER, 'screen', 'gap'),
    top: after(TUNER, 'paddingTop: insets.top +'),
    foot: after(TUNER, 'paddingBottom: insets.bottom +'),
    headHigh: styled(TUNER, 'headButton', 'minHeight'),
    autoGap: styled(TUNER, 'auto', 'gap'),
    areaHigh: styled(TUNER, 'gaugeArea', 'minHeight'),
    areaGap: styled(TUNER, 'gaugeArea', 'gap'),
    gaugeWide: 2 * radius + 20,
    gaugeHigh: radius + 16,
    spoke: radius,
    spokeFoot: styled(TUNER, 'spoke', 'bottom'),
    tickWide: styled(TUNER, 'tick', 'width'),
    tickHigh: styled(TUNER, 'tick', 'height'),
    majorHigh: styled(TUNER, 'majorTick', 'height'),
    centreWide: styled(TUNER, 'centreTick', 'width'),
    centreHigh: styled(TUNER, 'centreTick', 'height'),
    windowHigh: after(TUNER, 'window && { backgroundColor: accent, height:'),
    needleHigh: radius - 14,
    thin: styled(TUNER, 'thin', 'width'),
    wide: styled(TUNER, 'wide', 'width'),
    hub: styled(TUNER, 'hub', 'width'),
    hubFoot: styled(TUNER, 'hub', 'bottom'),
    hubLine: styled(TUNER, 'hub', 'borderWidth'),
    sideIn: styled(TUNER, 'flatSide', 'left'),
    hintX: styled(TUNER, 'hint', 'paddingHorizontal'),
    hintY: styled(TUNER, 'hint', 'paddingVertical'),
    hintRound: styled(TUNER, 'hint', 'borderRadius'),
    hintHigh: styled(TUNER, 'hint', 'minHeight'),
    readingGap: styled(TUNER, 'reading', 'gap'),
    noteHigh: styled(TUNER, 'note', 'minHeight'),
    stockTop: styled(TUNER, 'headstock', 'paddingTop'),
    columnY: styled(TUNER, 'column', 'paddingVertical'),
    columnGap: styled(TUNER, 'column', 'gap'),
    postWide: styled(TUNER, 'post', 'width'),
    postHigh: styled(TUNER, 'post', 'height'),
    pegWide: styled(TUNER, 'peg', 'width'),
    pegHigh: styled(TUNER, 'peg', 'height'),
    pegRound: styled(TUNER, 'peg', 'borderRadius'),
    pegLine: styled(TUNER, 'peg', 'borderWidth'),
    faceWide: styled(TUNER, 'face', 'width'),
    faceTop: styled(TUNER, 'face', 'borderTopLeftRadius'),
    faceFoot: styled(TUNER, 'face', 'borderBottomLeftRadius'),
    faceLine: styled(TUNER, 'face', 'borderWidth'),
    stringsTop: styled(TUNER, 'strings', 'paddingTop'),
    line: styled(TUNER, 'line', 'width'),
    litLine: after(TUNER, 'isLit(id) && { backgroundColor: accent, width:'),
    nut: styled(TUNER, 'nut', 'height'),
    neckWide: styled(TUNER, 'neck', 'width'),
    neckHigh: styled(TUNER, 'neck', 'height'),
    circle: styled(TUNER, 'circle', 'width'),
    circleLine: styled(TUNER, 'circle', 'borderWidth'),
    badge: styled(TUNER, 'tickBadge', 'width'),
    badgeOut: -styled(TUNER, 'tickBadge', 'right'),
    badgeLine: styled(TUNER, 'tickBadge', 'borderWidth'),
    actionX: styled(TUNER, 'action', 'paddingHorizontal'),
    actionY: styled(TUNER, 'action', 'paddingVertical'),
    actionRound: styled(TUNER, 'action', 'borderRadius'),
    messageGap: styled(TUNER, 'message', 'gap'),
    markWide: styled(MARK, 'mark', 'width'),
    markHigh: styled(MARK, 'mark', 'height'),
  });
});

test('the gauge’s ticks are the current app’s, each at its angle on the swing', () => {
  expect(TICK_MARKS.map((tick) => tick.cents)).toEqual([...screen.TICKS]);
  expect(TICK_MARKS.find((tick) => tick.cents === 50)?.angle).toBe(screen.SWING);
  expect(TICK_MARKS.filter((tick) => tick.window).map((tick) => tick.cents)).toEqual([-5, 5]);
});

test('the screen’s words are the current app’s', () => {
  const contract = appFile('features/tuner.contract');
  const one = oneFile(TUNER) + oneFile('src/reader/ChordSheet.tsx');
  const words = [
    'Microphone is off for Hymnal',
    'Open Settings',
    'Tap to listen again',
    'Done',
    'Auto',
    'Tuner',
  ];
  expect(words.filter((each) => !new RegExp(`>\\s*${each}\\s*<`, 'u').test(one))).toEqual([]);
  expect(words.filter((each) => !contract.includes(`"${each}"`))).toEqual([]);
});

test('the microphone’s purpose is the current app’s, in both grants', () => {
  expect(strings.tunerPurpose).toBe(app.audio.microphone);
  expect(appFile('app.ts').split("'device.microphone tunerPurpose'").length - 1).toBe(2);
});

test('the reading’s words change at most once a `LABEL_EVERY`', () => {
  const hush = /\n {2}task tunerHush when [^\n]*\n {4}after\((\d+), tunerUnhushed\)/u.exec(
    appFile('features/tuner.contract'),
  );
  expect(Number(hush?.[1])).toBe(screen.LABEL_EVERY);
});
