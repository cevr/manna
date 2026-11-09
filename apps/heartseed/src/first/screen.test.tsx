/* oxlint-disable effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noNewPromise -- a React screen test: it drives the root route in happy-dom's document through the launch's promise-based `act`, each turn handed over until the frame the test waits on lands, at most 3 s; it reads nodes whose absent attributes are null, from plain branches. */

/**
 * The first minute's look as a reader meets it, through `screenLaunch`: the
 * root route mounted in happy-dom under the app's own layer over the real
 * store on the device's `One.Database` (`src/test/one.tsx`), a scripted
 * recital and a voice source that records its calls and sends the events
 * the test gives it, every frame held to the root's frame rule
 * (`rootFaults`). The letters
 * phase shows each letter in Today's cue ink at AA on its ground, at rest
 * and while listening, and the hear phase's words not yet read, the phase
 * line and the reference keep the mute; the cue ink and the mute are one
 * colour, the light scheme's `quiet`, so the letters count among the muted
 * texts. Every element of every phase at
 * rest, of the hear phase while it reads and of the letters while their
 * recital listens keeps base's look (`BASE_LOOK`), the letters' ink alone
 * left out. It counts words without printing one.
 */

import { describe, expect, it } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { scriptedSource } from '../dictation/script';
import { sourceWords } from '../matcher/words';
import { AA, contrastOf } from '../test/contrast';
import { screenLaunch as mount } from '../test/first-rig';
import { computed } from '../test/look';
import { device } from '../test/one';
import { face, theme } from '../theme';
import { wordSpans } from '../voice/reading';

const WORDS = sourceWords(passage.text);
const SPANS = wordSpans(passage.text);
const INK = computed(theme.light.ink);
/** Today's cue ink, the light scheme's `quiet`: the first minute's letters are seen in it. */
const CUE = computed(theme.light.quiet);
/** The light scheme's `quiet`, as the mute: the hear phase's words not yet read, the phase line and the reference keep it. */
const MUTE = computed(theme.light.quiet);
/** Each word's seen letter in the letters phase: the one part of its node not hidden from the screen reader, none when the word is not shown in letters. */
const lettersIn = (host: Element) =>
  WORDS.flatMap((_, index) => {
    const word = host.querySelector(`[data-testid="word-${index}"]`);
    const seen = [...(word?.children ?? [])].filter((part) => !part.hasAttribute('aria-hidden'));
    return seen.length === 1 && seen[0] !== undefined ? [seen[0]] : [];
  });

/** The letters' ink and contrast, counted: how many are seen, in the cue's ink, and at AA on the ground behind them. */
const lettersLook = (host: Element) => {
  const letters = lettersIn(host);
  return {
    letters: letters.length,
    cue: letters.filter((letter) => getComputedStyle(letter).color === CUE).length,
    aa: letters.filter((letter) => contrastOf(letter) >= AA).length,
  };
};

/** How many texts are seen in the mute: each element that holds text and no other element, painted the light scheme's `quiet`. */
const mutedTexts = (host: Element) =>
  [...host.querySelectorAll('*')].filter(
    (node) =>
      node.children.length === 0 &&
      (node.textContent ?? '') !== '' &&
      getComputedStyle(node).color === MUTE,
  ).length;

/** The computed styles a look holds, beside each element's role, test id, labels, `aria-*` and text. */
const LOOK_STYLES = [
  'color',
  'backgroundColor',
  'opacity',
  'display',
  'visibility',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
] as const;

/** A text or label as a look holds it: `#` for one of the verse's own, so no word is written down. */
const shownText = (text: string | null) =>
  text === null || text === '' ? '' : passage.text.includes(text.trim()) ? '#' : text;

/** The big button's ring while it pulses: its opacity moves with the clock, so a look holds it as moving. */
const PULSE = computed(theme.light.pulse);

/**
 * A frame's look: every element of `host` as one line (its tag, role, test
 * id with a word's index dropped, `aria-label`, every other `aria-*`, the
 * text it holds when it holds no element, and each of `LOOK_STYLES`), each
 * distinct line with how many elements show it. In the letters phase
 * (`letters`), the letters' ink is left out: it is the one part of the
 * first minute's look moved from base's.
 */
const lookOf = (host: Element, letters = false) => {
  const inked = new Set<Element>(letters ? lettersIn(host) : []);
  const lines = new Map<string, number>();
  for (const node of host.querySelectorAll('*')) {
    const style = getComputedStyle(node);
    const moving = (name: (typeof LOOK_STYLES)[number]) =>
      name === 'opacity' && style.backgroundColor === PULSE;
    const aria = [...node.attributes]
      .filter((attribute) => attribute.name.startsWith('aria-') && attribute.name !== 'aria-label')
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .toSorted();
    const line = [
      node.tagName.toLowerCase(),
      node.getAttribute('role') ?? '',
      (node.getAttribute('data-testid') ?? '').replace(/^word-\d+$/u, 'word-#'),
      shownText(node.getAttribute('aria-label')),
      aria.join(','),
      node.children.length === 0 ? shownText(node.textContent) : '',
      ...LOOK_STYLES.map((name) => {
        if (name === 'color' && inked.has(node)) return 'the letters’ ink';
        return moving(name) ? 'moving' : style[name];
      }),
    ].join('|');
    lines.set(line, (lines.get(line) ?? 0) + 1);
  }
  return [...lines].map(([line, count]) => `${count}× ${line}`).toSorted();
};

const CLEAR = 'rgba(0, 0, 0, 0.00)';
const GROUND = computed(theme.light.ground);
const CARD = computed(theme.light.card);
const SOFT = computed(theme.light.soft);
const ON_INK = computed(theme.light.onInk);
/** A view's display, visibility and the browser's default font, as a look line ends for a box. */
const VIEW = 'flex||"Times New Roman"|16px|normal|normal';
const REFERENCE = `1× div||reference|||Isaiah 41:10|${MUTE}|${CLEAR}||inline||${face}|17px|600|normal`;
const RING = `1× div||||aria-hidden=true|||${PULSE}|moving|${VIEW}`;
const HALO = `1× div||||aria-hidden=true|||${CLEAR}||${VIEW}`;
const heading = (text: string) =>
  `1× h1|heading|||aria-level=1|${text}|${INK}|${CLEAR}||inline||${face}|34px|700|normal`;
const button = (label: string, ground: string) =>
  `1× button|button||${label}||||${ground}||${VIEW}`;
const pill = (text: string, ink: string) =>
  `1× div|||||${text}|${ink}|${CLEAR}||inline||${face}|17px|600|normal`;
const phaseLine = (text: string) =>
  `1× div|||||${text}|${MUTE}|${CLEAR}||inline||${face}|13px|normal|normal`;
const boxes = (count: number, ground: string, opacity = '') =>
  `${count}× div|||||||${ground}|${opacity}|${VIEW}`;
const LETTERS_LOOK = [
  `32× span||||aria-hidden=true|#|${CLEAR}|${CLEAR}||inline||${face}|24px|normal|36px`,
  `37× div||word-#|#|||rgba(0, 0, 0, 1.00)|${CLEAR}||inline||${face}|24px|normal|36px`,
  `37× span|||||#|the letters’ ink|${CLEAR}||inline||${face}|24px|normal|36px`,
  REFERENCE,
  HALO,
  RING,
  phaseLine('First letters stay. Tap the button and say it.'),
  boxes(1, GROUND),
  heading('Say it with help'),
  boxes(2, SOFT, '0.5'),
  boxes(2, INK, '1'),
  boxes(4, CLEAR),
];

/**
 * The first minute's look on base (`33ebbe21b`), by `lookOf`, in each frame
 * the look test reaches: every phase at rest, the hear phase with its first
 * word read, and the letters while their recital listens. Recorded at this
 * unit's head with the letters put back in the mute, which gives the same
 * lines: the letters' ink is the one line `lookOf` leaves out. The hear
 * phase's words while read sit in the reading view, whose box alone gains
 * its `reading` test id; every other line is base's.
 */
const BASE_LOOK = {
  hear: [
    button('Listen', INK),
    button('Next', CARD),
    REFERENCE,
    HALO,
    RING,
    pill('Listen', ON_INK),
    pill('Next', INK),
    phaseLine('The voice reads it. Words light as they are read.'),
    boxes(1, GROUND),
    boxes(1, INK, '1'),
    heading('Hear it'),
    `37× div||word-#||aria-selected=false|#|${INK}|${CLEAR}||inline||${face}|24px|normal|36px`,
    boxes(3, SOFT, '0.5'),
    boxes(5, CLEAR),
  ],
  reading: [
    button('Next', CARD),
    REFERENCE,
    `1× div||word-#||aria-selected=true|#|${INK}|${computed(theme.light.hearing)}||inline||${face}|24px|normal|36px`,
    HALO,
    RING,
    pill('Next', INK),
    phaseLine('The voice reads it. Words light as they are read.'),
    boxes(1, GROUND),
    boxes(1, INK, '1'),
    heading('Hear it'),
    `36× div||word-#||aria-selected=false|#|${MUTE}|${CLEAR}||inline||${face}|24px|normal|36px`,
    boxes(3, SOFT, '0.5'),
    `1× div||reading|||||${CLEAR}||${VIEW}`,
    boxes(4, CLEAR),
  ],
  letters: [button('Say it', INK), pill('Say it', ON_INK), ...LETTERS_LOOK],
  listening: [button('Listening', INK), pill('Listening', ON_INK), ...LETTERS_LOOK],
  alone: [
    button('Say it', INK),
    REFERENCE,
    HALO,
    RING,
    phaseLine('Only the line is left. Say it from memory.'),
    pill('Say it', ON_INK),
    boxes(1, SOFT, '0.5'),
    boxes(1, GROUND),
    heading('Say it alone'),
    `37× div||word-#||aria-hidden=true|||${CLEAR}||${VIEW}`,
    `37× div|||||#|${CLEAR}|${CLEAR}||inline||${face}|24px|normal|30px`,
    boxes(3, INK, '1'),
    boxes(4, CLEAR),
  ],
  planted: [
    button('Continue', CARD),
    `1× div||plant||aria-hidden=true|||${CLEAR}||${VIEW}`,
    REFERENCE,
    `1× div||stage|Stage: seed||A seed|${MUTE}|${CLEAR}||inline||${face}|15px|normal|normal`,
    HALO,
    pill('Continue', INK),
    phaseLine('Your first promise is a seed.'),
    boxes(1, computed(theme.light.soil)),
    boxes(1, computed(theme.light.gold)),
    boxes(1, GROUND),
    heading('Planted'),
    boxes(4, INK, '1'),
    boxes(6, CLEAR),
  ],
} satisfies Readonly<Record<string, readonly string[]>>;

describe('the first minute', () => {
  it('shows every letter of the letters phase in Today’s cue ink at AA on its ground, at rest and while its recital listens, while the hear phase’s words not yet read, the phase line and the reference keep the mute', async () => {
    device.launch([]);
    const open = scriptedSource([{ at: 600_000, final: false, runs: [] }]);
    const first = await mount(Promise.resolve(), open);
    expect(await first.until(() => first.heading() === 'Hear it')).toBe(true);
    const reference = first.host.querySelector('[data-testid="reference"]');
    expect(reference === null ? null : getComputedStyle(reference).color).toBe(MUTE);
    await first.click('Listen');
    await first.send({ kind: 'range', location: SPANS[0]?.start ?? 0, length: 1 });
    expect(await first.until(() => first.inked() === 1)).toBe(true);
    const unread = WORDS.filter((_, index) => {
      const node = first.word(index);
      return index > 0 && node !== null && getComputedStyle(node).color === MUTE;
    }).length;
    expect(unread).toBe(WORDS.length - 1);
    expect(mutedTexts(first.host)).toBe(WORDS.length - 1 + 2);
    await first.send({ kind: 'finish', location: 0, length: 0 });
    expect(await first.until(() => first.heading() === 'Say it with help')).toBe(true);
    const all = { letters: WORDS.length, cue: WORDS.length, aa: WORDS.length };
    expect([lettersLook(first.host), mutedTexts(first.host)]).toEqual([all, 2 + WORDS.length]);
    await first.click('Say it');
    expect(await first.until(() => first.buttons().includes('Listening'))).toBe(true);
    expect([lettersLook(first.host), mutedTexts(first.host)]).toEqual([all, 2 + WORDS.length]);
    expect(reference === null ? null : getComputedStyle(reference).color).toBe(MUTE);
    await first.leave();
  });

  it('keeps base’s look element for element in every phase at rest (hear, letters, alone, Planted), while the hear phase reads and while the letters’ recital listens, the letters’ ink alone moved', async () => {
    const looks: Partial<Record<keyof typeof BASE_LOOK, readonly string[]>> = {};
    device.launch([]);
    const held = await mount(
      Promise.resolve(),
      scriptedSource([{ at: 600_000, final: false, runs: [] }]),
    );
    expect(await held.until(() => held.heading() === 'Hear it')).toBe(true);
    looks.hear = lookOf(held.host);
    await held.click('Listen');
    await held.send({ kind: 'range', location: SPANS[0]?.start ?? 0, length: 1 });
    expect(await held.until(() => held.inked() === 1)).toBe(true);
    looks.reading = lookOf(held.host);
    await held.send({ kind: 'finish', location: 0, length: 0 });
    expect(await held.until(() => held.heading() === 'Say it with help')).toBe(true);
    looks.letters = lookOf(held.host, true);
    await held.click('Say it');
    expect(await held.until(() => held.buttons().includes('Listening'))).toBe(true);
    looks.listening = lookOf(held.host, true);
    await held.leave();
    device.launch([]);
    const said = await mount();
    expect(await said.until(() => said.heading() === 'Hear it')).toBe(true);
    await said.click('Next');
    expect(await said.until(() => said.heading() === 'Say it with help')).toBe(true);
    await said.click('Say it');
    expect(
      await said.until(
        () => said.heading() === 'Say it alone' && said.buttons().includes('Say it'),
      ),
    ).toBe(true);
    looks.alone = lookOf(said.host);
    await said.click('Say it');
    expect(await said.until(() => said.heading() === 'Planted')).toBe(true);
    looks.planted = lookOf(said.host);
    await said.leave();
    expect(looks).toEqual(
      Object.fromEntries(
        Object.entries(BASE_LOOK).map(([frame, lines]) => [frame, lines.toSorted()]),
      ),
    );
  });
});
