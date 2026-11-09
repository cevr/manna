/* oxlint-disable effect/noGlobals, effect/noNullish, effect/noAsyncFunction, effect/noNewPromise, effect/noFixedWaitInTests, eslint/no-await-in-loop, effect/noTernary -- the field's screen rig: it mounts the root route in happy-dom's document through React's promise-based `act`; the runtime's forked Effect work and the scripted recital run on the host's clock, so each turn is handed over in `act` until the frame a test waits on lands, at most 3 s; it reads nodes whose absent attributes are null and writes the device's records as JSON text. */

/**
 * The field as a reader and a screen reader meet it, for the field's screen
 * tests: the root route mounted in happy-dom (react-native-web) under the
 * app's own layer over a scripted recital (the passage less its 11th word),
 * the app's real store on the device's `One.Database` (`one.tsx`) and a
 * silent chime. A launch lands on home (on Today over an unread garden); a
 * relaunch is a new mount over the same disk.
 *
 * Every frame (each DOM mutation batch) is held to the rule and each fault
 * kept: the root's frame rule (`rootFaults`: `Your field` only as a way
 * back, on Today never while Say it listens and never inside a scroll view,
 * so it is on screen however much Today holds; a home node only under home's
 * heading, never beside Today's); `Your field` only once the garden's read
 * completed; the field holds exactly one
 * `Your field` heading and no `Today` heading, whatever its references
 * spell; every field frame holds home A's layout rules (`homeFaults`); and
 * every field frame shows the rule's field over the records the disk holds
 * (`field-model.ts`): the rows, each with its icon and ripe count, each
 * plant's label (readiness cut off: the home walk holds it to the plan),
 * its drawing (the home icon of its stage in the scheme now, or bare soil)
 * and its verse number and nothing else, the days sown and the harvest as
 * seen and as exposed, and no other number or exposed image. Opening the
 * field must write nothing.
 */

import { RegistryProvider } from '@effect/atom-react';
import { expect } from 'bun:test';
import { Effect, Layer, Logger } from 'effect';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import passage from 'virtual:heartseed-passage';

import Root from '../../app/index';
import { appLayer, runtime } from '../app';
import { recite, scriptedSource } from '../dictation/script';
import { Chime } from '../garden';
import { Haptics, type Recall } from '../sayit';
import { MINUTES_KEY } from '../session/service';
import { store } from '../store';
import { theme } from '../theme';
import { voiceSource } from '../voice/source';
import { clockOf, toDue, type Time } from './clock';
import { AA, contrastOf } from './contrast';
import { computed, lookFaults, systemScheme } from './look';
import { fieldRule, heldOn, verseNumberRule, type ModelPlantStage } from './field-model';
import { keyOf, PREFIX } from './garden-model';
import { device } from './one';
import { rootFaults } from './root-rule';

const PASSAGES = [{ title: passage.reference, verses: [passage.reference] }];

/** Each stage as the field draws it: the home icon of its name (full corn as `corn`), or bare soil before planting. */
const DRAWN: Readonly<Record<ModelPlantStage, string>> = {
  'not planted': 'soil',
  seed: 'seed',
  blade: 'blade',
  ear: 'ear',
  'full corn': 'corn',
};

/** The stages a plant's name may end in. */
const STAGE_NAMES = '(seed|blade|ear|full corn|not planted)';

const READY = ', ready today';

/** A plant's name with its ready mark cut off. */
const unready = (label: string) => (label.endsWith(READY) ? label.slice(0, -READY.length) : label);

/** The verse and stage a plant's name gives, none when it is no plant's name. */
const nameParts = (label: string) => {
  const found = new RegExp(`^(.*), ${STAGE_NAMES}$`, 'su').exec(unready(label));
  return found === null ? null : { reference: found[1] ?? '', stage: found[2] ?? '' };
};

const ICON = /\/assets\/home\/([a-z]+)-(light|dark)\.png$/u;

/** A home icon's name from an image's source when it is of the scheme now, else what it is instead. */
export const iconOf = (image: Element | null | undefined) => {
  const found = ICON.exec(image?.getAttribute('src') ?? '');
  if (found === null) return '<no home icon>';
  return found[2] === systemScheme() ? (found[1] ?? '') : `<${found[1]} of the ${found[2]} set>`;
};

/** The one image under `node` when it is hidden, its icon's name; else what is wrong. */
const oneIcon = (node: Element) => {
  const images = node.querySelectorAll('img');
  const image = images[0];
  if (images.length !== 1 || image === undefined) return `<${images.length} images>`;
  return hidden(image) ? iconOf(image) : '<an exposed icon>';
};

/** The record of `recall` as the garden writes it. */
export const record = (recall: Recall) => [keyOf(recall), JSON.stringify(recall)] as const;

/** Text as a reader sees it: whitespace collapsed. */
export const text = (node: Element | null | undefined) =>
  (node?.textContent ?? '').replace(/\s+/g, ' ').trim();

const hidden = (node: Element) => node.closest('[aria-hidden="true"]') !== null;

/** Whether a reader sees `node`: no ancestor out of the layout or transparent, its ink not transparent. */
const seen = (node: Element) => {
  for (let at: Element | null = node; at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
      return false;
  }
  return !/rgba\(.*, 0(\.0+)?\)$|transparent/.test(getComputedStyle(node).color);
};

/** The properties `ownStyle` reads: none inherited, so each is the node's own class and inline style alone. */
type OwnProperty =
  | 'overflow'
  | 'overflowY'
  | 'minHeight'
  | 'minWidth'
  | 'width'
  | 'backgroundColor';

const ownStyles = new Map<string, string>();

/** `node`'s computed `property`, kept by its tag, class and inline style: the frame rules ask it of every control and its ancestors on every frame, happy-dom computes a whole style each time, and react-native-web's atomic classes never change their rules, so two nodes alike in all three have the same own (not inherited) style. */
const ownStyle = (node: Element, property: OwnProperty) => {
  const key = `${property}|${node.tagName}|${node.getAttribute('class') ?? ''}|${node.getAttribute('style') ?? ''}`;
  const known = ownStyles.get(key);
  if (known !== undefined) return known;
  const value = getComputedStyle(node)[property];
  ownStyles.set(key, value);
  return value;
};

/** Whether `node` lies inside a scroll view: an ancestor that scrolls its overflow, so a reader may have to scroll to reach it. */
export const scrolled = (node: Element) => {
  for (let at = node.parentElement; at !== null; at = at.parentElement)
    if (/auto|scroll/.test(`${ownStyle(at, 'overflowY')} ${ownStyle(at, 'overflow')}`)) return true;
  return false;
};

/** A count's text when it is one node, seen, and exposed as that text. */
const counted = (host: Element, id: string) => {
  const nodes = host.querySelectorAll(`[data-testid="${id}"]`);
  const node = nodes[0];
  if (nodes.length !== 1 || node === undefined) return `<${nodes.length} ${id}>`;
  const exposed = !hidden(node) && (node.getAttribute('aria-label') ?? text(node)) === text(node);
  return seen(node) && exposed ? text(node) : `<${id} not seen as exposed>`;
};

/** A plant's drawing as the reader sees it: the one hidden home icon of its stage in the scheme now, or the one hidden bare soil filled `soil`, and nothing else. */
const drawingOf = (plant: Element) => {
  const soils = plant.querySelectorAll('[data-testid="plant-soil"]');
  const images = plant.querySelectorAll('img');
  const soil = soils[0];
  if (soils.length === 0) return oneIcon(plant);
  if (soils.length !== 1 || soil === undefined || images.length > 0)
    return '<not one hidden drawing>';
  const filled = getComputedStyle(soil).backgroundColor === computed(theme[systemScheme()].soil);
  return hidden(soil) && filled ? 'soil' : '<soil not hidden and filled soil>';
};

/** A plant as the reader gets it: its name (readiness cut off) when it is one exposed button, its drawing, and the text it shows. */
const plantRead = (plant: Element) => ({
  label:
    plant.getAttribute('role') === 'button' && !hidden(plant)
      ? unready(plant.getAttribute('aria-label') ?? '<no name>')
      : '<not one exposed button>',
  drawn: drawingOf(plant),
  shown: [...plant.querySelectorAll('*')]
    .filter((node) => node.children.length === 0 && seen(node))
    .map(text)
    .join(''),
});

const ALLOWED = ['row-title', 'field-plant', 'sown', 'harvest', 'ripe', 'counts', 'chosen']
  .map((id) => `[data-testid="${id}"]`)
  .join(',');

/** A field frame as the reader gets it: the counts, each row's title, icon, ripe count and plants, and the numbers and exposed images outside them. */
export const readField = (host: Element) => {
  const rows = [...host.querySelectorAll('[data-testid="row"]')].map((row) => {
    const titles = row.querySelectorAll('[data-testid="row-title"]');
    const title = titles[0];
    const icons = row.querySelectorAll('[data-testid="furrow-icon"]');
    const icon = icons[0];
    return {
      title:
        titles.length === 1 && title !== undefined && seen(title) && !hidden(title)
          ? text(title)
          : '<title not one seen and exposed>',
      icon: icons.length === 1 && icon !== undefined ? oneIcon(icon) : `<${icons.length} icons>`,
      ripe: counted(row, 'ripe'),
      plants: [...row.querySelectorAll('[data-testid="field-plant"]')].map(plantRead),
    };
  });
  const strays = [...host.querySelectorAll('*')].filter(
    (node) =>
      (node.children.length === 0 &&
        /\d/.test(text(node)) &&
        text(node) !== 'Mark 4:28' &&
        node.closest(ALLOWED) === null) ||
      ((node.tagName === 'IMG' || node.getAttribute('role') === 'img') &&
        node.closest('[data-testid="field-plant"]') === null &&
        !hidden(node)),
  ).length;
  const faint = [...host.querySelectorAll('*')]
    .filter((node) => node.children.length === 0 && text(node) !== '' && seen(node))
    .filter((node) => contrastOf(node) < AA)
    .map((node) => node.closest('[data-testid]')?.getAttribute('data-testid') ?? 'text');
  return {
    sown: counted(host, 'sown'),
    harvest: counted(host, 'harvest'),
    rows,
    strays,
    faint: [...new Set(faint)],
  };
};

/** The field frame the rule gives over the disk as it stands. */
export const wantField = () => {
  const field = fieldRule(heldOn(device.disk), PASSAGES);
  return {
    sown: field.sown === 1 ? '1 day sown' : `${field.sown} days sown`,
    harvest: field.harvest === 1 ? '1 verse at full corn' : `${field.harvest} verses at full corn`,
    rows: field.rows.map((row, index) => ({
      title: row.title.replace(/\s+/g, ' ').trim(),
      icon: index < PASSAGES.length ? 'bow' : 'scroll',
      ripe: `${row.plants.filter((plant) => plant.stage === 'full corn').length} of ${row.plants.length} ripe`,
      plants: row.plants.map((plant) => ({
        label: `${plant.reference}, ${plant.stage}`,
        drawn: DRAWN[plant.stage],
        shown: verseNumberRule(plant.reference).replace(/\s+/g, ' ').trim(),
      })),
    })),
    strays: 0,
    faint: [],
  };
};

const CONTROLS = '[role="button"],[role="radio"],[role="checkbox"],[role="link"]';

/** A control's name: its label, else its text. */
export const nameOf = (node: Element) => node.getAttribute('aria-label') ?? text(node);

const idOf = (node: Element) => node.getAttribute('data-testid') ?? '';

/** The plants shown selected, by name. */
export const selectedPlants = (host: Element) =>
  [...host.querySelectorAll('[data-testid="field-plant"][aria-selected="true"]')].map(nameOf);

/** The foot's one card as a reader reads it: which card, its line (the counts, or the chosen verse and its stage), and its controls' names. */
export const footOf = (host: Element) => {
  const card = host.querySelector(
    '[data-testid="foot"] [data-testid="begin-card"],[data-testid="foot"] [data-testid="chosen"]',
  );
  return {
    card: card?.getAttribute('data-testid') ?? '<none>',
    line: text(card?.querySelector('[data-testid="counts"]') ?? card?.firstElementChild),
    controls: [...(card?.querySelectorAll(CONTROLS) ?? [])].map(nameOf),
  };
};

/** Whether a reader may have to scroll to `node`: a plant, a furrow's `Remove …` and the `Add verses` row. */
const listed = (node: Element) =>
  idOf(node) === 'field-plant' ||
  idOf(node) === 'add-row' ||
  (nameOf(node).startsWith('Remove ') && node.closest('[data-testid="row"]') !== null);

/** What one plant shows wrong: not one exposed button of a plant's name whose children are all hidden, under 44 wide, a dot not exactly on a plant ready today or not filled `sun`, more than one image or one of the other scheme. */
const plantFaults = (plant: Element) => {
  const name = nameOf(plant);
  const out: string[] = [];
  if (plant.getAttribute('role') !== 'button' || hidden(plant) || nameParts(name) === null)
    out.push(`a plant not one exposed button of a plant's name: ${name}`);
  if (![...plant.children].every(hidden)) out.push(`a plant's part exposed: ${name}`);
  if (parseFloat(ownStyle(plant, 'width')) < 44) out.push(`a plant under 44 wide: ${name}`);
  const dots = [...plant.querySelectorAll('[data-testid="dot"]')];
  if (dots.length !== (name.endsWith(READY) ? 1 : 0)) out.push(`${dots.length} dots on ${name}`);
  const sun = computed(theme[systemScheme()].sun);
  if (dots.some((dot) => ownStyle(dot, 'backgroundColor') !== sun))
    out.push(`a dot not filled sun on ${name}`);
  const images = plant.querySelectorAll('img');
  if (images.length > 1) out.push(`${images.length} images in ${name}`);
  if (images.length === 1 && iconOf(images[0]).startsWith('<'))
    out.push(`a plant drawn ${iconOf(images[0])}: ${name}`);
  return out;
};

/** What one furrow shows wrong: its ripe count not `<k> of <n> ripe` over its own plants' names. */
const furrowFaults = (row: Element) => {
  const stages = [...row.querySelectorAll('[data-testid="field-plant"]')].map(
    (plant) => nameParts(nameOf(plant))?.stage,
  );
  const ripe = `${stages.filter((stage) => stage === 'full corn').length} of ${stages.length} ripe`;
  const shown = text(row.querySelector('[data-testid="ripe"]'));
  return shown === ripe ? [] : [`a furrow showing ${shown} over ${ripe}`];
};

/** What the foot shows wrong: not one foot outside the scroll view, both cards, the chosen card without a chosen plant or the other way round, plants of two verses chosen, or `Start here …` outside the chosen card. */
const footFaults = (host: Element, controls: readonly Element[]) => {
  const out: string[] = [];
  const feet = host.querySelectorAll('[data-testid="foot"]');
  const foot = feet[0];
  if (feet.length !== 1 || foot === undefined) out.push(`${feet.length} feet`);
  else if (scrolled(foot)) out.push('the foot inside a scroll view');
  const begins = host.querySelectorAll('[data-testid="begin-card"]').length;
  const chosen = host.querySelectorAll('[data-testid="chosen"]').length;
  if (begins + chosen > 1) out.push(`${begins} Begin and ${chosen} chosen cards`);
  const selected = [
    ...host.querySelectorAll('[data-testid="field-plant"][aria-selected="true"]'),
  ].map((plant) => nameParts(nameOf(plant))?.reference);
  if (chosen > 0 !== selected.length > 0)
    out.push(`${chosen} chosen cards over ${selected.length} chosen plants`);
  if (new Set(selected).size > 1) out.push(`${new Set(selected).size} verses chosen`);
  for (const node of controls)
    if (nameOf(node).startsWith('Start here') && node.closest('[data-testid="chosen"]') === null)
      out.push(`${nameOf(node)} outside the chosen card`);
  return out;
};

/** What the `Add verses` controls show wrong: one not drawn with the one hidden `add` icon of the scheme now, or the row (`add-row`) under 56 tall. */
const addFaults = (controls: readonly Element[]) => {
  const out: string[] = [];
  for (const node of controls) {
    if (nameOf(node) !== 'Add verses') continue;
    const drawn = oneIcon(node);
    if (drawn !== 'add') out.push(`Add verses (${idOf(node)}) drawn ${drawn}`);
    if (idOf(node) === 'add-row' && !(parseFloat(ownStyle(node, 'minHeight')) >= 56))
      out.push('the Add verses row under 56 tall');
  }
  return out;
};

/** What the gear shows wrong: `Settings` not drawn with the one hidden `gear` icon of the scheme now, showing a word, under 44 × 44, or inside a scroll view. */
const gearFaults = (controls: readonly Element[]) => {
  const out: string[] = [];
  for (const node of controls) {
    if (nameOf(node) !== 'Settings') continue;
    const drawn = oneIcon(node);
    if (drawn !== 'gear') out.push(`Settings drawn ${drawn}`);
    if (text(node) !== '') out.push(`Settings showing ${text(node)}`);
    if (!(parseFloat(ownStyle(node, 'minWidth')) >= 44)) out.push('Settings under 44 wide');
    if (!(parseFloat(ownStyle(node, 'minHeight')) >= 44)) out.push('Settings under 44 tall');
    if (scrolled(node)) out.push('Settings in a scroll view');
  }
  return out;
};

/** The three greetings and the icon each is drawn with. */
const GREETING_ICONS = new Map([
  ['Good morning', 'sun'],
  ['Good afternoon', 'sun'],
  ['Good evening', 'moon'],
]);

/** What the greeting shows wrong: not one, not one of the three, or its image not `sun` by day and `moon` by evening in the scheme now. */
const greetingFaults = (host: Element) => {
  const greetings = host.querySelectorAll('[data-testid="greeting"]');
  const greeting = greetings[0];
  if (greetings.length !== 1 || greeting === undefined) return [`${greetings.length} greetings`];
  const words = text(greeting);
  const want = GREETING_ICONS.get(words) ?? `<no icon for ${words}>`;
  const drawn = oneIcon(greeting);
  return drawn === want ? [] : [`the greeting ${words} drawn ${drawn}`];
};

/**
 * What a field frame shows wrong of home A's layout: other than one
 * heading, `Your field`; a control in a scroll view but a plant, a furrow's
 * `Remove …` and the `Add verses` row; a control under 44 tall; a plant's
 * faults (`plantFaults`); a furrow's ripe count off its plants; the foot's
 * faults (`footFaults`); `Add verses` beside the limit line, or drawn
 * other than with the one hidden `add` icon of the scheme now (`addFaults`);
 * the gear's faults (`gearFaults`); the greeting's faults; and any home icon
 * of the other scheme.
 */
export const homeFaults = (host: Element): string[] => {
  const out: string[] = [];
  const headings = [...host.querySelectorAll('[role="heading"]')].map(text);
  if (headings.join('|') !== 'Your field') out.push(`the headings ${headings.join('|')}`);
  const controls = [...host.querySelectorAll(CONTROLS)];
  for (const node of controls) {
    if (scrolled(node) && !listed(node)) out.push(`${nameOf(node)} in a scroll view`);
    if (!(parseFloat(ownStyle(node, 'minHeight')) >= 44)) out.push(`${nameOf(node)} under 44 tall`);
  }
  for (const plant of host.querySelectorAll('[data-testid="field-plant"]'))
    out.push(...plantFaults(plant));
  for (const row of host.querySelectorAll('[data-testid="row"]')) out.push(...furrowFaults(row));
  out.push(...footFaults(host, controls));
  if (
    host.querySelector('[data-testid="limit"]') !== null &&
    controls.some((node) => nameOf(node) === 'Add verses')
  )
    out.push('Add verses beside the limit line');
  out.push(...addFaults(controls), ...gearFaults(controls), ...greetingFaults(host));
  for (const image of host.querySelectorAll('img'))
    if (iconOf(image).endsWith(' set>')) out.push(`an image drawn ${iconOf(image)}`);
  return out;
};

/**
 * The root over the scripted recital and the device's store (built once
 * `held` resolves); `read` is whether this launch's read completes. It
 * lands on home, or on Today when the read fails. Every frame is held to
 * the root's and the field's rules; the faults found are kept.
 */
export const mount = async (
  read: boolean,
  held: Promise<void> = Promise.resolve(),
  time: Time = { now: null },
) => {
  const layer = appLayer({
    source: scriptedSource(recite(passage.text, { skip: [10], every: 5, pace: 3 })),
    haptics: Layer.succeed(Haptics, Haptics.of({ tick: Effect.void })),
    store: Layer.unwrap(
      Effect.as(
        Effect.promise(() => held),
        store,
      ),
    ),
    chime: Layer.succeed(Chime, Chime.of({ grow: () => Effect.void })),
    voice: voiceSource,
  }).pipe(Layer.provideMerge(Layer.merge(clockOf(time), Logger.layer([]))));
  const host = document.createElement('div');
  document.body.append(host);
  const faults: string[] = [];
  const fixed = new Map(device.disk);
  const taps = { minutes: 0 };
  const frames = { control: 0, listening: 0, field: 0, pending: 0 };
  const state = { released: false };
  const headings = () => [...host.querySelectorAll('[role="heading"]')].map(text);
  const buttons = () =>
    [...host.querySelectorAll('[role="button"]')].map((node) => node.getAttribute('aria-label'));
  const control = () =>
    [...host.querySelectorAll('[role="button"]')].find(
      (node) => node.getAttribute('aria-label') === 'Your field',
    );
  const looks = new Map<string, readonly string[]>();
  const looked = (on: string) => {
    for (const fault of lookFaults(host, undefined, looks))
      if (faults.length < 8) faults.push(`${fault} on ${on}`);
  };
  /** A frame of the field held to the field's own rules and to the rule's field over the disk. */
  const fieldFrame = (shown: readonly string[]) => {
    frames.field += 1;
    const own = shown.filter((heading) => heading === 'Your field').length;
    if (own !== 1) faults.push(`${own} Your field headings on the field`);
    if (shown.includes('Today')) faults.push('Today and the field at once');
    for (const fault of homeFaults(host))
      if (faults.length < 8 && !faults.includes(fault)) faults.push(fault);
    const got = JSON.stringify(readField(host));
    const want = JSON.stringify(wantField());
    if (got !== want)
      faults.push(`a field frame ${got.slice(0, 400)} where the rule has ${want.slice(0, 400)}`);
  };
  const frame = () => {
    const shown = headings();
    const on = shown.join('|') || 'no heading';
    looked(on);
    const labels = buttons();
    if (labels.includes('Listening')) frames.listening += 1;
    if (shown.length === 0) frames.pending += 1;
    if (labels.includes('Your field')) {
      frames.control += 1;
      if (!read || !state.released) faults.push('the control before a read completed');
    }
    for (const fault of rootFaults(host, read ? 'read' : 'unread'))
      if (faults.length < 8 && !faults.includes(fault)) faults.push(fault);
    if (shown.includes('Your field')) fieldFrame(shown);
  };
  const watch = new MutationObserver(frame);
  watch.observe(host, { subtree: true, childList: true, attributes: true, characterData: true });
  void held.then(() => {
    state.released = true;
  });
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <RegistryProvider initialValues={[[runtime.layer, layer]]}>
        <Root />
      </RegistryProvider>,
    ),
  );
  const until = async (holds: () => boolean, ms = 3000) => {
    const start = Date.now();
    while (!holds()) {
      if (Date.now() - start > ms) return false;
      await act(() => new Promise((resolve) => setTimeout(resolve, 1)));
    }
    return true;
  };
  const button = (label: string) =>
    [...host.querySelectorAll('[role="button"],[role="radio"]')].find(
      (node) => node.getAttribute('aria-label') === label,
    );
  const tap = async (label: string) => {
    const node = button(label);
    expect([label, node !== undefined]).toEqual([label, true]);
    await act(async () => {
      node?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
  };
  /** Whether home shows, its foot drawn: the launch's plan made, or no plan over unread passages. */
  const home = () =>
    headings().join('|') === 'Your field' && host.querySelector('[data-testid="foot"]') !== null;
  const summary = () => text(host.querySelector('[data-testid="summary"]'));
  /** The grade checked on Today, none when no grade shows. */
  const checked = () =>
    host
      .querySelector('[role="radiogroup"][aria-label="Grade"] [role="radio"][aria-checked="true"]')
      ?.getAttribute('aria-label') ?? null;
  const stage = () =>
    host.querySelector('[data-testid="stage"]')?.getAttribute('aria-label') ?? null;
  /** Says the passage to a new summary: in a read launch its recall is kept and the action reads `Next`; an unread one runs no plan, so it reads `Say it` again. */
  const say = async () => {
    const before = host.querySelector('[data-testid="summary"]');
    const then = read ? 'Next' : 'Say it';
    await tap('Say it');
    expect(
      await until(() => {
        const now = host.querySelector('[data-testid="summary"]');
        return now !== null && now !== before && button(then) !== undefined;
      }),
    ).toBe(true);
  };
  /** The passage's recalls on the device's disk. */
  const passageRecalls = () =>
    heldOn(device.disk).filter((recall) => recall.reference === passage.reference);
  /**
   * A new plan at the passage's due: `Next` when it shows, the clock set to
   * the due, and a tap on the Minutes radio checked, which makes the plan
   * again (and writes the minutes it shows); Today then offers Say it on the
   * passage with no result. Answers the writes it made.
   */
  const renew = async () => {
    const sets = device.calls.set;
    if (button('Next') !== undefined) await tap('Next');
    toDue(time, passageRecalls());
    const checkedMinutes = host
      .querySelector('[role="radiogroup"][aria-label="Minutes"] [aria-checked="true"]')
      ?.getAttribute('aria-label');
    await tap(checkedMinutes ?? '5 min');
    taps.minutes += 1;
    expect(
      await until(
        () =>
          button('Say it') !== undefined &&
          host.querySelector('[data-testid="summary"]') === null &&
          device.calls.set === sets + 1,
      ),
    ).toBe(true);
    return device.calls.set - sets;
  };
  /** The device's whole disk and its write, remove and clear counts. */
  const stored = () => ({
    disk: [...device.disk],
    set: device.calls.set,
    remove: device.calls.remove,
    clear: device.calls.clear,
  });
  /** Runs a field-only transition to `heading` and holds the device as it was across it, a moment past its frame included. */
  const still = async (label: string, heading: string) => {
    const before = stored();
    await tap(label);
    expect(await until(() => headings().includes(heading))).toBe(true);
    await until(() => false, 8);
    expect({ through: label, ...stored() }).toEqual({ through: label, ...before });
  };
  /** Today's action button as it shows: `Say it` or `Next`, none in the done state. */
  const action = () => ['Say it', 'Next'].find((label) => button(label) !== undefined) ?? 'none';
  /** The action Today showed when `Your field` last left it; none before the launch's first Today. */
  const left = { action: 'none' };
  /** Opens the field from Today by `Your field` and reads it whole; the device takes no write, remove or clear, and keeps its disk. */
  const field = async () => {
    left.action = action();
    await still('Your field', 'Your field');
    return readField(host);
  };
  /** Home read whole, as it shows now. */
  const onHome = () => readField(host);
  /** Goes from home to Today by `Begin`; the device takes no write, remove or clear, and keeps its disk. */
  const begin = () => still('Begin', 'Today');
  /**
   * Goes back to Today by `Begin`, which home offers because Today showed an
   * action (`Say it` or `Next`) when `Your field` left it; Today shows that
   * action again. The device takes no write, remove or clear, and keeps its disk.
   */
  const back = async () => {
    expect({ left: left.action, begin: button('Begin') !== undefined }).toEqual({
      left: left.action === 'none' ? '<Say it or Next>' : left.action,
      begin: true,
    });
    await begin();
    expect({ back: action() }).toEqual({ back: left.action });
  };
  /** What the disk shows wrong against the launch's: a key removed, a key other than the passage's recalls (and the minutes, once a Minutes radio was tapped) changed or added, or a passage recall that is not one. */
  const diskFaults = () => {
    const own = `${PREFIX}${passage.reference}/`;
    const tapped = (key: string) => key === MINUTES_KEY && taps.minutes > 0;
    const out: string[] = [];
    for (const [key, value] of fixed) {
      if (!device.disk.has(key)) out.push('a key removed');
      else if (!key.startsWith(own) && !tapped(key) && device.disk.get(key) !== value)
        out.push('a key changed');
    }
    for (const [key, value] of device.disk) {
      if (fixed.has(key) || tapped(key)) continue;
      const recall = heldOn(new Map([[key, value]]))[0];
      if (!key.startsWith(own) || recall?.reference !== passage.reference)
        out.push('a key added that is no recall of the passage');
    }
    return out;
  };
  /** The lowest contrast among the seen text of the field's readouts: the days sown, the harvest, the row titles, the plants' verse numbers and the furrows' ripe counts. */
  const readouts = () => {
    const lowest = (id: string) =>
      Math.min(
        ...[...host.querySelectorAll(`[data-testid="${id}"], [data-testid="${id}"] *`)]
          .filter((node) => node.children.length === 0 && text(node) !== '' && seen(node))
          .map(contrastOf),
      );
    return {
      sown: lowest('sown'),
      harvest: lowest('harvest'),
      titles: lowest('row-title'),
      numbers: lowest('field-plant'),
      ripe: lowest('ripe'),
    };
  };
  /** Ends the launch, and answers what its disk shows wrong against the launch's start (`diskFaults`). */
  const leave = async () => {
    watch.disconnect();
    await act(async () => root.unmount());
    host.remove();
    return diskFaults();
  };
  return {
    faults,
    frames,
    headings,
    buttons,
    control,
    until,
    tap,
    say,
    renew,
    home,
    onHome,
    field,
    begin,
    back,
    summary,
    checked,
    stage,
    readouts,
    leave,
  };
};
