/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent`, awaits each run, and reads its untyped JSON replies by the fields it checks. */

/**
 * The look's live checks (spec B2-B4), which a `.test.contract` cannot hold
 * at Exact's pin: an authored test reads no node's colour and no radio's
 * checked state. Through `@manna/exact-kit/drive` on the host named
 * (`bun tools/drive-look.ts web|ios`): home drawn on the brand's ground in
 * its ink, in light and in dark; the sheet's choices read checked; Dark
 * dark at once under a light system, System following the system, Light
 * holding under a dark one; and after a relaunch on the kept storage, the
 * scheme and the three choices as they were. A ground is read where the
 * host painted it, a pixel of a screenshot inside the node (iOS's `layout`
 * reports the authored `light-dark(…)`, not the colour drawn); the ink is
 * the computed colour where the host reports one, else the token the node
 * resolves. Each end screen, light and dark, is kept under `.exact/shots/`.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';

import { fromHome } from './from-home';
import { theme, type Scheme } from '@manna/heartseed/theme';

import { pixelAt, readPng } from './png';

const host = process.argv[2] ?? 'web';
const app = join(import.meta.dir, '..');
const drive = fromHome(makeDrive({ name: 'drive-look', host, appDir: app }));
const store = `look-${host}-${Date.now().toString(36)}`;
const SAMPLES = join('.exact', 'drive-look');
mkdirSync(join(app, SAMPLES), { recursive: true });

/** A ground read: the node's `layout`, then a screenshot to sample it in. */
interface Ground {
  readonly layout: number;
  readonly shot: string;
}

/** A drive's steps, each read back by the index `step` answers. */
const script = (name: string) => {
  const ops: string[] = [];
  let grounds = 0;
  const step = (...each: readonly string[]) => {
    ops.push(...each);
    return ops.length - 1;
  };
  const shot = (shown: string) => step(`screenshot .exact/shots/${host}-${shown}.png`);
  const ground = (id: string): Ground => {
    const layout = step(`layout ${id}`);
    const path = join(SAMPLES, `${host}-${name}-${grounds++}.png`);
    step(`screenshot ${path}`);
    return { layout, shot: path };
  };
  return { ops, step, shot, ground };
};

/** A hex colour as the driver computes it, `rgb(r, g, b)`. */
const rgbOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

interface Laid {
  readonly viewport?: { readonly w?: number };
  readonly node?: {
    readonly space?: {
      readonly viewport?: {
        readonly x: number;
        readonly y: number;
        readonly w: number;
        readonly h: number;
      };
    };
    readonly style?: Record<
      string,
      {
        readonly computed?: string;
        readonly value?: string;
        readonly token?: { readonly names?: readonly string[] };
      }
    >;
  };
}

/** The colour painted inside a node, at a fifth of its height from its foot and 6 points in from its left edge, where no text lies on these screens. */
const groundOf = (replies: readonly unknown[], ground: Ground) => {
  const laid = replies[ground.layout] as Laid | undefined;
  const frame = laid?.node?.space?.viewport;
  if (frame === undefined) return 'no layout';
  const image = readPng(join(app, ground.shot));
  const scale = image.width / (laid?.viewport?.w ?? image.width);
  return pixelAt(image, (frame.x + 6) * scale, (frame.y + frame.h * 0.8) * scale);
};

/** A node's text colour: the computed one (an inherited one is its value, `rgb(…)`), else the token it resolves (`hs.ink`). */
const inkOf = (reply: unknown) => {
  const color = (reply as Laid | undefined)?.node?.style?.['text_color'];
  if (color?.computed !== undefined) return color.computed;
  if (color?.value?.startsWith('rgb(') === true) return color.value;
  return color?.token?.names?.join(' ') ?? '';
};

interface Accessible {
  readonly ax?: {
    readonly elements?: ReadonlyArray<{
      readonly testId?: string;
      readonly states?: { readonly checked?: boolean; readonly selected?: boolean };
    }>;
  };
}

/** The test ids a `tree --ax` reply marks checked (the web's radios) or selected (iOS's segments), in tree order. */
const checkedOf = (reply: unknown) =>
  ((reply as Accessible | undefined)?.ax?.elements ?? [])
    .filter(
      (element) =>
        (element.states?.checked === true || element.states?.selected === true) &&
        element.testId !== undefined,
    )
    .map((element) => element.testId);

const groundIs = (name: string, replies: readonly unknown[], ground: Ground, scheme: Scheme) => {
  const got = groundOf(replies, ground);
  drive.check(name, got === rgbOf(theme[scheme].ground), got);
};
const inkIs = (name: string, reply: unknown, scheme: Scheme) => {
  const got = inkOf(reply);
  drive.check(name, got === rgbOf(theme[scheme].ink) || got === 'hs.ink', got);
};

/** The choices made, and Sounds and haptics' switch, on by default and kept on. */
const CHOSEN = ['minutes-10', 'voice-him', 'appearance-dark', 'settings-feel'];

const a = script('first');
a.step('prefer prefers-color-scheme light', 'clock data', 'clock settle');
const todayLight = a.ground('ground-home');
const inkLight = a.step('layout greeting');
a.shot('today-light');
a.step('prefer prefers-color-scheme dark', 'clock settle');
const todayDark = a.ground('ground-home');
const inkDark = a.step('layout greeting');
a.shot('today-dark');
a.step('prefer prefers-color-scheme light', 'clock settle', 'tap gear', 'clock settle');
a.shot('sheet-light');
a.step('tap minutes-10', 'tap voice-him', 'tap appearance-dark', 'clock data', 'clock settle');
const darkAtOnce = a.ground('settings');
const chosen = a.step('tree --ax');
a.shot('sheet-dark');
a.step('tap appearance-system', 'clock data', 'clock settle');
const systemLight = a.ground('settings');
a.step('prefer prefers-color-scheme dark', 'clock settle');
const systemDark = a.ground('settings');
a.step('tap appearance-light', 'clock data', 'clock settle');
const lightHolds = a.ground('settings');
a.step('prefer prefers-color-scheme light', 'tap appearance-dark', 'clock data');
a.step('tap settings-done', 'clock settle');
const darkClosed = a.ground('ground-home');
const first = await drive.run(['--storage', store, '--reset-storage'], a.ops);

groundIs('B4 Home is on the light ground under a light system', first, todayLight, 'light');
inkIs("B4 Home's greeting is the light ink", first[inkLight], 'light');
groundIs('B4 Home is on the dark ground under a dark system', first, todayDark, 'dark');
inkIs("B4 Home's greeting is the dark ink", first[inkDark], 'dark');
groundIs('B3 Dark is dark at once under a light system', first, darkAtOnce, 'dark');
drive.check(
  'B2 each choice reads checked',
  Bun.deepEquals(checkedOf(first[chosen]), CHOSEN),
  checkedOf(first[chosen]),
);
groundIs('B3 System follows a light system', first, systemLight, 'light');
groundIs('B3 System follows a dark system', first, systemDark, 'dark');
groundIs('B3 Light holds under a dark system', first, lightHolds, 'light');
groundIs('B3 Dark holds as the sheet closes', first, darkClosed, 'dark');

const b = script('again');
b.step('prefer prefers-color-scheme light', 'clock data', 'clock settle');
const relaunched = b.ground('ground-home');
b.step('tap gear', 'clock settle');
const kept = b.step('tree --ax');
const again = await drive.run(['--storage', store, '--keep-storage'], b.ops);
groundIs('B3 Dark holds after a relaunch under a light system', again, relaunched, 'dark');
drive.check(
  'B2 each choice is kept after a relaunch',
  Bun.deepEquals(checkedOf(again[kept]), CHOSEN),
  checkedOf(again[kept]),
);

process.exit(drive.finish());
