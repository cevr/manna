/**
 * The two stacks, model-based: generated readers tap the tabs, push Garden
 * screens, go Back, open and close Settings, open Read at a place, follow
 * a reference and type locations, through `navStep`, beside a small model
 * of what the reader sees (each tab's screens by name, a followed
 * reference by its chapter and verse). The invariants: nothing done in one
 * tab touches the other's stack; `readOpenAt` leaves Read at its root on
 * that place; Back from a followed reference shows the place left;
 * Settings opens over the tab shown and closes to it; tapping the tab
 * shown pops it to its root.
 */

import { expect, it } from 'bun:test';
import { Array as Arr, Option } from 'effect';

import { seeded, type Random } from '../test/random';
import { navLaunch, navStep, type Nav, type NavInput, type NavState, type NavTab } from './nav';

/** What the reader sees: the tab shown, and each tab's screens, root first. */
interface Seen {
  readonly tab: NavTab;
  readonly garden: readonly string[];
  readonly read: readonly string[];
}

/** The model's state: what the reader sees and the place kept (`book.chapter`, `.` for none). */
interface Modelled {
  readonly seen: Seen;
  readonly kept: string;
}

const GARDEN_PUSHES = ['/today', '/verses', '/add', '/lists/john-3', '/start/John-3-16'] as const;
const TYPED = ['/', '/add', '/verses', '/read', '/read/at/19/23/1', '/today', '/settings'] as const;

/** A screen by its location: a tab's root by the tab, a followed reference by its chapter and verse. */
const nameOfUrl = (url: string) => {
  if (url === '/') return 'garden';
  if (url === '/read') return 'read';
  return Option.match(Option.fromNullishOr(/^\/read\/at\/(\d+)\/(\d+)\/(\d+)$/u.exec(url)), {
    onNone: () => url,
    onSome: (at) => `at ${at[1]}.${at[2]}.${at[3]}`,
  });
};

const otherOf = (tab: NavTab): NavTab => {
  if (tab === 'garden') return 'read';
  return 'garden';
};

/** The tab a typed location lands on in the model: Read's own, Settings' over the tab shown, any other Garden's. */
const typedTab = (url: string, shown: NavTab): NavTab => {
  if (url.startsWith('/read')) return 'read';
  if (url.startsWith('/settings')) return shown;
  return 'garden';
};

/** A typed location in the model: back to it where its tab holds it, to the other tab whose top it is, else onto its tab. */
const modelFollow = (seen: Seen, url: string): Seen => {
  const stacks = { garden: [...seen.garden], read: [...seen.read] };
  const name = nameOfUrl(url);
  const tab = typedTab(url, seen.tab);
  const at = stacks[tab].lastIndexOf(name);
  if (at >= 0) {
    stacks[tab].splice(at + 1);
    return { tab, ...stacks };
  }
  if (stacks[otherOf(tab)].at(-1) === name) return { tab: otherOf(tab), ...stacks };
  stacks[tab].push(name);
  return { tab, ...stacks };
};

/** The model: the reader's own account of each step, with no router in it. */
const modelStep = (model: Modelled, input: NavInput): Modelled => {
  const { seen, kept } = model;
  const stacks = { garden: [...seen.garden], read: [...seen.read] };
  const shown = stacks[seen.tab];
  const onTop = (name: string) => {
    if (shown.at(-1) !== name) shown.push(name);
    return { seen: { ...seen, ...stacks }, kept };
  };
  switch (input._tag) {
    case 'pick':
      if (input.tab === seen.tab) stacks[input.tab].splice(1);
      return { seen: { tab: input.tab, ...stacks }, kept };
    case 'push':
      return onTop(input.url);
    case 'back':
    case 'settingsDone':
      if (shown.length > 1) shown.pop();
      return { seen: { ...seen, ...stacks }, kept };
    case 'settingsOpen':
      return onTop('/settings');
    case 'readOpenAt':
      return {
        seen: { tab: 'read', garden: stacks.garden, read: ['read'] },
        kept: `${input.book}.${input.chapter}`,
      };
    case 'readFollow': {
      const name = `at ${input.book}.${input.chapter}.${input.verse}`;
      if (stacks.read.at(-1) !== name) stacks.read.push(name);
      return { seen: { tab: 'read', ...stacks }, kept };
    }
    case 'follow':
      return { seen: modelFollow(seen, input.url), kept };
  }
};

/** The router's stacks as the reader sees them. */
const seenOf = (nav: Nav): Seen => ({
  tab: nav.tab,
  garden: nav.garden.map((visit) => nameOfUrl(visit.url)),
  read: nav.read.map((visit) => nameOfUrl(visit.url)),
});

const ids = (nav: Nav, tab: NavTab) => nav[tab].map((visit) => visit.id).join(',');

const topName = (nav: Nav) =>
  Option.match(Arr.last(nav[nav.tab]), { onNone: () => '', onSome: (visit) => visit.name });

/** The next input a reader can make: the bar is hidden while Settings is up, and a Garden screen pushes only while Garden shows. */
const inputOf = (random: Random, state: NavState): NavInput => {
  if (topName(state.nav).startsWith('settings'))
    return random.pick<NavInput>([{ _tag: 'settingsDone' }, { _tag: 'back' }]);
  const place = () => ({
    book: 1 + random.below(66),
    chapter: 1 + random.below(3),
    verse: random.below(30),
  });
  const roll = random.below(9);
  if (roll === 0) return { _tag: 'pick', tab: 'garden' };
  if (roll === 1) return { _tag: 'pick', tab: 'read' };
  if (roll === 2 && state.nav.tab === 'garden')
    return { _tag: 'push', url: random.pick(GARDEN_PUSHES) };
  if (roll === 3) return { _tag: 'back' };
  if (roll === 4) return { _tag: 'settingsOpen' };
  if (roll === 5) return { _tag: 'readOpenAt', ...place() };
  if (roll === 6) return { _tag: 'readFollow', ...place() };
  return { _tag: 'follow', url: random.pick(TYPED) };
};

/** Whether an input is aimed at `tab`'s stack from the other tab. */
const reaches = (input: NavInput, tab: NavTab) => {
  if (input._tag === 'pick') return input.tab === tab;
  if (['readOpenAt', 'readFollow'].includes(input._tag)) return tab === 'read';
  if (input._tag !== 'follow') return false;
  return typedTab(input.url, otherOf(tab)) === tab;
};

/** What a walk watches across steps: a followed reference not yet left by Back, the tabs when Settings opened, and how often each invariant was met. */
interface Watch {
  followed: Option.Option<{ readonly before: string; readonly ids: string }>;
  opened: Option.Option<{ readonly tab: NavTab; readonly garden: string; readonly read: string }>;
  readonly met: Record<'openAt' | 'followBack' | 'settings' | 'reselect', number>;
}

/** One step of a walk: its seed, step and input, the state before and after. */
interface Step {
  readonly at: { readonly seed: number; readonly step: number; readonly input: NavInput };
  readonly before: NavState;
  readonly after: NavState;
}

const checkOtherTab = ({ at, before, after }: Step) => {
  for (const tab of ['garden', 'read'] as const)
    if (before.nav.tab !== tab && !reaches(at.input, tab))
      expect({ ...at, tab, ids: ids(after.nav, tab) }).toEqual({
        ...at,
        tab,
        ids: ids(before.nav, tab),
      });
};

const checkOpenAt = ({ at, after }: Step, watch: Watch) => {
  const { input } = at;
  if (input._tag !== 'readOpenAt') return;
  watch.met.openAt++;
  expect({
    ...at,
    tab: after.nav.tab,
    read: after.nav.read.map((visit) => [visit.url, visit.fragment]),
    open: after.openVerse,
  }).toEqual({ ...at, tab: 'read', read: [['/read', `verse-${input.verse}`]], open: input.verse });
};

const checkFollowBack = ({ at, before, after }: Step, watch: Watch) => {
  if (at.input._tag === 'readFollow' && after.nav.read.length > before.nav.read.length) {
    const left = Option.getOrElse(Arr.last(seenOf(before.nav).read), () => '');
    watch.followed = Option.some({ before: left, ids: ids(after.nav, 'read') });
    return;
  }
  const back = Option.filter(
    watch.followed,
    (followed) =>
      at.input._tag === 'back' &&
      before.nav.tab === 'read' &&
      ids(before.nav, 'read') === followed.ids,
  );
  if (Option.isSome(back)) {
    watch.met.followBack++;
    expect({ ...at, top: Arr.last(seenOf(after.nav).read) }).toEqual({
      ...at,
      top: Option.some(back.value.before),
    });
  }
  if (Option.exists(watch.followed, (followed) => ids(after.nav, 'read') !== followed.ids))
    watch.followed = Option.none();
};

const checkSettings = ({ at, before, after }: Step, watch: Watch) => {
  const sheet = (nav: Nav) => topName(nav) === 'settings';
  const tabs = (nav: Nav) => ({ tab: nav.tab, garden: ids(nav, 'garden'), read: ids(nav, 'read') });
  if (sheet(after.nav) && !sheet(before.nav)) watch.opened = Option.some(tabs(before.nav));
  if (at.input._tag !== 'settingsDone') return;
  if (Option.isNone(watch.opened)) return;
  watch.met.settings++;
  expect({ ...at, ...tabs(after.nav) }).toEqual({ ...at, ...watch.opened.value });
  watch.opened = Option.none();
};

const checkReselect = ({ at, before, after }: Step, watch: Watch) => {
  const { input } = at;
  if (input._tag !== 'pick' || input.tab !== before.nav.tab) return;
  watch.met.reselect++;
  expect({ ...at, depth: after.nav[input.tab].length }).toEqual({ ...at, depth: 1 });
};

it('moves each tab as the reader expects, and leaves the other tab alone', () => {
  const watch: Watch = {
    followed: Option.none(),
    opened: Option.none(),
    met: { openAt: 0, followBack: 0, settings: 0, reselect: 0 },
  };
  for (let seed = 1; seed <= 200; seed++) {
    const random = seeded(seed);
    let state = navLaunch();
    let model: Modelled = { seen: seenOf(state.nav), kept: '.' };
    watch.followed = Option.none();
    watch.opened = Option.none();
    for (let step = 0; step < 40; step++) {
      const input = inputOf(random, state);
      const before = state;
      state = navStep(state, input);
      model = modelStep(model, input);
      const each: Step = { at: { seed, step, input }, before, after: state };
      expect({ ...each.at, seen: seenOf(state.nav) }).toEqual({ ...each.at, seen: model.seen });
      expect({ ...each.at, kept: `${state.bookKept}.${state.chapterKept}` }).toEqual({
        ...each.at,
        kept: model.kept,
      });
      checkOtherTab(each);
      checkOpenAt(each, watch);
      checkFollowBack(each, watch);
      checkSettings(each, watch);
      checkReselect(each, watch);
    }
  }
  expect(Object.values(watch.met).every((count) => count >= 20)).toBe(true);
});

it('opens on Garden at home with Read at its root, and the ids in each stack rise', () => {
  const launched = navLaunch();
  expect(seenOf(launched.nav)).toEqual({ tab: 'garden', garden: ['garden'], read: ['read'] });
  for (let seed = 1; seed <= 50; seed++) {
    const random = seeded(seed);
    let state = launched;
    for (let step = 0; step < 40; step++) {
      state = navStep(state, inputOf(random, state));
      for (const tab of ['garden', 'read'] as const) {
        const list = state.nav[tab].map((visit) => visit.id);
        const rising = list.every(
          (id, at) => at === 0 || Option.exists(Arr.get(list, at - 1), (below) => id > below),
        );
        expect({ seed, step, tab, rising }).toEqual({ seed, step, tab, rising: true });
      }
    }
  }
});
