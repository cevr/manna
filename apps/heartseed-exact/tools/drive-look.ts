/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noNullish, effect/noTernary, effect/noAsyncFunction, effect/noAs, effect/noUnknownParameters -- Exact's app folder cannot import effect (docs/exact.md): a host script that drives the built app through `bun run exact agent`, awaits each run, and reads its untyped JSON replies by the fields it checks. */

/**
 * The look's live checks (spec B2-B4), which a `.test.contract` cannot hold
 * at Exact's pin: an authored test reads no node's computed colour and no
 * radio's checked state. Through `@manna/exact-kit/drive` on the host named
 * (`bun tools/drive-look.ts web|ios`): Today drawn in the brand's ground and
 * ink in light and in dark; the sheet's choices read checked; Dark dark at
 * once under a light system, System following the system, Light holding
 * under a dark one; and after a relaunch on the kept storage, the scheme
 * and the three choices as they were. Each end screen, light and dark, is
 * kept under `.exact/shots/`.
 */

import { join } from 'node:path';

import { makeDrive } from '@manna/exact-kit/drive';
import { theme, type Scheme } from '@manna/heartseed/theme';

const host = process.argv[2] ?? 'web';
const drive = makeDrive({ name: 'drive-look', host, appDir: join(import.meta.dir, '..') });
const store = `look-${host}-${Date.now().toString(36)}`;
/** Chrome keeps a named store per port, so both web launches take one of the app's spare ports. */
const port = host === 'web' ? ['--port', '8773'] : [];

/** A drive's steps, each read back by the index `step` answers. */
const script = () => {
  const ops: string[] = [];
  const step = (...each: readonly string[]) => {
    ops.push(...each);
    return ops.length - 1;
  };
  const shot = (name: string) => step(`screenshot .exact/shots/${host}-${name}.png`);
  return { ops, step, shot };
};

/** A hex colour as the driver computes it, `rgb(r, g, b)`. */
const rgbOf = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

interface Styled {
  readonly node?: {
    readonly style?: Record<string, { readonly computed?: string; readonly value?: string }>;
  };
}

/** A `layout` reply's computed style property, as `rgb(…)` text. */
const styleOf = (reply: unknown, property: string) => {
  const style = (reply as Styled | undefined)?.node?.style?.[property];
  return style?.computed ?? style?.value ?? '';
};

interface Accessible {
  readonly ax?: {
    readonly elements?: ReadonlyArray<{
      readonly testId?: string;
      readonly states?: { readonly checked?: boolean };
    }>;
  };
}

/** The test ids a `tree --ax` reply marks checked, in tree order. */
const checkedOf = (reply: unknown) =>
  ((reply as Accessible | undefined)?.ax?.elements ?? [])
    .filter((element) => element.states?.checked === true && element.testId !== undefined)
    .map((element) => element.testId);

/** Checks the `property` colour of a node's `layout` reply is the brand's `role` in `scheme`. */
const paintIs = (
  name: string,
  reply: unknown,
  property: string,
  role: 'ground' | 'ink',
  scheme: Scheme,
) =>
  drive.check(
    name,
    styleOf(reply, property) === rgbOf(theme[scheme][role]),
    styleOf(reply, property),
  );
const groundIs = (name: string, reply: unknown, scheme: Scheme) =>
  paintIs(name, reply, 'background_color', 'ground', scheme);
const inkIs = (name: string, reply: unknown, scheme: Scheme) =>
  paintIs(name, reply, 'text_color', 'ink', scheme);

const CHOSEN = ['minutes-10', 'voice-him', 'appearance-dark'];

const a = script();
a.step('prefer prefers-color-scheme light', 'clock data', 'clock settle');
const todayLight = a.step('layout ground-home');
const inkLight = a.step('layout reference');
a.shot('today-light');
a.step('prefer prefers-color-scheme dark', 'clock settle');
const todayDark = a.step('layout ground-home');
const inkDark = a.step('layout reference');
a.shot('today-dark');
a.step('prefer prefers-color-scheme light', 'clock settle', 'tap gear', 'clock settle');
a.shot('sheet-light');
a.step('tap minutes-10', 'tap voice-him', 'tap appearance-dark', 'clock data', 'clock settle');
const darkAtOnce = a.step('layout settings');
const chosen = a.step('tree --ax');
a.shot('sheet-dark');
a.step('tap appearance-system', 'clock data', 'clock settle');
const systemLight = a.step('layout settings');
a.step('prefer prefers-color-scheme dark', 'clock settle');
const systemDark = a.step('layout settings');
a.step('tap appearance-light', 'clock data', 'clock settle');
const lightHolds = a.step('layout settings');
a.step('prefer prefers-color-scheme light', 'tap appearance-dark', 'clock data');
a.step('tap settings-done', 'clock settle');
const darkClosed = a.step('layout ground-home');
const first = await drive.run([...port, '--storage', store, '--reset-storage'], a.ops);

groundIs('B4 Today is on the light ground under a light system', first[todayLight], 'light');
inkIs("B4 Today's reference is the light ink", first[inkLight], 'light');
groundIs('B4 Today is on the dark ground under a dark system', first[todayDark], 'dark');
inkIs("B4 Today's reference is the dark ink", first[inkDark], 'dark');
groundIs('B3 Dark is dark at once under a light system', first[darkAtOnce], 'dark');
drive.check(
  'B2 each choice reads checked',
  Bun.deepEquals(checkedOf(first[chosen]), CHOSEN),
  checkedOf(first[chosen]),
);
groundIs('B3 System follows a light system', first[systemLight], 'light');
groundIs('B3 System follows a dark system', first[systemDark], 'dark');
groundIs('B3 Light holds under a dark system', first[lightHolds], 'light');
groundIs('B3 Dark holds as the sheet closes', first[darkClosed], 'dark');

const b = script();
b.step('prefer prefers-color-scheme light', 'clock data', 'clock settle');
const relaunched = b.step('layout ground-home');
b.step('tap gear', 'clock settle');
const kept = b.step('tree --ax');
const again = await drive.run([...port, '--storage', store, '--keep-storage'], b.ops);
groundIs('B3 Dark holds after a relaunch under a light system', again[relaunched], 'dark');
drive.check(
  'B2 each choice is kept after a relaunch',
  Bun.deepEquals(checkedOf(again[kept]), CHOSEN),
  checkedOf(again[kept]),
);

process.exit(drive.finish());
