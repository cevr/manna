/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noNewPromise, eslint/no-await-in-loop -- a component test: it mounts the end's drawing in happy-dom (react-native-web) through React's promise-based `act`, one list after another, yields one animation frame for Reanimated's entering styles, and reads nodes whose absent attributes are null. */

/**
 * The end of a run's drawing alone (`Tended`, R2), mounted on the scheme's
 * ground in light and in dark over generated lists of 0 to 12 grown verses,
 * at every stage, with references of the longest book names and with a
 * trailing space. For each list: the line is `grewLine(n)`; one `tended`,
 * one sun, and one `grown` per verse in order, each `role="img"` named
 * `<reference>, <stage>` unmodified, holding one image (the stage's home
 * icon of the scheme shown) and only hidden children; no control and no
 * alert; the text a screen reader is given is the line alone; and every
 * text holds a text role of the scheme at AA (`lookFaults`). With motion
 * on, over generated lists of 0 to 14, each grown image's entry and sway
 * equal `endMotionOf` and nothing else moves (`motionFaults`). Today's
 * wiring of it is the root rule's and `accept/end.test.tsx`'s.
 */

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { View } from 'react-native';

import { STAGES, type Stage } from '../garden';
import type { Grown } from '../home/grown';
import { endMotionOf } from '../home/motion';
import { below, random } from '../test/garden-model';
import { lookFaults, setSystem } from '../test/look';
import { entryOf, swayOf, under } from '../test/motion';
import { motionFaults } from '../test/motion-rule';
import { grewLine } from '../test/run-model';
import { theme, type Scheme } from '../theme';
import { Tended } from './tended';

const SEED = 9302;
const CASES = 36;
const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const BOOKS = ['Song of Solomon', '2 Thessalonians', 'Isaiah', 'Psalms', 'John'] as const;
const ICONS: Readonly<Record<Stage, string>> = {
  seed: 'seed',
  blade: 'blade',
  ear: 'ear',
  'full corn': 'corn',
};
const ICON = /\/assets\/home\/([a-z]+)-(light|dark)\.png$/u;
const CONTROLS =
  '[role="button"],[role="link"],[role="radio"],[role="checkbox"],[role="switch"],button,a,input';

/** A list of `n` grown verses, each reference once, at generated stages. */
const listOf = (next: () => number, n: number): readonly Grown[] => {
  const seen = new Set<string>();
  const out: Grown[] = [];
  while (out.length < n) {
    const book = BOOKS[below(next, BOOKS.length)] ?? 'John';
    const trailing = ' '.repeat(Number(below(next, 5) === 0));
    const reference = `${book} ${1 + below(next, 9)}:${1 + below(next, 30)}${trailing}`;
    if (seen.has(reference.trim())) continue;
    seen.add(reference.trim());
    out.push({ reference, stage: STAGES[below(next, STAGES.length)] ?? 'seed' });
  }
  return out;
};

/** A list's length by its turn: none, one, or several (2 to 12). */
const sizeOf = (next: () => number, turn: number) => {
  if (turn < 2) return turn;
  return 2 + below(next, 11);
};

const by = (host: Element, id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];

/** The text a screen reader is given under `host`: text outside every hidden subtree, whitespace collapsed. */
const exposedOf = (host: Element) => {
  const walker = document.createTreeWalker(host, 4);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
    if (node.parentElement?.closest('[aria-hidden="true"]') == null)
      parts.push(node.textContent ?? '');
  return parts.join(' ').replace(/\s+/gu, ' ').trim();
};

/** An image's home icon of `scheme`, or what it is instead. */
const iconOf = (image: Element | undefined, scheme: Scheme) => {
  const found = ICON.exec(image?.getAttribute('src') ?? '');
  if (found === null) return '<no home icon>';
  if (found[2] !== scheme) return `<${found[1]} of the ${found[2]} set>`;
  return found[1] ?? '';
};

/** What one `grown` node shows: its role and name, its icon, and whether every child is hidden. */
const grownOf = (node: Element, scheme: Scheme) => {
  const images = [...node.querySelectorAll('img')];
  const icon = (): string => {
    if (images.length !== 1) return `<${images.length} images>`;
    return iconOf(images[0], scheme);
  };
  return {
    role: node.getAttribute('role'),
    name: node.getAttribute('aria-label'),
    icon: icon(),
    hidden: [...node.children].every((child) => child.getAttribute('aria-hidden') === 'true'),
  };
};

/** What the drawing over `grown` shows in `scheme`, read as the test's want is written. */
const drawn = async (grown: readonly Grown[], scheme: Scheme) => {
  setSystem(scheme);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <View style={{ backgroundColor: theme[scheme].ground }}>
        <Tended grown={grown} />
      </View>,
    ),
  );
  const tended = by(host, 'tended');
  const end = tended[0] ?? host;
  const grownNodes = by(end, 'grown');
  const sun = [...end.querySelectorAll('img')].find(
    (image) => image.closest('[data-testid="grown"]') === null,
  );
  const seen = {
    tended: tended.length,
    line: by(end, 'grew').map((node) => node.textContent),
    sun: iconOf(sun, scheme),
    suns: end.querySelectorAll('img').length - grownNodes.length,
    grown: grownNodes.map((node) => grownOf(node, scheme)),
    controls: end.querySelectorAll(CONTROLS).length,
    alerts: end.querySelectorAll('[role="alert"]').length,
    exposed: exposedOf(host),
    look: lookFaults(host, scheme),
  };
  await act(async () => root.unmount());
  host.remove();
  return seen;
};

const want = (grown: readonly Grown[], scheme: Scheme) => ({
  tended: 1,
  line: [grewLine(grown.length)],
  sun: 'sun',
  suns: 1,
  grown: grown.map((each) => ({
    role: 'img',
    name: `${each.reference}, ${each.stage}`,
    icon: ICONS[each.stage],
    hidden: true,
  })),
  controls: 0,
  alerts: 0,
  exposed: grewLine(grown.length),
  look: [],
  scheme,
});

const MOTION_SEED = 4417;
const MOTION_CASES = 10;
const delayOf = (delay: Option.Option<number>) =>
  Option.match(delay, { onNone: () => null, onSome: (ms) => ms });

/** A motion list's length by its turn: 0 and 1, then 13 and 14 past the cap, else 2 to 14. */
const motionSizeOf = (next: () => number, turn: number) => {
  if (turn < 2) return turn;
  if (turn < 4) return 11 + turn;
  return 2 + below(next, 13);
};

/** Each grown node's name, its image's entry and sway, read from the document with motion on. */
const movedOf = async (grown: readonly Grown[]) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Tended grown={grown} />));
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const seen = {
    grown: by(host, 'grown').map((node) => ({
      name: node.getAttribute('aria-label'),
      spring: entryOf(node.querySelector('img'), node),
      sway: swayOf(node.querySelector('img'), node),
    })),
    faults: motionFaults(host),
  };
  await act(async () => root.unmount());
  host.remove();
  return seen;
};

describe('the end of a run, drawn alone', () => {
  it('springs each grown image by endMotionOf over generated lists of 0 to 14, swaying full corn, with nothing else moving', () =>
    under('no-preference', async () => {
      const next = random(MOTION_SEED);
      const floors = { past: 0, corn: 0, held: 0 };
      for (let turn = 0; turn < MOTION_CASES; turn += 1) {
        const grown = listOf(next, motionSizeOf(next, turn));
        const plan = endMotionOf(grown);
        const seen = await movedOf(grown);
        expect(seen, `list ${turn}`).toEqual({
          grown: grown.map((each, index) => ({
            name: `${each.reference}, ${each.stage}`,
            spring: delayOf(plan[index]?.spring ?? Option.none()),
            sway: plan[index]?.sway ?? false,
          })),
          faults: [],
        });
        expect(
          seen.grown.map(({ spring, sway }) => [spring, sway]),
          `list ${turn}, by the rule`,
        ).toEqual(
          grown.map((each, index) => {
            if (index >= 12) return [null, false];
            return [Math.min(300 + 160 * index, 1200), each.stage === 'full corn'];
          }),
        );
        if (grown.length > 12) floors.past += 1;
        if (grown.slice(0, 12).some((each) => each.stage === 'full corn')) floors.corn += 1;
        if (grown.length > 6) floors.held += 1;
      }
      for (const [kind, count] of Object.entries(floors))
        expect(count, kind).toBeGreaterThanOrEqual(2);
    }));

  it('draws the line, the sun and each grown verse as one hidden-children image, over generated lists in both schemes', async () => {
    const next = random(SEED);
    const tally = {
      stages: new Map<Stage, number>(),
      none: 0,
      one: 0,
      several: 0,
      trailing: 0,
      longest: 0,
      schemes: new Set<Scheme>(),
    };
    for (let at = 0; at < CASES; at += 1) {
      const scheme = SCHEMES[at % 2] ?? 'light';
      const n = sizeOf(next, Math.floor(at / 2) % 3);
      const grown = listOf(next, n);
      expect({ ...(await drawn(grown, scheme)), scheme }).toEqual(want(grown, scheme));
      tally.schemes.add(scheme);
      if (n === 0) tally.none += 1;
      else if (n === 1) tally.one += 1;
      else tally.several += 1;
      for (const each of grown) {
        tally.stages.set(each.stage, (tally.stages.get(each.stage) ?? 0) + 1);
        if (each.reference.endsWith(' ')) tally.trailing += 1;
        if (/^(Song of Solomon|2 Thessalonians) /u.test(each.reference)) tally.longest += 1;
      }
    }
    expect({
      stages: STAGES.filter((stage) => (tally.stages.get(stage) ?? 0) < 5),
      none: tally.none >= 3,
      one: tally.one >= 3,
      several: tally.several >= 3,
      trailing: tally.trailing > 0,
      longest: tally.longest > 0,
      schemes: [...tally.schemes].toSorted(),
    }).toEqual({
      stages: [],
      none: true,
      one: true,
      several: true,
      trailing: true,
      longest: true,
      schemes: ['dark', 'light'],
    });
  });
});
