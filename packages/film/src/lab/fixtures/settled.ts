import { Predicate, Schema } from 'effect';
import type { Tab } from './tab.ts';

type Read =
  | { readonly _tag: 'Text' }
  | { readonly _tag: 'Value' }
  | { readonly _tag: 'Attribute'; readonly name: string }
  | { readonly _tag: 'Count' };

type Want =
  | { readonly _tag: 'Is'; readonly value: string | number }
  | { readonly _tag: 'Matches'; readonly source: string; readonly flags: string }
  | { readonly _tag: 'Has'; readonly value: string }
  | { readonly _tag: 'List'; readonly values: ReadonlyArray<string> };

interface Probe {
  readonly selector: string;
  readonly read: Read;
  readonly want: Want;
}

const LOOK = `((p) => {
  const els = Array.from(document.querySelectorAll(p.selector));
  const one = (el) =>
    p.read._tag === 'Text' ? el.textContent ?? ''
    : p.read._tag === 'Value' ? el.value
    : el.getAttribute(p.read.name);
  if (p.read._tag === 'Count') return { now: els.length, settled: els.length === p.want.value };
  const all = els.map(one);
  const first = all.length > 0 ? all[0] : null;
  switch (p.want._tag) {
    case 'Is': return { now: first, settled: first === p.want.value };
    case 'Matches': return { now: first, settled: first !== null && new RegExp(p.want.source, p.want.flags).test(first) };
    case 'Has': return { now: all, settled: all.some((t) => (t ?? '').includes(p.want.value)) };
    case 'List': return { now: all, settled: JSON.stringify(all) === JSON.stringify(p.want.values) };
  }
})`;

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const lookIn = (probe: Probe, field: 'now' | 'settled') => `${LOOK}(${json(probe)}).${field}`;

const waitOr = (
  page: Tab,
  check: { readonly settled: string; readonly now: string },
  failure: (now: string) => string,
) => page.until(check.settled, { now: check.now, say: failure });

const settle = (page: Tab, probe: Probe) =>
  waitOr(
    page,
    { settled: lookIn(probe, 'settled'), now: lookIn(probe, 'now') },
    (now) => `${probe.selector} never settled: wanted ${json(probe.want)}, last read ${now}`,
  );

const TEXT: Read = { _tag: 'Text' };

const wantOf = (want: string | RegExp): Want => {
  if (Predicate.isString(want)) return { _tag: 'Is', value: want };
  return { _tag: 'Matches', source: want.source, flags: want.flags };
};

export const textIs = (page: Tab, selector: string, want: string | RegExp) =>
  settle(page, { selector, read: TEXT, want: wantOf(want) });

export const textHas = (page: Tab, selector: string, part: string) =>
  settle(page, { selector, read: TEXT, want: { _tag: 'Has', value: part } });

export const countIs = (page: Tab, selector: string, n: number) =>
  settle(page, { selector, read: { _tag: 'Count' }, want: { _tag: 'Is', value: n } });

export const waitFor = (page: Tab, selector: string) => page.waitFor(selector);

type Answer = boolean | number | string | ReadonlyArray<boolean | number | string>;

export const evaluates = (page: Tab, script: string, want: Answer) =>
  waitOr(
    page,
    { settled: `JSON.stringify(${script}) === ${json(json(want))}`, now: script },
    (now) => `${script} never answered ${json(want)}: last answered ${now}`,
  );

export const until = (page: Tab, check: string) => page.until(check);

export const FOCUS_SHOWN = `((el) => el === null || el === document.body ? 'none' : getComputedStyle(el).outlineStyle === 'none' && getComputedStyle(el).boxShadow === ((probe) => { probe.style.boxShadow = 'var(--focus-ring)'; el.parentElement.append(probe); const ring = getComputedStyle(probe).boxShadow; probe.remove(); return ring; })(document.createElement('i')) ? 'ring' : 'outline')(document.activeElement)`;
