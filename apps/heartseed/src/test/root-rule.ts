/* oxlint-disable effect/noNullish, effect/noThrowStatement, effect/noNewError, effect/noAsyncFunction -- the frame rule reads happy-dom nodes whose absent attributes are null; a rig's launch is promise-based, and a rig that added no host cannot be watched, which stops its case. */

import { motionFaults } from './motion-rule';

/** Text as a reader sees it: whitespace collapsed. */
const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A control's name: its label, else its text. */
const nameOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

/** Whether `node` lies inside a scroll view: an ancestor that scrolls its overflow. */
const scrolled = (node: Element) => {
  for (let at = node.parentElement; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (/auto|scroll/.test(`${style.overflowY} ${style.overflow}`)) return true;
  }
  return false;
};

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="link"]';

/** The first minute's headings, whose screen holds a recital, a summary and a stage of its own. */
const FIRST = new Set(['Hear it', 'Say it with help', 'Say it alone', 'Planted']);

/** The screens on which `Your field` is a way back besides Today and the end of a run. */
const BACKS = new Set(['About']);

/** The chooser's first back, to the Add verses sheet, by its text. */
const ADD_BACK = '‹ Add verses';

/** The chooser's first step, the one screen whose way back is `‹ Add verses`. */
const ADDING = 'Add a passage';

/** What the `‹ Add verses` back shows wrong on the screen `on`: not exactly one on `Add a passage`, any on another screen, or one inside a scroll view. */
const addBackFaults = (on: string, backs: readonly Element[]) => {
  const out: string[] = [];
  if (on === ADDING && backs.length === 0) out.push(`no Add verses back on ${ADDING}`);
  if (on === ADDING && backs.length > 1) out.push(`${backs.length} Add verses backs on ${ADDING}`);
  if (on !== ADDING && backs.length > 0) out.push(`the Add verses back on ${on}`);
  if (backs.some(scrolled)) out.push('the Add verses back inside a scroll view');
  return out;
};

/** The Today card's lines as a reader reads them, `<headline> | <parts>`, the empty text when no line shows. */
export const cardLine = (host: Element) =>
  [
    text(host.querySelector('[data-testid="today-headline"]')),
    text(host.querySelector('[data-testid="today-parts"]')),
  ]
    .filter((line) => line !== '')
    .join(' | ');

/** The Today card's lines on home as the walks compare them: `[cardLine]` once a plan gives it a headline, else none. */
export const homeLines = (host: Element) =>
  [...host.querySelectorAll('[data-testid="today-headline"]')]
    .slice(0, 1)
    .map(() => cardLine(host));

/** Home's own nodes, by test id. */
export const HOME_NODES = [
  'greeting',
  'sown',
  'harvest',
  'row',
  'field-plant',
  'today-card',
  'chosen',
];

/** Today's own nodes, by test id, beside its action button. */
const TODAY_NODES = ['session', 'summary', 'stage'];

/** Today's action button's names. */
const ACTIONS = new Set(['Say it', 'Next', 'Listening']);

const ids = (host: Element, list: readonly string[]) =>
  list.filter((id) => host.querySelector(`[data-testid="${id}"]`) !== null);

/** What the pending frame shows wrong: a control, or any node of its own but the reference. */
const pendingFaults = (host: Element, controls: readonly Element[]) => {
  const out: string[] = [];
  if (controls.length > 0) out.push(`the pending frame with ${controls.map(nameOf).join('|')}`);
  const references = host.querySelectorAll('[data-testid="reference"]');
  const others = [...host.querySelectorAll('[data-testid]')].filter(
    (node) => node.getAttribute('data-testid') !== 'reference',
  );
  if (references.length !== 1) out.push(`the pending frame with ${references.length} references`);
  if (others.length > 0)
    out.push(
      `the pending frame with ${[...new Set(others.map((node) => node.getAttribute('data-testid')))].join('|')}`,
    );
  if (text(host) !== text(references[0]))
    out.push('the pending frame with more than its reference');
  return out;
};

/** The end of a run's heading, which the rigs that find Today by its heading tally apart. */
export const END = 'The field is tended';

/** The end's own nodes, by test id. */
const END_NODES = ['tended', 'grew', 'grown'];

/** One selector for the end's nodes, so a frame that is not the end asks once. */
const END_SELECTOR = END_NODES.map((id) => `[data-testid="${id}"]`).join(',');

/** Today as the end of a run reads it, for a scripted rig to compare with the run's want: the headings, the counts lines, the grew lines and the grown verses by name, in order. */
export const endShown = (host: Element) => ({
  headings: [...host.querySelectorAll('[role="heading"]')].map(text),
  counts: [...host.querySelectorAll('[data-testid="session"]')].map(text),
  grew: [...host.querySelectorAll('[data-testid="grew"]')].map(text),
  grown: [...host.querySelectorAll('[data-testid="grown"]')].map(
    (node) => node.getAttribute('aria-label') ?? '',
  ),
});

/** A grown verse's name: its reference, then its stage. */
const GROWN_NAME = /^.+, (seed|blade|ear|full corn)$/;

/** The text a screen reader reads under `node`: its text nodes outside any `aria-hidden` subtree, whitespace collapsed. */
const exposed = (node: Element) => {
  const parts: string[] = [];
  const walk = (at: Node) => {
    if (at.nodeType === Node.TEXT_NODE) parts.push(at.textContent ?? '');
    if (!(at instanceof Element) || at.getAttribute('aria-hidden') === 'true') return;
    for (const child of at.childNodes) walk(child);
  };
  walk(node);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

/** The count of verses the grew line `line` says grew, or none for a line of another form. */
const grewCount = (line: string) => {
  if (line === 'Nothing grew this time.') return 0;
  const many = /^([1-9]\d*) grew a stage\.$/.exec(line)?.[1];
  if (many === undefined) return undefined;
  return Number(many);
};

/** What the end's lines and grown verses show wrong: not one grew line, a line of another form, a count that is not the grown nodes', and each grown node that is no named image with one picture, or a name twice. */
const grownFaults = (grew: readonly Element[], grown: readonly Element[]) => {
  const out: string[] = [];
  if (grew.length !== 1) out.push(`${grew.length} grew lines on ${END}`);
  const line = text(grew[0]);
  const count = grewCount(line);
  if (grew.length === 1 && count === undefined) out.push(`the grew line ${line}`);
  if (grew.length === 1 && count !== undefined && count !== grown.length)
    out.push(`${grown.length} grown under ${line}`);
  const names = grown.map(nameOf);
  if (new Set(names).size < names.length) out.push('a verse grown twice');
  for (const node of grown) {
    if (node.getAttribute('role') !== 'img' || !GROWN_NAME.test(nameOf(node)))
      out.push(`a grown node ${node.getAttribute('role')}:${nameOf(node)}`);
    if (node.querySelectorAll('img').length !== 1) out.push('a grown node without its one image');
  }
  return out;
};

/** What the end shows wrong on the screen `on`: off the end, any node of it; on the end, a control but `Your field`, not one `tended`, a grew line or grown verse wrong (`grownFaults`), a node of it outside the scroll view, an alert, a reading that is not the heading, the back and the line, an unread garden, or a moving node that is not one hidden drawing without text or a control (`motionFaults`). */
const endFaults = (
  host: Element,
  on: string,
  garden: 'read' | 'unread',
  controls: readonly Element[],
) => {
  if (on !== END) {
    if (host.querySelector(END_SELECTOR) === null) return [];
    return ids(host, END_NODES).map((id) => `the end's ${id} on ${on}`);
  }
  const nodes = (id: string) => [...host.querySelectorAll(`[data-testid="${id}"]`)];
  const tended = nodes('tended');
  const grew = nodes('grew');
  const grown = nodes('grown');
  const out: string[] = [];
  if (garden === 'unread') out.push(`the end on an unread garden`);
  for (const node of controls)
    if (nameOf(node) !== 'Your field') out.push(`the control ${nameOf(node)} on ${END}`);
  if (tended.length !== 1) out.push(`${tended.length} tended nodes on ${END}`);
  out.push(...grownFaults(grew, grown));
  for (const node of [...tended, ...grew, ...grown])
    if (!scrolled(node))
      out.push(`the end's ${node.getAttribute('data-testid')} outside the scroll view`);
  if (host.querySelector('[role="alert"]') !== null) out.push(`an alert on ${END}`);
  const read = exposed(host);
  if (read !== `${END} ‹ Your field ${text(grew[0])}`.trim())
    out.push(`the end reads ${read.slice(0, 80)}`);
  out.push(...motionFaults(host));
  return out;
};

/** What `Your field` shows wrong on the screen `on` (`list` when it is a list's own page): off its screens, on an unread garden, on Today while listening, missing from Today, the end or a list's page, not one, or in a scroll view. */
const backFaults = (
  on: string,
  garden: 'read' | 'unread',
  backs: readonly Element[],
  listening: boolean,
  list: boolean,
) => {
  const out: string[] = [];
  const offered = backs.length > 0;
  const allowed = on === 'Today' || on === END || BACKS.has(on) || list;
  if (offered && !allowed) out.push(`Your field on ${on}`);
  if (offered && garden === 'unread') out.push(`Your field on an unread garden (${on})`);
  if (on === 'Today' && offered && listening) out.push('Your field on Today while listening');
  const owed = on === END || list || (on === 'Today' && garden === 'read' && !listening);
  if (owed && !offered) out.push(`no Your field on ${on}`);
  if (backs.length > 1) out.push(`${backs.length} Your field controls on ${on}`);
  if (backs.some(scrolled)) out.push(`Your field inside a scroll view on ${on}`);
  return out;
};

/** What the `Settings` row shows wrong on the screen `on`: not exactly one on home, any on another screen, or one outside the scroll view. */
const settingsFaults = (on: string, rows: readonly Element[]) => {
  const out: string[] = [];
  if (on === 'Your field' && rows.length !== 1)
    out.push(`${rows.length} Settings controls on Your field`);
  if (on !== 'Your field' && rows.length > 0) out.push(`Settings on ${on}`);
  if (rows.some((node) => !scrolled(node))) out.push('Settings outside the scroll view');
  return out;
};

/** Home's old nodes, by test id, which no frame of home may show again. */
const OLD_HOME = ['counts', 'add-verses', 'add-row'];

/** Home's one primary action by name: the Today card's `Start` or `Practice anyway`; a `Practice <reference>` or `Learn <reference>` counts too, so a second card beside it shows as two. */
const PRIMARY = /^(Start|Practice .+|Learn .+)$/u;

/**
 * hsstart's home rule over a frame of home (`on` being `Your field`): none
 * of home's old nodes (`home's old <id>`), at most one `Add a list` (`<n>
 * Add a list controls`), at most one primary action (`<n> primary actions:
 * <names>`), which lies outside the scroll view (`<name> inside the scroll
 * view`), no plant showing a number (`a number in <name>`), and with
 * hslist L5 no control named `Remove` or starting `Remove ` (`<name> on
 * home`), exactly one `Open <title>` in each furrow's row (`<n> Open
 * <title> in its row`) and no other `Open …` (`<n> Open controls for <k>
 * rows`). Off home it
 * holds nothing; `When I need…` on any screen and `Settings` outside the
 * scroll view are `rootFaults`'s own clauses.
 */
export const homeRuleFaults = (on: string, host: Element, controls: readonly Element[]) => {
  if (on !== 'Your field') return [];
  const out = ids(host, OLD_HOME).map((id) => `home's old ${id}`);
  const adds = controls.filter((node) => nameOf(node) === 'Add a list');
  if (adds.length > 1) out.push(`${adds.length} Add a list controls`);
  const primary = controls.filter((node) => PRIMARY.test(nameOf(node)));
  if (primary.length > 1)
    out.push(`${primary.length} primary actions: ${primary.map(nameOf).join(', ')}`);
  for (const node of primary)
    if (scrolled(node)) out.push(`${nameOf(node)} inside the scroll view`);
  for (const plant of host.querySelectorAll('[data-testid="field-plant"]'))
    if ([plant, ...plant.querySelectorAll('*')].some((node) => /^\d+$/u.test(text(node))))
      out.push(`a number in ${nameOf(plant)}`);
  for (const node of controls)
    if (/^Remove( |$)/u.test(nameOf(node))) out.push(`${nameOf(node)} on home`);
  const rows = [...host.querySelectorAll('[data-testid="row"]')];
  for (const row of rows) {
    const title = text(row.querySelector('[data-testid="row-title"]'));
    const opens = [...row.querySelectorAll(CONTROLS)].filter(
      (node) => nameOf(node).replace(/\s+/g, ' ').trim() === `Open ${title}`.trim(),
    );
    if (opens.length !== 1) out.push(`${opens.length} Open ${title} in its row`);
  }
  const opens = controls.filter((node) => nameOf(node).startsWith('Open ')).length;
  if (opens !== rows.length) out.push(`${opens} Open controls for ${rows.length} rows`);
  return out;
};

/** The nodes of home a list's own page never shows, by test id. */
const HOME_ON_LIST = ['today-card', 'chosen', 'add-list'];

/**
 * hslist's list rule over a frame (`list` being whether it shows a list's
 * own page, found by `id=list-screen`, since its heading is the list's
 * title): on the page, at most one `Practice this list`, outside the scroll
 * view (`<n> Practice this list`, `Practice this list inside the scroll
 * view`), every `Remove <name>` and the ask inside it (`<name> outside the
 * scroll view`, `the ask outside the scroll view`), and none of home's
 * `today-card`, `chosen` or `add-list` (`home's <id> on a list`); off it,
 * no `Practice this list` (`Practice this list on <screen>`). Its one
 * heading, its one `Your field` outside the scroll view and the absence
 * of Today's actions and nodes are `rootFaults`'s own clauses.
 */
const listRuleFaults = (on: string, list: boolean, host: Element, controls: readonly Element[]) => {
  const practices = controls.filter((node) => nameOf(node) === 'Practice this list');
  if (!list) return practices.map(() => `Practice this list on ${on}`);
  const out = ids(host, HOME_ON_LIST).map((id) => `home's ${id} on a list`);
  if (practices.length > 1) out.push(`${practices.length} Practice this list`);
  if (practices.some(scrolled)) out.push('Practice this list inside the scroll view');
  for (const node of controls)
    if (nameOf(node).startsWith('Remove ') && !scrolled(node))
      out.push(`${nameOf(node)} outside the scroll view`);
  for (const node of host.querySelectorAll('[data-testid="ask"]'))
    if (!scrolled(node)) out.push('the ask outside the scroll view');
  return out;
};

/** Each screen before the first verse, by heading, with the controls it may offer: the welcome's `Begin` and `Skip`, how a verse grows' one button. */
const INTRO = new Map<string, readonly string[]>([
  ['Heartseed', ['Begin', 'Skip']],
  ['Every verse is a plant', ['Plant your first verse', 'See your field']],
]);

/** The names only those two screens offer. */
const INTRO_NAMES = new Set([...INTRO.values()].flat());

/**
 * What the licences show wrong on the screen `on`: the credits or the
 * licence on any screen but `Licences` (so no row lands on them straight),
 * on `Licences` not one of each; a `Licences` row anywhere but About, and
 * not exactly one there; the back `About` anywhere but `Licences`, not
 * exactly one there, or inside its scroll view.
 */
export const licenceFaults = (on: string, host: Element, controls: readonly Element[]) => {
  const out: string[] = [];
  const at = on === 'Licences';
  for (const id of ['about-credits', 'about-licence']) {
    const count = host.querySelectorAll(`[data-testid="${id}"]`).length;
    if (!at && count > 0) out.push(`${id} on ${on}`);
    if (at && count !== 1) out.push(`${count} ${id} on Licences`);
  }
  const rows = controls.filter((node) => nameOf(node) === 'Licences');
  if (on !== 'About' && rows.length > 0) out.push(`Licences on ${on}`);
  if (on === 'About' && rows.length !== 1) out.push(`${rows.length} Licences on About`);
  const backs = controls.filter((node) => nameOf(node) === 'About');
  if (!at && backs.length > 0) out.push(`the About back on ${on}`);
  if (at && backs.length !== 1) out.push(`${backs.length} About backs on Licences`);
  if (backs.some(scrolled)) out.push('the About back inside a scroll view');
  return out;
};

/** The tips' ids. */
const TIP_IDS = ['tip-1', 'tip-2', 'tip-3'];

/** What a screen before the first verse shows wrong: on the welcome not exactly one `Begin` and at most one `Skip`; on how a verse grows not exactly one control of its two names; on either a control inside the scroll view or one of another name; a word node, `id=reading`, a recital node, or a node of Today or home. */
const introOnFaults = (on: string, host: Element, controls: readonly Element[]) => {
  const names = controls.map(nameOf);
  const own = INTRO.get(on) ?? [];
  const out = names.filter((name) => !own.includes(name)).map((name) => `${name} on ${on}`);
  if (on === 'Heartseed') {
    const begins = names.filter((name) => name === 'Begin').length;
    const skips = names.filter((name) => name === 'Skip').length;
    if (begins !== 1) out.push(`${begins} Begin on Heartseed`);
    if (skips > 1) out.push(`${skips} Skip on Heartseed`);
  } else if (controls.length !== 1) out.push(`${controls.length} controls on ${on}`);
  for (const node of controls)
    if (scrolled(node)) out.push(`${nameOf(node)} inside the scroll view`);
  const strays = host.querySelectorAll(
    '[data-testid^="word-"],[data-testid="reading"],[data-testid="stage"],[data-testid="summary"],[data-testid="session"]',
  );
  if (strays.length > 0) out.push(`a node of the verse's phases or Today on ${on}`);
  return out;
};

/**
 * hsintro's rule over a frame: the screens before the first verse
 * (`introOnFaults`), and their four control names (`Begin`, `Skip`,
 * `Plant your first verse`, `See your field`) on no other screen (`<name>
 * on <screen>`). Home's tips (`[data-testid^="tip-"]`) and `Got it` show
 * on `Your field` alone (`a tip on <screen>`, `Got it on <screen>`); at
 * most three tips, ids distinct among `tip-1` to `tip-3` (`the tips
 * <ids>`); exactly one `Got it` while a tip shows and none otherwise (`<n>
 * Got it for <k> tips`), outside the scroll view (`Got it inside the
 * scroll view`); `tip-1` outside the scroll view and `tip-2` and `tip-3`
 * inside (`<id> …the scroll view`); `tip-2` only beside `id=add-list`
 * (`tip-2 without Add a list`); no tip is or holds a control (`a control in
 * <id>`). Home holds exactly one `How Heartseed works`, inside the scroll
 * view (`<n> How Heartseed works on Your field`, `How Heartseed works
 * outside the scroll view`).
 */
export const introRuleFaults = (on: string, host: Element, controls: readonly Element[]) => {
  const tips = [...host.querySelectorAll('[data-testid^="tip-"]')];
  const gotIt = controls.filter((node) => nameOf(node) === 'Got it');
  if (INTRO.has(on)) return [...introOnFaults(on, host, controls), ...strayTips(on, tips, gotIt)];
  const out = controls
    .filter((node) => INTRO_NAMES.has(nameOf(node)))
    .map((node) => `${nameOf(node)} on ${on}`);
  if (on !== 'Your field') return [...out, ...strayTips(on, tips, gotIt)];
  return [...out, ...tipFaults(host, tips, gotIt), ...howFaults(controls)];
};

/** Off home: any tip, and any `Got it`. */
const strayTips = (on: string, tips: readonly Element[], gotIt: readonly Element[]) => [
  ...tips.slice(0, 1).map(() => `a tip on ${on}`),
  ...gotIt.slice(0, 1).map(() => `Got it on ${on}`),
];

/** On home: the tips' ids, `Got it` beside them, and each tip's place, neighbour and controls. */
const tipFaults = (host: Element, tips: readonly Element[], gotIt: readonly Element[]) => {
  const out: string[] = [];
  const tipIds = tips.map((node) => node.getAttribute('data-testid') ?? '');
  const distinct = new Set(tipIds).size === tipIds.length;
  if (tips.length > 3 || !distinct || tipIds.some((id) => !TIP_IDS.includes(id)))
    out.push(`the tips ${tipIds.join('|')}`);
  if (gotIt.length !== Math.min(tips.length, 1))
    out.push(`${gotIt.length} Got it for ${tips.length} tips`);
  if (gotIt.some(scrolled)) out.push('Got it inside the scroll view');
  for (const node of tips) out.push(...oneTipFaults(host, node));
  return out;
};

/** One tip: tip-1 outside the scroll view, the others inside, tip-2 beside `Add a list`, and no control. */
const oneTipFaults = (host: Element, node: Element) => {
  const out: string[] = [];
  const id = node.getAttribute('data-testid') ?? '';
  const inside = scrolled(node);
  if (id === 'tip-1' && inside) out.push('tip-1 inside the scroll view');
  if (id !== 'tip-1' && !inside) out.push(`${id} outside the scroll view`);
  if (id === 'tip-2' && host.querySelector('[data-testid="add-list"]') === null)
    out.push('tip-2 without Add a list');
  if (node.matches(CONTROLS) || node.querySelector(CONTROLS) !== null)
    out.push(`a control in ${id}`);
  return out;
};

/** On home: exactly one `How Heartseed works`, inside the scroll view. */
const howFaults = (controls: readonly Element[]) => {
  const how = controls.filter((node) => nameOf(node) === 'How Heartseed works');
  const out: string[] = [];
  if (how.length !== 1) out.push(`${how.length} How Heartseed works on Your field`);
  if (how.some((node) => !scrolled(node))) out.push('How Heartseed works outside the scroll view');
  return out;
};

const CHOICE_NAME = /^(\d+ min|Voice)$/;

/** What the reader's choices show wrong on the screen `on`: a `Minutes` group, an `<n> min` control or a `Voice` control under the host, on every screen. */
const choicesFaults = (on: string, host: Element, controls: readonly Element[]) => {
  const groups = [...host.querySelectorAll('[role="radiogroup"][aria-label="Minutes"]')];
  const choices = controls.filter((node) => CHOICE_NAME.test(nameOf(node)));
  return [...groups, ...choices].map((node) => `${nameOf(node)} on ${on}`);
};

/** The controls that make or change the plan, or lead to a screen that does, by name. */
const PLAN_CONTROLS = new Set([
  'Settings',
  'Your field',
  'Plant',
  'Voice',
  'Add a list',
  'Any passage',
]);

/** The name a node that makes the plan goes by in the listening clause, or none. */
const reachOf = (node: Element) => {
  if (node.hasAttribute('aria-modal')) return 'a sheet';
  const role = node.getAttribute('role');
  const name = nameOf(node);
  if (role === 'radiogroup' && name === 'Minutes') return 'Minutes';
  if (role === 'radiogroup') return undefined;
  if (role === 'radio' && /^\d+ min$/.test(name)) return name;
  if (PLAN_CONTROLS.has(name) || name === 'Remove' || name.startsWith('Remove ')) return name;
  if (name.startsWith('Plant ')) return name;
  return undefined;
};

/** What is in reach while a recital listens: every node of the host's whole document, the sheet's portal included, that makes the plan, as `<name> in reach while listening`. */
const listeningFaults = (host: Element) =>
  [
    ...host.ownerDocument.querySelectorAll(
      `${CONTROLS},[role="radiogroup"][aria-label="Minutes"],[aria-modal]`,
    ),
  ]
    .map(reachOf)
    .filter((name) => name !== undefined)
    .map((name) => `${name} in reach while listening`);

/** A word range as main's build named a piece of a verse: `[<first>-<last>]`. */
const WORD_RANGE = /\[\d+-\d+\]/u;

/**
 * hspiece's clause over every frame, the pending one included: no text node
 * and no accessible name (`aria-label`) under the host holds a word range,
 * each `a word range <range> in a text` or `… in a name`, naming the range
 * alone and never the words around it.
 */
const rangeFaults = (host: Element) => {
  const out: string[] = [];
  if (WORD_RANGE.test(host.textContent ?? '')) {
    const walker = host.ownerDocument.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    for (let at = walker.nextNode(); at !== null; at = walker.nextNode()) {
      const found = WORD_RANGE.exec(at.textContent ?? '')?.[0];
      if (found !== undefined) out.push(`a word range ${found} in a text`);
    }
  }
  for (const node of host.querySelectorAll('[aria-label]')) {
    const found = WORD_RANGE.exec(node.getAttribute('aria-label') ?? '')?.[0];
    if (found !== undefined) out.push(`a word range ${found} in a name`);
  }
  return out;
};

const WORD_RUN = /[\p{L}\p{N}]/u;

/** How many words (whitespace runs holding a letter or number) `text` holds. */
const wordCount = (text: string) => text.split(/\s+/u).filter((run) => WORD_RUN.test(run)).length;

/** The verse view a break or line sits in, and its words: `passage` by its lines' text, `reading` or the cue's view by its `word-<i>` children; none for any other parent. */
const verseViewOf = (node: Element): { readonly words: number } | null => {
  const parent = node.parentElement;
  if (parent === null) return null;
  const id = parent.getAttribute('data-testid');
  if (id === 'passage')
    return {
      words: wordCount(
        [...parent.querySelectorAll('[data-testid^="line-"]')]
          .map((line) => line.textContent ?? '')
          .join(' '),
      ),
    };
  const words = [...parent.children].filter((child) =>
    (child.getAttribute('data-testid') ?? '').startsWith('word-'),
  ).length;
  if (id === 'reading' || words > 0) return { words };
  return null;
};

/**
 * The lines' clause (hspiece L3): each `break-<k>` lies in a verse view
 * (`passage`, `reading` or the cue's view of `word-<i>`), with no text and
 * no role, and never in a view of 20 words or fewer, which is one line;
 * each `line-<i>` lies in `passage`. Its faults: `<id> outside a verse`,
 * `<id> holds text`, `<id> has a role`, `<id> in a verse of <n> words`,
 * `<id> outside passage`.
 */
const lineFaults = (host: Element) => {
  const out: string[] = [];
  for (const node of host.querySelectorAll('[data-testid^="break-"]')) {
    const id = node.getAttribute('data-testid') ?? '';
    const view = verseViewOf(node);
    if (view === null) out.push(`${id} outside a verse`);
    else if (view.words <= 20) out.push(`${id} in a verse of ${view.words} words`);
    if ((node.textContent ?? '') !== '') out.push(`${id} holds text`);
    if (node.getAttribute('role') !== null) out.push(`${id} has a role`);
  }
  for (const node of host.querySelectorAll('[data-testid^="line-"]'))
    if (node.parentElement?.getAttribute('data-testid') !== 'passage')
      out.push(`${node.getAttribute('data-testid') ?? ''} outside passage`);
  return out;
};

/**
 * The root's frame rule (hshomeroot), for every rig that mounts the root:
 * what one frame shows wrong, `garden` being whether the launch's garden
 * read completes. A frame shows one screen, by its one heading, or the
 * pending frame (no heading), which holds the reference alone. `Your field`
 * is a way back from Today (on a read garden while nothing listens, and then
 * always), the end of a run `The field is tended` (always), a list's own
 * page (always; `listRuleFaults` holds the rest of that page) and About,
 * never in a scroll view,
 * and nowhere else: never on home, never on the chooser's `Add a passage`,
 * never on an unread garden (`backFaults`). The chooser's `Add a passage`
 * shows exactly one control whose text is `‹ Add verses`, its way back to
 * the Add verses sheet, outside its scroll view, and no other screen shows
 * one (`addBackFaults`); home's own `Add a list`, with no `‹ `, is no back.
 * `Listening`, Today's action and Today's
 * nodes show only on Today (or in the first minute, whose recitals are its
 * own), home's nodes only on home, no `When I need…` on any screen,
 * exactly one `Settings` on home, a row inside the scroll
 * view, and none elsewhere (`settingsFaults`), no `Minutes` group, `<n> min` or
 * `Voice` on any screen (`choicesFaults`), and no screen has a control named `Today`; home holds home's rule
 * (`homeRuleFaults`: one primary action, outside the scroll view, no old
 * node, one `Add a list`, no number in a plant). The screens before the
 * first verse, home's tips and `How Heartseed works` hold hsintro's rule
 * (`introRuleFaults`). The
 * Settings sheet lies outside the host, so its nodes are the sheet rule's
 * (`settings-rig.ts`). While the host shows `Listening`, on any frame,
 * nothing that makes the plan is in reach anywhere in the host's document,
 * the sheet's portal included (`listeningFaults`): no control named
 * `Settings`, `Your field`, `Plant` (or starting `Plant `, the Add a list
 * sheet's offers), `Voice`, `Add a list`, `Any passage` or `Remove` (or
 * starting `Remove `), no `<n> min` radio, no `Minutes` group and no `[aria-modal]`
 * node, each the fault `<name> in reach while listening`. The end of a run
 * (`endFaults`) holds no control but `Your field` (`the control <name> on
 * The field is tended`), exactly one `tended` and one `grew` line (`<n>
 * tended nodes …`, `<n> grew lines …`), a line `Nothing grew this time.` or
 * `<n> grew a stage.` (`the grew line <line>`) whose n is the count of
 * `grown` nodes (`<k> grown under <line>`), each `grown` an `img` named
 * `<reference>, <stage>` (`a grown node <role>:<name>`) holding exactly one
 * image (`a grown node without its one image`), no name twice (`a verse
 * grown twice`), each of its nodes inside the scroll view (`the end's <id>
 * outside the scroll view`), no alert (`an alert on …`), an exposed reading
 * of exactly the heading, `‹ Your field` and the line (`the end reads
 * <first 80>`), and a read garden (`the end on an unread garden`); Today's
 * action and nodes there are faults as on any screen but Today. Any other
 * screen showing a node of the end is the fault `the end's <id> on
 * <screen>`, found by one query a frame. On every frame, the pending one
 * too, no text and no accessible name holds a word range (`rangeFaults`),
 * and a verse's breaks and lines are where its lines put them (`lineFaults`).
 */
export const rootFaults = (host: Element, garden: 'read' | 'unread'): string[] => {
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  const controls = [...host.querySelectorAll(CONTROLS)];
  const named = (name: string) => controls.filter((node) => nameOf(node) === name);
  const listening = named('Listening').length > 0;
  const reach: string[] = [...rangeFaults(host), ...lineFaults(host)];
  if (listening) reach.push(...listeningFaults(host));
  if (headings.length === 0) return [...pendingFaults(host, controls), ...reach];
  const out: string[] = [];
  if (headings.length > 1) out.push(`the headings ${headings.join('|')}`);
  const on = headings[0] ?? '';
  const list = host.querySelector('[data-testid="list-screen"]') !== null;
  out.push(...backFaults(on, garden, named('Your field'), listening, list));
  out.push(
    ...addBackFaults(
      on,
      controls.filter((node) => text(node) === ADD_BACK),
    ),
  );
  const today = on === 'Today' || FIRST.has(on);
  for (const node of controls)
    if (ACTIONS.has(nameOf(node)) && !today) out.push(`${nameOf(node)} on ${on}`);
  for (const id of ids(host, TODAY_NODES)) if (!today) out.push(`Today's ${id} on ${on}`);
  if (named('Today').length > 0) out.push(`a control named Today on ${on}`);
  if (named('When I need…').length > 0) out.push(`When I need… on ${on}`);
  for (const id of ids(host, HOME_NODES))
    if (on !== 'Your field') out.push(`home's ${id} on ${on}`);
  out.push(...endFaults(host, on, garden, controls));
  out.push(...settingsFaults(on, named('Settings')));
  out.push(...homeRuleFaults(on, host, controls));
  out.push(...listRuleFaults(on, list, host, controls));
  out.push(...introRuleFaults(on, host, controls));
  out.push(...licenceFaults(on, host, controls));
  out.push(...choicesFaults(on, host, controls));
  out.push(...reach);
  return out;
};

/**
 * Holds every frame (each DOM mutation batch) under `host` to `rootFaults`,
 * keeping each fault once, at most 8, with the frame's heading. A frame that
 * draws nothing (before the first render) is no frame. `stop` ends the
 * watch before the launch's unmount.
 */
export const watchRoot = (host: Element, garden: 'read' | 'unread') => {
  const faults: string[] = [];
  const seen = new Set<string>();
  const frames: { headings: string[]; counts: string; listening: boolean }[] = [];
  const frame = () => {
    if (text(host) === '' && host.querySelector('[role]') === null) return;
    const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
    frames.push({
      headings,
      counts: cardLine(host),
      listening: [...host.querySelectorAll(CONTROLS)].some((node) => nameOf(node) === 'Listening'),
    });
    for (const fault of rootFaults(host, garden)) {
      if (faults.length >= 8 || seen.has(fault)) continue;
      seen.add(fault);
      faults.push(`${fault} (frame ${frames.length}: ${headings.join('|') || 'pending'})`);
    }
  };
  const watch = new MutationObserver(frame);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  return { faults, frames, stop: () => watch.disconnect() };
};

/** The screens a launch's frames showed, in order, by heading (`pending` for none), repeats collapsed. */
export const screensOf = (frames: readonly { readonly headings: readonly string[] }[]) =>
  frames
    .map((frame) => frame.headings.join('|') || 'pending')
    .filter((each, index, all) => each !== all[index - 1]);

/** The host a rig adds and the watch over it, once added. */
interface Added {
  host?: Element;
  watch?: ReturnType<typeof watchRoot>;
}

/**
 * A rig's launch (`start`) with every frame of its host held to the root's
 * rule (`watchRoot`): the host is the element the rig adds to the
 * document's body, watched from the turn it is added, before the root's
 * first render. It answers the rig's launch, the host, the watch, what the
 * host shows (home with its counts, Today, the reference, the counts), and
 * `end`, which stops the watch, then leaves.
 */
export const watchedLaunch = async <App extends { readonly leave: () => Promise<unknown> }>(
  garden: 'read' | 'unread',
  start: () => Promise<App>,
) => {
  const added: Added = {};
  const found = new MutationObserver((records) => {
    const node = records
      .flatMap((each) => [...each.addedNodes])
      .find((each) => each instanceof Element);
    if (!(node instanceof Element) || added.host !== undefined) return;
    added.host = node;
    added.watch = watchRoot(node, garden);
    found.disconnect();
  });
  found.observe(document.body, { childList: true });
  const app = await start();
  found.disconnect();
  const { host, watch } = added;
  if (host === undefined || watch === undefined) throw new Error('the rig added no host');
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(text).join('|');
  const counts = () => cardLine(host);
  return {
    app,
    host,
    watch,
    counts,
    home: () => headings() === 'Your field' && counts() !== '',
    today: () => headings() === 'Today',
    reference: () => text(host.querySelector('[data-testid="reference"]')),
    end: () => {
      watch.stop();
      return app.leave();
    },
  };
};
