/* oxlint-disable effect/noNullish, effect/noAsyncFunction, eslint/no-await-in-loop, effect/noTernary, effect/noGlobals -- a generated walk through a list's own page: it drives the root one awaited tap at a time through React's promise-based `act`, reads happy-dom nodes whose absent attributes are null, and keeps the session's view a spy beside the root last read in a plain holder. */

/**
 * A generated reader's walk through the lists' own pages (hslist L2-L6), for
 * the parts `src/list/walk-*.test.tsx`, over `root-rig.tsx` with a spy
 * beside the root that reads the session's view and the garden read, and
 * catches Today's press. Every frame is held to the root's rule (the list
 * rule among it), the look's, the bar's (`barFaults`: the pending rule, the
 * scroll rule, contrast) and the page's own pending rule: on a list's own
 * page, while any control shows as disabled, every one does.
 *
 * The device holds the promise planted two days back, Psalms 46:1-3 held
 * with its first verse planted, the Handbook list Smyrna held with
 * Revelation 2:10 planted, the Fear collection taught, and Genesis 1:1
 * planted on its own. Its launch lands on home. Commands, by the screen the
 * model holds: on home, a list's `Open <title>`, or a return to the
 * foreground; on a list's page, `Your field`, `Practice this list`, a row's
 * tap, a return to the foreground, Say it starting to listen (Today's press
 * from beside the root), or `Remove <name>` and then `Keep`, or the ask's
 * `Remove` landing or refused, once, twice in one turn, or with `Your
 * field` in the same turn; on Today, `Your field` once it is offered.
 *
 * After every command the screen is the model's (home, the page of the
 * title it opened, or Today); after `Practice this list` the session's
 * visit is exactly what `listStartOf` gave over the view and the garden at
 * the tap, and after a row's tap exactly what `startOf` gave; home never
 * shows a removed list's `Open <title>` again, and keeps every other row it
 * had; nothing taps a control that does not show.
 */

import { useAtomSet, useAtomValue } from '@effect/atom-react';
import { Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import { act } from 'react';
import passage from 'virtual:heartseed-passage';

import { gardenView, press, sessionView } from '../app';
import type { GardenView, ReadGarden } from '../garden';
import { startOf } from '../home/start';
import { listStartOf } from '../list';
import type { SessionView, VisitVerse } from '../session/service';
import { barFaults } from './bar-rig';
import { labelOf, text } from './chooser-rig';
import { START } from './clock';
import { below, DAY, random } from './garden-model';
import { LISTS } from './handbook-model';
import { KEY, storedText } from './passages-model';
import { launchRoot, recordOf, rootDevice, type RootLaunch } from './root-rig';

/** What the spy beside the root last read, and Today's press as the root's registry runs it. */
interface Spied {
  view: Option.Option<SessionView>;
  garden: Option.Option<ReadGarden>;
  press: (shown: { readonly piece: typeof passage; readonly item: Option.Option<never> }) => void;
}

const isRead = (view: GardenView): view is ReadGarden => view._tag === 'Read';

/** The spy: it keeps the session's view and the garden read in `spied`, and catches Today's press. */
function Spy({ spied }: { readonly spied: Spied }) {
  spied.view = AsyncResult.value(useAtomValue(sessionView));
  spied.garden = Option.filter(AsyncResult.value(useAtomValue(gardenView)), isRead);
  spied.press = useAtomSet(press);
  return null;
}

/** A visit as the walk compares it: each item's reference, whether it is fresh, and its piece's reference. */
const visitOf = (visit: readonly VisitVerse[]) =>
  visit.map(
    ({ item, piece }) => `${item.reference}${item.fresh ? ' (new)' : ''} @ ${piece.reference}`,
  );

const CONTROL = '[role="button"],[role="radio"],[role="checkbox"],[role="switch"]';

/** The page's own pending rule: on a list's own page, while any control shows as disabled, every one does. */
const pendingOnPage = (host: Element): string[] => {
  const page = host.querySelector('[data-testid="list-screen"]');
  if (page === null) return [];
  const controls = [...page.querySelectorAll(CONTROL)];
  const disabled = controls.filter((node) => node.getAttribute('aria-disabled') === 'true');
  if (disabled.length === 0 || disabled.length === controls.length) return [];
  return controls
    .filter((node) => node.getAttribute('aria-disabled') !== 'true')
    .map((node) => `${labelOf(node)} live while ${labelOf(disabled[0] as Element)} is disabled`);
};

/** The furrows the device shows at launch, by title. */
const TITLES = [passage.reference, 'Psalms 46:1-3', 'Protection & Fear', 'Smyrna', 'Genesis 1:1'];

/** The lists the reader holds, by title. */
const HELD = new Set(['Psalms 46:1-3', 'Smyrna']);

type Screen =
  | { readonly at: 'home' }
  | { readonly at: 'list'; readonly title: string; readonly asking: boolean }
  | { readonly at: 'Today' };

/** One generated reader's walk from `seed`, `steps` commands long; answers its faults and the cases it reached. */
export const walkList = async (seed: number, steps: number) => {
  const next = random(seed);
  const device = rootDevice([
    recordOf(passage.reference, START - 2 * DAY),
    recordOf('Psalms 46:1', START - DAY),
    recordOf('Revelation 2:10', START - DAY),
    recordOf('Genesis 1:1', START - DAY),
    [KEY, storedText([{ book: 19, chapter: 46, first: 1, last: 3 }])],
    [LISTS, JSON.stringify(['bhb-1816'])],
  ]);
  const spied: Spied = { view: Option.none(), garden: Option.none(), press: () => undefined };
  const known = new Map<string, boolean>();
  const rig: RootLaunch = await launchRoot(
    device,
    { now: START },
    undefined,
    1,
    (host) => [...barFaults(host, false, known), ...pendingOnPage(host)],
    <Spy spied={spied} />,
  );
  const faults: string[] = [];
  const reached = new Set<string>();
  const log: string[] = [];
  const removed = new Set<string>();
  let screen = { at: 'home' } as Screen;
  const fault = (what: string) => faults.push(`${what} after ${log.slice(-6).join(' > ')}`);
  const headings = () => rig.headings().join('|');
  const page = () => rig.host.querySelector('[data-testid="list-screen"]') !== null;
  const opens = () =>
    rig
      .names()
      .filter((name) => name.startsWith('Open '))
      .map((name) => name.slice('Open '.length));
  /** Waits for the screen the model holds; a fault names what showed instead. */
  const settle = async (step: string) => {
    log.push(step);
    const holds = () => {
      if (screen.at === 'Today') return headings() === 'Today';
      if (screen.at === 'home') return headings() === 'Your field' && opens().length > 0;
      const { title, asking } = screen;
      return (
        page() &&
        headings() === title &&
        (rig.host.querySelector('[data-testid="ask"]') !== null) === asking
      );
    };
    if (!(await rig.until(holds)))
      return fault(
        `${step}: ${headings() || 'pending'} where the model has ${JSON.stringify(screen)}`,
      );
    if (screen.at !== 'home') return;
    const shown = new Set(opens());
    for (const title of removed) if (shown.has(title)) fault(`${step}: home still opens ${title}`);
    for (const title of TITLES)
      if (!removed.has(title) && !shown.has(title)) fault(`${step}: home lost ${title}`);
  };
  /** Taps the controls named `labels` in one turn; false when one does not show. */
  const tapAll = async (...labels: string[]) => {
    const nodes = labels.map((label) =>
      [...rig.host.querySelectorAll(CONTROL)].find((node) => labelOf(node) === label),
    );
    if (nodes.some((node) => node === undefined)) {
      fault(`no ${labels.join(' and ')} to tap`);
      return false;
    }
    await act(async () => {
      for (const node of nodes)
        node?.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
        );
    });
    return true;
  };
  /** The verses the page shows, in its order. */
  const verses = () => [...rig.host.querySelectorAll('[data-testid="list-reference"]')].map(text);
  /** Compares the session's visit, once Today shows, with `want`. */
  const visitIs = async (step: string, want: readonly VisitVerse[]) => {
    await settle(step);
    const got = Option.match(spied.view, {
      onNone: () => [],
      onSome: (view) => visitOf(view.visit),
    });
    if (JSON.stringify(got) !== JSON.stringify(visitOf(want)))
      fault(
        `${step}: the visit ${JSON.stringify(got)} where it was given ${JSON.stringify(visitOf(want))}`,
      );
  };
  const open = async () => {
    const shown = opens();
    const title = shown[below(next, shown.length)] ?? '';
    if (!(await tapAll(`Open ${title}`))) return;
    reached.add(HELD.has(title) ? 'open:held' : 'open:other');
    screen = { at: 'list', title, asking: false };
    await settle(`Open ${title}`);
  };
  const practice = async () => {
    const start = Option.match(Option.all({ view: spied.view, garden: spied.garden }), {
      onNone: () => undefined,
      onSome: ({ view, garden }) => listStartOf(view, garden, verses()),
    });
    const offered = rig.has('Practice this list');
    if (start === undefined || (start._tag === 'None') === offered)
      return fault(`Practice this list ${offered ? 'offered' : 'missing'} over ${start?._tag}`);
    if (start._tag === 'None') return row();
    reached.add(`practice:${start._tag}`);
    if (!(await tapAll('Practice this list'))) return;
    screen = { at: 'Today' };
    await visitIs('Practice this list', start.visit);
  };
  const row = async () => {
    const rows = [...rig.host.querySelectorAll('[data-testid="list-row"][role="button"]')];
    const node = rows[below(next, rows.length)];
    if (node === undefined) return back();
    const verse = text(node.querySelector('[data-testid="list-reference"]'));
    const first = verses()[0];
    const start = Option.flatMap(
      Option.all({ view: spied.view, garden: spied.garden }),
      ({ view, garden }) => startOf(view, garden, verse),
    );
    if (Option.isNone(start)) return fault(`a row button on ${verse}, which starts nothing`);
    reached.add(verse === first ? 'row:first' : 'row:not first');
    if (!(await tapAll(labelOf(node)))) return;
    screen = { at: 'Today' };
    await visitIs(`row ${verse}`, [start.value]);
  };
  const back = async () => {
    if (!(await tapAll('Your field'))) return;
    reached.add(`back:${screen.at}`);
    screen = { at: 'home' };
    await settle('Your field');
  };
  const listen = async () => {
    reached.add('listen:from a list');
    await act(async () => spied.press({ piece: passage, item: Option.none() }));
    screen = { at: 'Today' };
    await settle('Say it listens');
  };
  const wake = async () => {
    if (!(await rig.wake())) return fault('the foreground never took the return');
    reached.add(`wake:${screen.at}`);
    await settle('a return to the foreground');
  };
  const remove = async (title: string) => {
    const name = `Remove ${title}`;
    if (!(await tapAll(name))) return;
    screen = { at: 'list', title, asking: true };
    await settle(name);
    const roll = below(next, 6);
    if (roll === 0) {
      reached.add('remove:Keep');
      if (!(await tapAll('Keep'))) return;
      screen = { at: 'list', title, asking: false };
      return settle('Keep');
    }
    const refused = roll === 1;
    const way = (['once', 'twice', 'with Your field'] as const)[below(next, 3)] ?? 'once';
    device.refuse = refused ? 1 : 0;
    if (way === 'once' && !(await tapAll('Remove'))) return;
    if (way === 'twice' && !(await tapAll('Remove', 'Remove'))) return;
    if (way === 'with Your field' && !(await tapAll('Remove', 'Your field'))) return;
    device.refuse = 0;
    reached.add(`remove:${refused ? 'Failed' : 'Removed'}:${way}`);
    if (refused) {
      screen = { at: 'list', title, asking: false };
      await settle(`Remove refused ${way}`);
      if (!rig.host.querySelector('[role="alert"]')) fault('no alert after a refused remove');
      return;
    }
    removed.add(title);
    screen = { at: 'home' };
    await settle(`Remove ${way}`);
  };
  const onList = async (title: string) => {
    const roll = below(next, 12);
    if (roll < 2) return back();
    if (roll < 4) return practice();
    if (roll < 6) return row();
    if (roll < 7) return wake();
    if (roll < 8) return listen();
    if (HELD.has(title) && rig.has(`Remove ${title}`)) return remove(title);
    return practice();
  };
  await settle('launch');
  for (let step = 0; step < steps && faults.length === 0; step++) {
    const now = screen;
    if (now.at === 'home') await (below(next, 6) === 0 ? wake() : open());
    else if (now.at === 'list') await onList(now.title);
    else {
      if (!(await rig.until(() => rig.has('Your field')))) fault('no Your field on Today');
      reached.add('today:back');
      await back();
    }
    faults.push(...rig.faults.splice(0).map((each) => `${log.at(-1)}: ${each}`));
  }
  await rig.leave();
  return { faults, reached };
};

/** Walks `seeds`, `steps` commands each; answers the faults of the first walk with any (by seed), and how many walks reached each case. */
export const walkLists = async (seeds: readonly number[], steps: number) => {
  const reached = new Map<string, number>();
  for (const seed of seeds) {
    const result = await walkList(seed, steps);
    if (result.faults.length > 0)
      return { faults: [`seed ${seed}`, ...result.faults.slice(0, 4)], reached };
    for (const each of result.reached) reached.set(each, (reached.get(each) ?? 0) + 1);
  }
  return { faults: [], reached };
};
