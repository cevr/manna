/* oxlint-disable effect/noNullish, effect/noAsyncFunction, effect/noTernary, eslint/no-await-in-loop -- a React drawing test: it mounts the plant and the root in happy-dom's document through React's promise-based `act`, one command after another, and reads nodes whose absent attributes are null. */

/**
 * The plant set as Today's stage line and the first minute's Planted draw
 * it (`src/home/plant.tsx`), held to the drawing rule
 * (`src/test/plant-image-rule.ts`) against filenames written out here:
 * every stage in each scheme at each size from its first commit; a
 * presentation model (`{ mounted, stage, scheme, size }`) walked by
 * generated commands against the mounted plant; the rule's own faults on
 * seeded drawings; and the root's Today and Planted under a stored Light
 * or Dark over the other system, which flips under them, with Reduce
 * Motion off so an entrance around a still drawing would show.
 */

import { describe, expect, it } from 'bun:test';
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { APPEARANCE_KEY } from '../appearance';
import type { Stage } from '../garden';
import { screenLaunch } from '../test/first-rig';
import { below, random } from '../test/garden-model';
import { setSystem } from '../test/look';
import { entryOf, setMotion } from '../test/motion';
import { device } from '../test/one';
import { ownsImages, plantFaults } from '../test/plant-image-rule';
import { END } from '../test/root-rule';
import * as stageRig from '../test/stage-rig';
import type { Scheme } from '../theme';
import { PlantImage, type PlantSize } from './plant';

/** Each stage's image in each scheme, written out apart from the product's mapping. */
const FILES: Readonly<Record<Stage, Readonly<Record<Scheme, string>>>> = {
  seed: { light: 'assets/home/seed-light.png', dark: 'assets/home/seed-dark.png' },
  blade: { light: 'assets/home/blade-light.png', dark: 'assets/home/blade-dark.png' },
  ear: { light: 'assets/home/ear-light.png', dark: 'assets/home/ear-dark.png' },
  'full corn': { light: 'assets/home/corn-light.png', dark: 'assets/home/corn-dark.png' },
};
const STAGES: readonly Stage[] = ['seed', 'blade', 'ear', 'full corn'];
const SCHEMES: readonly Scheme[] = ['light', 'dark'];
const SIZES: readonly PlantSize[] = [28, 112];

/** An image's source, as `assets/home/<name>-<scheme>.png` when it is one of the home set's. */
const sourceOf = (image: Element | null | undefined) => {
  const src = image?.getAttribute('src') ?? '';
  return /assets\/home\/[a-z]+-(?:light|dark)\.png$/u.exec(src)?.[0] ?? src;
};

/** The background the image paints, read as the source it names. */
const paintedOf = (top: Element) => {
  const painted = [...top.querySelectorAll('[style*="background-image"]')].map(
    (node) => (node as HTMLElement).style.backgroundImage,
  );
  return painted.map((url) => /assets\/home\/[a-z]+-(?:light|dark)\.png/u.exec(url)?.[0] ?? url);
};

/** What a case still holds when it ends, passed or failed, so the next case starts clean: hosts by their roots, the root rigs' leaves, and the motion settings to restore. */
const left = {
  hosts: new Map<Root, Element>(),
  leaves: [] as (() => Promise<void>)[],
  restores: [] as (() => Promise<void>)[],
};

/** A host in the document with its own React root. */
const hostOf = () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  left.hosts.set(root, host);
  return { host, root };
};

const render = (root: Root, node: ReactNode) => act(async () => root.render(node));
const close = async (root: Root, host: Element) => {
  left.hosts.delete(root);
  await act(async () => root.unmount());
  host.remove();
};
const system = (scheme: Scheme) => act(async () => setSystem(scheme));

/** Unmounts what the case left, leaves its root rigs (their own checks run), restores the motion setting and the light system. */
const cleanUp = async () => {
  for (const [root, host] of left.hosts) await close(root, host);
  for (const leave of left.leaves.splice(0)) await leave();
  for (const restore of left.restores.splice(0)) await restore();
  await system('light');
};

/** A case's body, cleaned up after whether it passes or fails. */
const cleaned = (body: () => Promise<void>) => () => body().finally(cleanUp);

/** What the plant draws at its first commit, before any effect of the image's own: the sources of its images. */
const FirstCommit = ({ seen, children }: { seen: string[][]; children: ReactNode }) => {
  useLayoutEffect(() => {
    seen.push(
      [...document.querySelectorAll('[data-testid="plant"] img')].map((image) => sourceOf(image)),
    );
  }, [seen]);
  return children;
};

describe('every stage in each scheme at each size', () => {
  it(
    'draws exactly its own hidden, still image, sized and sourced from its first commit, in all 16 cells',
    cleaned(async () => {
      const cells: string[] = [];
      for (const stage of STAGES)
        for (const scheme of SCHEMES)
          for (const size of SIZES) {
            await system(scheme);
            const { host, root } = hostOf();
            const seen: string[][] = [];
            await render(
              root,
              <FirstCommit seen={seen}>
                <PlantImage stage={stage} size={size} />
              </FirstCommit>,
            );
            const file = FILES[stage][scheme];
            const plant = host.querySelector('[data-testid="plant"]');
            const image = plant?.querySelector('[data-testid="plant-image"]');
            expect(
              {
                faults: plantFaults(host, { asset: file, size }),
                first: seen[0],
                images: [...host.querySelectorAll('img')].map((each) => sourceOf(each)),
                painted: paintedOf(host),
                hidden: [plant?.getAttribute('aria-hidden'), image?.getAttribute('aria-hidden')],
                named: host.querySelectorAll('[aria-label],[role]').length,
                text: host.textContent,
              },
              `${stage}/${scheme}/${size}`,
            ).toEqual({
              faults: [],
              first: [file],
              images: [file],
              painted: [file],
              hidden: ['true', 'true'],
              named: 0,
              text: '',
            });
            cells.push(`${stage}/${scheme}/${size}`);
            await close(root, host);
          }
      await system('light');
      expect(new Set(cells).size).toBe(16);
    }),
  );
});

type Command =
  | { readonly _tag: 'SetStage'; readonly stage: Stage }
  | { readonly _tag: 'SetScheme'; readonly scheme: Scheme }
  | { readonly _tag: 'SetSize'; readonly size: PlantSize }
  | { readonly _tag: 'Unmount' }
  | { readonly _tag: 'Mount' };

interface Model {
  readonly mounted: boolean;
  readonly stage: Stage;
  readonly scheme: Scheme;
  readonly size: PlantSize;
}

/** The model after a command: the stage, the scheme and the size held mounted or not, the mount itself. */
const step = (m: Model, command: Command): Model => {
  switch (command._tag) {
    case 'SetStage':
      return { ...m, stage: command.stage };
    case 'SetScheme':
      return { ...m, scheme: command.scheme };
    case 'SetSize':
      return { ...m, size: command.size };
    case 'Unmount':
      return { ...m, mounted: false };
    case 'Mount':
      return { ...m, mounted: true };
  }
};

/** A generated command: a stage, a scheme or a size (often the one held), or an unmount or mount. */
const commandOf = (next: () => number): Command => {
  const pick = below(next, 10);
  if (pick < 3) return { _tag: 'SetStage', stage: STAGES[below(next, 4)] ?? 'seed' };
  if (pick < 6) return { _tag: 'SetScheme', scheme: SCHEMES[below(next, 2)] ?? 'light' };
  if (pick < 8) return { _tag: 'SetSize', size: SIZES[below(next, 2)] ?? 28 };
  if (pick < 9) return { _tag: 'Unmount' };
  return { _tag: 'Mount' };
};

/** What a command reached, from the model before it and the scheme at the last unmount. */
const reachedBy = (m: Model, command: Command, unmountedIn: Scheme | null): string[] => {
  if (command._tag === 'Mount' && !m.mounted && unmountedIn !== null && unmountedIn !== m.scheme)
    return ['remount in the other scheme'];
  if (!m.mounted) return [];
  switch (command._tag) {
    case 'SetStage':
      return [command.stage === m.stage ? 'same stage' : `stage ${command.stage}`];
    case 'SetScheme':
      return [
        command.scheme === m.scheme
          ? 'same scheme'
          : `${m.scheme} to ${command.scheme} at ${m.size}`,
      ];
    case 'SetSize':
      return [command.size === m.size ? 'same size' : `size ${m.size} to ${command.size}`];
    default:
      return [];
  }
};

/** What the walks must reach: each stage set, each way of the scheme at each size, each way of the size, each repeat, and a remount in the other scheme. */
const FLOORS = [
  'dark to light at 112',
  'dark to light at 28',
  'light to dark at 112',
  'light to dark at 28',
  'remount in the other scheme',
  'same scheme',
  'same size',
  'same stage',
  'size 112 to 28',
  'size 28 to 112',
  'stage blade',
  'stage ear',
  'stage full corn',
  'stage seed',
];

const SEQUENCES = 16;
const COMMANDS = 12;

/** One sequence's walk: the model, the plant mounted as it says (or no mount), and the scheme at its last unmount. */
interface Walk {
  m: Model;
  mounted: { readonly host: HTMLElement; readonly root: Root } | null;
  unmountedIn: Scheme | null;
}

/** Runs `command` on the mounted plant and on the model: the system set, the plant unmounted, or mounted and rendered with the model's stage and size. */
const run = async (walk: Walk, command: Command) => {
  const after = step(walk.m, command);
  if (command._tag === 'SetScheme') await system(command.scheme);
  if (command._tag === 'Unmount' && walk.mounted !== null) {
    await close(walk.mounted.root, walk.mounted.host);
    walk.mounted = null;
    walk.unmountedIn = walk.m.scheme;
  }
  if (command._tag === 'Mount' && walk.mounted === null) walk.mounted = hostOf();
  if (walk.mounted !== null)
    await render(walk.mounted.root, <PlantImage stage={after.stage} size={after.size} />);
  walk.m = after;
};

/** What the document shows against the model: the plant's faults, images and paint when mounted, and no plant anywhere when not. */
const shownAgainst = (walk: Walk) => {
  const file = FILES[walk.m.stage][walk.m.scheme];
  const plants = document.querySelectorAll('[data-testid="plant"]').length;
  if (walk.mounted === null || !walk.m.mounted)
    return {
      shown: { mounted: walk.mounted !== null, plants },
      want: { mounted: false, plants: 0 },
    };
  const { host } = walk.mounted;
  return {
    shown: {
      faults: plantFaults(host, { asset: file, size: walk.m.size }),
      images: [...host.querySelectorAll('img')].map((each) => sourceOf(each)),
      painted: paintedOf(host),
    },
    want: { faults: [], images: [file], painted: [file] },
  };
};

describe('the presentation model, walked', () => {
  it(
    'holds the mounted plant to the model after every command, 16 sequences of 12',
    cleaned(async () => {
      const reached = new Set<string>();
      let checked = 0;
      for (let seed = 1; seed <= SEQUENCES; seed += 1) {
        const next = random(seed);
        const walk: Walk = {
          m: {
            mounted: true,
            stage: STAGES[below(next, 4)] ?? 'seed',
            scheme: SCHEMES[below(next, 2)] ?? 'light',
            size: SIZES[below(next, 2)] ?? 28,
          },
          mounted: hostOf(),
          unmountedIn: null,
        };
        await system(walk.m.scheme);
        await run(walk, { _tag: 'Mount' });
        for (let at = 0; at < COMMANDS; at += 1) {
          const command = commandOf(next);
          for (const each of reachedBy(walk.m, command, walk.unmountedIn)) reached.add(each);
          await run(walk, command);
          const { shown, want } = shownAgainst(walk);
          expect(shown, `seed ${seed} command ${at} ${command._tag}`).toEqual(want);
          checked += 1;
        }
        if (walk.mounted !== null) await close(walk.mounted.root, walk.mounted.host);
      }
      await system('light');
      expect({ checked, missing: FLOORS.filter((floor) => !reached.has(floor)) }).toEqual({
        checked: SEQUENCES * COMMANDS,
        missing: [],
      });
    }),
  );
});

/** A plant mounted for a fixture of the rule, its host returned to be seeded with a defect. */
const fixture = async (node: ReactNode) => {
  const { host, root } = hostOf();
  await render(root, node);
  return { host, done: () => close(root, host) };
};

const SEED = { asset: 'assets/home/seed-light.png', size: 28 };

describe('the drawing rule, against seeded drawings', () => {
  it(
    'names one fault for each defect, and none for a true drawing',
    cleaned(async () => {
      await system('light');
      const cases: [string, (host: HTMLElement) => void, ReactNode, string[]][] = [
        ['true', () => {}, <PlantImage stage="seed" size={28} />, []],
        [
          'missing',
          (host) => host.querySelector('img')?.remove(),
          <PlantImage stage="seed" size={28} />,
          ['0 images in the plant'],
        ],
        [
          'doubled image',
          (host) => {
            const image = host.querySelector('img');
            image?.parentElement?.append(image.cloneNode());
          },
          <PlantImage stage="seed" size={28} />,
          ['2 images in the plant'],
        ],
        [
          'doubled plant',
          () => {},
          <>
            <PlantImage stage="seed" size={28} />
            <PlantImage stage="seed" size={28} />
          </>,
          ['2 plants', 'a plant image outside its plant'],
        ],
        [
          'wrong stage',
          () => {},
          <PlantImage stage="blade" size={28} />,
          ['the image assets/home/blade-light.png, not assets/home/seed-light.png'],
        ],
        [
          'wrong scheme',
          (host) => {
            const image = host.querySelector('img');
            image?.setAttribute(
              'src',
              (image.getAttribute('src') ?? '').replace('-light', '-dark'),
            );
          },
          <PlantImage stage="seed" size={28} />,
          ['the image assets/home/seed-dark.png, not assets/home/seed-light.png'],
        ],
        [
          'exposed wrapper',
          (host) => host.querySelector('[data-testid="plant"]')?.removeAttribute('aria-hidden'),
          <PlantImage stage="seed" size={28} />,
          ['the plant exposed'],
        ],
        [
          'zero size',
          (host) => {
            const box = host.querySelector('img')?.parentElement;
            if (box) box.style.width = '0px';
          },
          <PlantImage stage="seed" size={28} />,
          ['the image 0px×28px, not 28px'],
        ],
        [
          'scaled',
          (host) => {
            const plant = host.querySelector<HTMLElement>('[data-testid="plant"]');
            if (plant) plant.style.transform = 'scale(4)';
          },
          <PlantImage stage="seed" size={28} />,
          ['a drawing transformed scale(4): plant'],
        ],
      ];
      const seen: Record<string, string[]> = {};
      for (const [name, seed, node] of cases) {
        const { host, done } = await fixture(node);
        seed(host);
        seen[name] = plantFaults(host, SEED);
        await done();
      }
      expect(seen).toEqual(Object.fromEntries(cases.map(([name, , , want]) => [name, want])));
    }),
  );

  it(
    'finds a plant image in a frame owed none with every id stripped, and lets home and the end own theirs',
    cleaned(async () => {
      const { host, done } = await fixture(<PlantImage stage="seed" size={28} />);
      for (const node of host.querySelectorAll('[data-testid]'))
        node.removeAttribute('data-testid');
      const heading = document.createElement('div');
      heading.setAttribute('role', 'heading');
      host.prepend(heading);
      const owns = (text: string) => {
        heading.textContent = text;
        return ownsImages(host);
      };
      expect({
        faults: plantFaults(host, null),
        today: owns('Today'),
        home: owns('Your field'),
        end: owns(END),
      }).toEqual({
        faults: ['the image assets/home/seed-light.png where none is owed'],
        today: false,
        home: true,
        end: true,
      });
      await done();
    }),
  );
});

const AT = Date.UTC(2026, 0, 5, 9);
const HISTORIES: Readonly<Record<'blade' | 'full corn', () => (readonly [string, string])[]>> = {
  blade: () => [AT, AT + 86_400_000].map((t) => stageRig.recordOf(stageRig.recallAt(t))),
  'full corn': () => stageRig.fullCorn(),
};

describe('Today and Planted under a stored appearance over the other system', () => {
  for (const [stored, under, stage] of [
    ['dark', 'light', 'blade'],
    ['light', 'dark', 'full corn'],
  ] as const)
    it(
      `Today draws ${stage} in ${stored}, stored over a ${under} system that flips under it, still with motion on`,
      cleaned(async () => {
        stageRig.DRAWING_FAULTS.clear();
        left.restores.push(await setMotion('no-preference'));
        await system(under);
        device.launch([...HISTORIES[stage](), [APPEARANCE_KEY, stored]]);
        const today = await stageRig.mount([], undefined, { now: stageRig.AT });
        left.leaves.push(today.leave);
        const file = FILES[stage][stored];
        const shown = () => ({
          stage: today.stage(),
          drawn: today.drawn(),
          moving: [today.one('[data-testid="stage"]'), today.plant()].map((node) =>
            entryOf(node, document.body),
          ),
        });
        const want = { stage: `Stage: ${stage}`, drawn: [file], moving: [null, null] };
        expect(shown(), 'launched').toEqual(want);
        await system(stored);
        expect(shown(), 'the system as stored').toEqual(want);
        await system(under);
        expect(shown(), 'the system back').toEqual(want);
        expect([...stageRig.DRAWING_FAULTS]).toEqual([]);
      }),
    );

  for (const [stored, under] of [
    ['dark', 'light'],
    ['light', 'dark'],
  ] as const)
    it(
      `Planted draws the large seed in ${stored}, stored over a ${under} system that flips under it, still with motion on`,
      cleaned(async () => {
        left.restores.push(await setMotion('no-preference'));
        await system(under);
        device.launch([[APPEARANCE_KEY, stored]]);
        const opened = await screenLaunch();
        left.leaves.push(opened.leave);
        expect(await opened.until(() => opened.heading() === 'Hear it')).toBe(true);
        await opened.click('Next');
        expect(await opened.until(() => opened.heading() === 'Say it with help')).toBe(true);
        await opened.click('Say it');
        expect(
          await opened.until(
            () => opened.heading() === 'Say it alone' && opened.buttons().includes('Say it'),
          ),
        ).toBe(true);
        expect(plantFaults(opened.host, null), 'alone').toEqual([]);
        await opened.click('Say it');
        expect(await opened.until(() => opened.heading() === 'Planted')).toBe(true);
        const shown = () => ({
          heading: opened.heading(),
          stage: opened.stage(),
          faults: plantFaults(opened.host, { asset: FILES.seed[stored], size: 112 }),
        });
        const want = { heading: 'Planted', stage: 'Stage: seed', faults: [] };
        expect(shown(), 'planted').toEqual(want);
        await system(stored);
        expect(shown(), 'the system as stored').toEqual(want);
        await system(under);
        expect(shown(), 'the system back').toEqual(want);
      }),
    );
});
