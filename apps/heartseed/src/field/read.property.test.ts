/* oxlint-disable effect/noNullish, effect/noTernary, effect/noGlobals, effect/noTryCatch, effect/noAsyncFunction -- the generated DOM model owns plain mutable trees and happy-dom style/scheme state; try/finally releases that boundary even when an assertion throws, including the mounted rig's promise-based lifetime. */

import { expect, test } from 'bun:test';
import passage from 'virtual:heartseed-passage';

import { theme } from '../theme';
import { contrastOf } from '../test/contrast';
import { fieldReadModel, readoutsModel, contrastModel } from '../test/field-read-model';
import { mount, record, readField, readoutsOf } from '../test/field-rig';
import { recallOf } from '../test/field-model';
import { START } from '../test/clock';
import { device } from '../test/one';
import { setSystem, systemScheme } from '../test/look';

interface Node {
  key: number;
  tag: string;
  attrs: Record<string, string>;
  text: string;
  children: Node[];
}
interface Model {
  tree: Node;
  css: string;
  adopted: string;
  scheme: 'light' | 'dark';
  generation: number;
}

const random = (seed: number) => {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};
const pick = <A>(next: () => number, values: readonly A[]) =>
  values[Math.floor(next() * values.length)];

/** A geometric count has no semantic depth, branching or row-count ceiling. */
const count = (next: () => number) => {
  let n = 0;
  while (next() < 0.5) n += 1;
  return n;
};
const nodesOf = (node: Node): Node[] => [node, ...node.children.flatMap(nodesOf)];
const factory = () => {
  let key = 0;
  return (id = '', text = '', tag = 'div'): Node => ({
    key: key++,
    tag,
    text,
    attrs: id === '' ? {} : { 'data-testid': id },
    children: [],
  });
};
const declarations = [
  '',
  'display:none',
  'display:block',
  'display:initial',
  'visibility:hidden',
  'visibility:visible',
  'visibility:inherit',
  'opacity:0',
  'opacity:0.25',
  'opacity:1',
  'color:transparent',
  'color:rgba(13,27,49,0.00)',
  'color:rgba(13,27,49,0.4)',
  'color:inherit',
  'color:initial',
  'color:unset',
  'color:#123456',
  'color:hsl(120,50%,25%)',
  'background-color:transparent',
  'background-color:rgba(255,255,255,0)',
  'background-color:rgba(255,255,255,0.5)',
  'background-color:rgb(0,0,0)',
  'background-color:inherit',
  'display:inline;--probe:"|/>\\\"";color:rgb(255,255,255)',
] as const;
const contexts = [
  '.ink { color:rgb(0,0,0) } .faint { color:rgb(255,255,255) }',
  '[aria-disabled="true"] { color:transparent } #probe { opacity:0 }',
  'section > div span { color:rgb(255,255,255) }',
  'div + span { color:transparent } div ~ p { visibility:hidden }',
  'div:nth-child(2) { color:transparent } span:first-child { opacity:0 }',
  'section { --ink:rgb(255,255,255) } .ink { color:var(--ink) }',
  '@media (prefers-color-scheme:dark) { span { color:transparent } }',
  'span:hover { color:transparent } span::before { content:"9" }',
  'span { color:rgb(255,255,255) } div { color:rgb(0,0,0) }',
] as const;

const declaration = (next: () => number) => {
  const rgb = Array.from({ length: 3 }, () => Math.floor(next() * 256)).join(',');
  const color =
    pick(next, [
      `rgba(${rgb},${next()})`,
      `hsla(${next() * 360},${next() * 100}%,${next() * 100}%,${next()})`,
      `#${Math.floor(next() * 0x1000000)
        .toString(16)
        .padStart(6, '0')}`,
      'transparent',
      'inherit',
      'initial',
      'unset',
      'currentColor',
      'var(--ink)',
    ]) ?? 'transparent';
  return (
    pick(next, [
      `color:${color}`,
      `background-color:${color}`,
      `opacity:${next()}`,
      `display:${pick(next, ['none', 'block', 'inline', 'inherit', 'initial', 'unset'])}`,
      `visibility:${pick(next, ['visible', 'hidden', 'inherit', 'initial', 'unset'])}`,
    ]) ?? ''
  );
};

const plantOf = (node: ReturnType<typeof factory>, n: number, p: number) => {
  const plant = node('field-plant');
  plant.attrs['role'] = 'button';
  const stage = ['not planted', 'seed', 'blade', 'ear', 'full corn'][(n + p) % 5] ?? 'seed';
  plant.attrs['aria-label'] = `Isaiah 41:${10 + p}, ${stage}, ready today`;
  if ((n + p) % 11 === 10) delete plant.attrs['aria-label'];
  const soil = stage === 'not planted';
  const drawing = node(soil ? 'plant-soil' : '', '', soil ? 'div' : 'img');
  drawing.attrs = soil
    ? {
        'data-testid': 'plant-soil',
        'aria-hidden': 'true',
        style: `background-color:${theme.light.soil}`,
      }
    : {
        'aria-hidden': 'true',
        src: `/assets/home/${stage === 'full corn' ? 'corn' : stage}-light.png`,
      };
  const number = node('', String(10 + p), 'span');
  number.attrs['aria-hidden'] = 'true';
  plant.children.push(drawing, number);
  if ((n + p) % 9 === 6) drawing.attrs['aria-hidden'] = 'false';
  if ((n + p) % 9 === 7) drawing.attrs['src'] = '/assets/home/ear-dark.png';
  if ((n + p) % 9 === 8) plant.children.push(node('', '', 'img'));
  return plant;
};

const make = (next: () => number, rows: number): Model => {
  const node = factory();
  const tree = node('', '', 'section');
  tree.attrs['style'] = 'color:rgb(0,0,0);background-color:rgb(255,255,255)';
  const host = node('host');
  tree.children.push(host);
  host.children.push(
    node('sown', `${count(next)} days sown`, 'span'),
    node('harvest', '0 verses at full corn', 'span'),
  );
  for (let n = 0; n < rows; n += 1) {
    const row = node('row');
    const title = node(
      'row-title',
      n % 2 === 0 ? 'Isaiah 41:10' : `Row ${n}`,
      pick(next, ['span', 'div', 'p']),
    );
    title.attrs['class'] = 'ink';
    row.children.push(title, node('ripe', '0 of 1 ripe', 'span'));
    const icon = node('furrow-icon');
    const image = node('', '', 'img');
    image.attrs = { src: '/assets/home/bow-light.png', 'aria-hidden': 'true' };
    icon.children.push(image);
    row.children.push(icon);
    const plants = 1 + count(next);
    for (let p = 0; p < plants; p += 1) row.children.push(plantOf(node, n, p));
    let branch = row;
    for (let depth = count(next); depth > 0; depth -= 1) {
      const parent = node('', '', pick(next, ['div', 'section', 'article']));
      parent.children.push(branch);
      branch = parent;
    }
    host.children.push(branch);
  }
  return { tree, css: contexts[0], adopted: '', scheme: 'light', generation: 0 };
};

/** The projector preserves element identities until the model replaces a tag or mount. */
const projection = () => {
  let elements = new Map<number, Element>();
  let generation = -1;
  const sheet = document.createElement('style');
  document.head.append(sheet);
  const previous = [...document.adoptedStyleSheets];
  const adopted = new window.CSSStyleSheet();
  let root: Element | undefined;
  const sync = (model: Model) => {
    if (generation !== model.generation) {
      root?.remove();
      elements = new Map();
      generation = model.generation;
    }
    sheet.textContent = model.css;
    adopted.replaceSync(model.adopted);
    document.adoptedStyleSheets = [...previous, adopted];
    setSystem(model.scheme);
    const project = (node: Node): Element => {
      let element = elements.get(node.key);
      if (element === undefined || element.tagName.toLowerCase() !== node.tag) {
        const replacement = document.createElement(node.tag);
        element?.replaceWith(replacement);
        element = replacement;
        elements.set(node.key, element);
      }
      for (const attr of [...element.attributes])
        if (!(attr.name in node.attrs)) element.removeAttribute(attr.name);
      for (const [name, value] of Object.entries(node.attrs)) element.setAttribute(name, value);
      if (node.children.length === 0) element.textContent = node.text;
      else element.replaceChildren(...node.children.map(project));
      return element;
    };
    root = project(model.tree);
    document.body.append(root);
    return root.querySelector('[data-testid="host"]') ?? root;
  };
  return {
    sync,
    close: () => {
      root?.remove();
      sheet.remove();
      document.adoptedStyleSheets = previous;
    },
  };
};

const observe = (model: Model, host: Element, label: string) => {
  const before = { model: JSON.stringify(model), dom: host.parentElement?.outerHTML };
  const expected = { field: fieldReadModel(host), readouts: readoutsModel(host) };
  for (let n = 0; n < 2; n += 1) {
    expect({ label, field: readField(host), readouts: readoutsOf(host) }).toEqual({
      label,
      ...expected,
    });
    const text = host.querySelector('span') ?? host;
    expect(contrastOf(text), `${label}: default contrast`).toBe(contrastModel(text));
  }
  expect(
    { model: JSON.stringify(model), dom: host.parentElement?.outerHTML },
    `${label}: read only`,
  ).toEqual(before);
};

const commands = [
  'repeat',
  'own-style',
  'ancestor-style',
  'own-class',
  'ancestor-class',
  'tag',
  'reparent',
  'add',
  'remove',
  'reorder',
  'text',
  'aria-hidden',
  'role',
  'testid',
  'sheet-insert',
  'sheet-replace',
  'sheet-delete',
  'scheme',
  'remount',
] as const;

interface CommandContext {
  model: Model;
  next: () => number;
  all: Node[];
  own: Node;
  ancestor: Node;
  style: string;
}

const changes: Record<(typeof commands)[number], (context: CommandContext) => void> = {
  repeat: () => {},
  'own-style': ({ own, style }) => {
    own.attrs['style'] = style;
  },
  'ancestor-style': ({ ancestor, style }) => {
    ancestor.attrs['style'] = style;
  },
  'own-class': ({ own, next }) => {
    own.attrs['class'] = pick(next, ['ink', 'faint', 'ink faint', 'a|b/c>d', '']) ?? '';
  },
  'ancestor-class': ({ ancestor, next }) => {
    ancestor.attrs['class'] = pick(next, ['ink', 'faint', '']) ?? '';
  },
  tag: ({ own }) => {
    own.tag = own.tag === 'span' ? 'div' : 'span';
  },
  reparent: ({ all, own, ancestor }) => {
    const leaf = all.find((node) => node.children.length === 0 && node !== own);
    if (leaf !== undefined) {
      for (const node of all) node.children = node.children.filter((child) => child !== leaf);
      ancestor.children.push(leaf);
    }
  },
  add: ({ ancestor, all }) => {
    ancestor.children.push({
      key: Math.max(...all.map((n) => n.key)) + 1,
      tag: 'span',
      attrs: { 'data-testid': 'counts' },
      text: '9',
      children: [],
    });
  },
  remove: ({ ancestor, next }) => {
    ancestor.children.splice(Math.floor(next() * ancestor.children.length), 1);
  },
  reorder: ({ ancestor }) => {
    ancestor.children.reverse();
  },
  text: ({ own, next }) => {
    own.text = pick(next, ['', '9', 'Mark 4:28', ' Row\t7 ']) ?? '';
  },
  'aria-hidden': ({ own, next }) => {
    own.attrs['aria-hidden'] = pick(next, ['true', 'false', '']) ?? '';
  },
  role: ({ own, next }) => {
    own.attrs['role'] = pick(next, ['button', 'img', 'text', '']) ?? '';
  },
  testid: ({ own, next }) => {
    own.attrs['data-testid'] =
      pick(next, ['sown', 'row-title', 'field-plant', 'ripe', 'counts', 'x|/>']) ?? '';
  },
  'sheet-insert': ({ model, next }) => {
    model.css += pick(next, contexts) ?? '';
  },
  'sheet-replace': ({ model, next }) => {
    model.css = pick(next, contexts) ?? '';
  },
  'sheet-delete': ({ model }) => {
    model.css = '';
  },
  scheme: ({ model }) => {
    model.scheme = model.scheme === 'light' ? 'dark' : 'light';
  },
  remount: ({ model }) => {
    model.generation += 1;
  },
};

const commandContext = (model: Model, next: () => number): CommandContext => {
  const all = nodesOf(model.tree);
  return {
    model,
    next,
    all,
    own: pick(next, all.slice(1)) ?? model.tree,
    ancestor:
      pick(
        next,
        all.filter((node) => node.children.length > 0),
      ) ?? model.tree,
    style: next() < 0.5 ? (pick(next, declarations) ?? '') : declaration(next),
  };
};

test('field reads and five minima agree with the plain oracle after every generated model command', () => {
  const covered = new Set<string>();
  let observations = 0;
  const original = systemScheme();
  try {
    for (const seed of [7, 19, 83, 211]) {
      const next = random(seed);
      const model = make(next, count(next));
      const view = projection();
      let host = view.sync(model);
      try {
        observe(model, host, `seed ${seed}: initial`);
        for (const kind of commands.toSorted(() => next() - 0.5)) {
          changes[kind](commandContext(model, next));
          covered.add(kind);
          if (kind !== 'repeat') host = view.sync(model);
          observe(model, host, `seed ${seed}: ${kind}`);
          observations += 1;
        }
      } finally {
        view.close();
      }
    }
  } finally {
    setSystem(original);
  }
  expect([...covered].sort()).toEqual([...commands].sort());
  expect(observations).toBe(76);
});

const witnesses = [
  'ancestor',
  'ancestor-opacity',
  'inline',
  'tag',
  'stylesheet-remount',
  'transparent',
  'contrast',
  'attribute',
  'siblings',
  'position',
  'custom-property',
  'media-pseudo',
  'malformed',
  'soil',
  'strays',
  'empty',
  'large',
  'atomic',
  'adopted',
  'legacy-placeholder',
] as const;

interface WitnessContext {
  model: Model;
  all: Node[];
  title: Node | undefined;
  other: Node | undefined;
  hostModel: Node;
}

const distinctions: Record<(typeof witnesses)[number], (context: WitnessContext) => void> = {
  'ancestor-opacity': ({ model }) => {
    model.tree.attrs['style'] += ';opacity:0';
  },
  ancestor: ({ model, all, title, other }) => {
    model.css = '';
    const row = all.find((node) => node.attrs['data-testid'] === 'row');
    if (row) row.attrs['style'] = 'color:transparent';
    if (title && other) {
      title.attrs['class'] = '';
      other.attrs['class'] = '';
      title.tag = 'span';
      other.tag = 'span';
    }
  },
  inline: ({ title, other }) => {
    if (title) {
      title.tag = 'span';
      title.attrs['style'] = 'display:none';
    }
    if (other) other.tag = 'span';
  },
  tag: ({ model, title, other }) => {
    model.css = 'span { color:transparent } div { color:rgb(0,0,0) }';
    if (title && other) {
      title.tag = 'span';
      other.tag = 'div';
    }
  },
  'stylesheet-remount': ({ model }) => {
    model.css = '.ink { color:rgb(255,255,255) }';
    model.generation += 1;
  },
  transparent: ({ title }) => {
    if (title) title.attrs['style'] = 'color:rgba(0,0,0,0.00)';
  },
  contrast: ({ title }) => {
    if (title) title.attrs['style'] = 'color:rgb(119,119,119)';
  },
  attribute: ({ model, title, other }) => {
    model.css = '[aria-disabled="true"] { color:transparent } #probe { color:rgb(255,255,255) }';
    if (title) title.attrs['aria-disabled'] = 'true';
    if (other) other.attrs['id'] = 'probe';
  },
  siblings: ({ model }) => {
    model.css =
      '[data-testid="furrow-icon"] + [data-testid="field-plant"] span { color:transparent }';
  },
  position: ({ model }) => {
    model.css = '[data-testid="row"]:nth-child(3) [data-testid="row-title"] { color:transparent }';
  },
  'custom-property': ({ model }) => {
    model.css = 'section { --ink:rgb(255,255,255) } .ink { color:var(--ink) }';
  },
  'media-pseudo': ({ model }) => {
    model.css = contexts[6] + contexts[7];
    model.scheme = 'dark';
  },
  malformed: ({ all, title }) => {
    const row = all.find((node) => node.attrs['data-testid'] === 'row');
    if (row && title) row.children.push({ ...title, key: 9999, attrs: { ...title.attrs } });
    const sown = all.find((node) => node.attrs['data-testid'] === 'sown');
    if (sown) sown.attrs['aria-label'] = 'different';
    for (const node of all) if (node.tag === 'img') node.attrs['aria-hidden'] = 'false';
  },
  soil: ({ all }) => {
    for (const node of all)
      if (node.tag === 'img') {
        node.tag = 'div';
        node.attrs = {
          'data-testid': 'plant-soil',
          'aria-hidden': 'true',
          style: `background-color:${theme.light.soil}`,
        };
      }
  },
  strays: ({ hostModel }) => {
    hostModel.children.push({
      key: 9999,
      tag: 'span',
      text: '99',
      attrs: { role: 'img' },
      children: [],
    });
  },
  empty: ({ hostModel }) => {
    hostModel.children = [];
  },
  large: ({ model }) => {
    model.tree.attrs['style'] = 'color:rgba(0,0,0,0.5);background-color:transparent';
  },
  atomic: ({ all }) => {
    const classes = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .flatMap((rule) => {
        const name = /^\.(r-[\w-]+)\s*\{/.exec(rule.cssText)?.[1];
        return name === undefined ? [] : [name];
      });
    expect(classes.length).toBeGreaterThan(0);
    for (const node of all) node.attrs['class'] = pick(random(node.key + 3), classes) ?? '';
  },
  adopted: ({ model }) => {
    model.adopted =
      '[data-testid="row"]:nth-child(3) [data-testid="row-title"] { color:transparent }';
  },
  'legacy-placeholder': ({ model }) => {
    model.css = '.ink:-ms-input-placeholder { color:var(--ink);opacity:0 }';
  },
};

const assertWitness = (witness: string, host: Element, old: ReturnType<typeof readField>) => {
  const got = readField(host);
  if (['ancestor', 'ancestor-opacity', 'inline', 'transparent'].includes(witness))
    expect(got.rows[0]?.title, witness).toBe('<title not one seen and exposed>');
  if (witness === 'contrast' || witness === 'stylesheet-remount')
    expect(got.faint).toContain('row-title');
  if (witness === 'strays') expect(got.strays).toBe(old.strays + 1);
  if (witness === 'empty')
    expect(readoutsOf(host)).toEqual({
      sown: Infinity,
      harvest: Infinity,
      titles: Infinity,
      numbers: Infinity,
      ripe: Infinity,
    });
  if (witness === 'malformed') {
    expect(got.rows[0]?.title).toBe('<title not one seen and exposed>');
    expect(got.sown).toBe('<sown not seen as exposed>');
    expect(got.rows[0]?.icon).toBe('<an exposed icon>');
  }
};

for (const witness of witnesses) {
  test(`field reader distinction: ${witness}`, () => {
    const model = make(random(29), witness === 'empty' ? 0 : witness === 'large' ? 24 : 2);
    const hostModel = model.tree.children[0];
    expect(hostModel).toBeDefined();
    if (hostModel === undefined) return;
    hostModel.children = [
      ...hostModel.children.filter((node) =>
        ['sown', 'harvest'].includes(node.attrs['data-testid'] ?? ''),
      ),
      ...nodesOf(hostModel).filter((node) => node.attrs['data-testid'] === 'row'),
    ];
    const all = nodesOf(model.tree);
    const titles = all.filter((node) => node.attrs['data-testid'] === 'row-title');
    const title = titles[0];
    const other = titles[1];
    const view = projection();
    const original = systemScheme();
    try {
      const before = view.sync(model);
      observe(model, before, `${witness}: before`);
      const old = readField(before);
      distinctions[witness]({ model, all, title, other, hostModel });
      const host = view.sync(model);
      observe(model, host, `${witness}: after`);
      assertWitness(witness, host, old);
    } finally {
      view.close();
      setSystem(original);
    }
  });
}

test('a malformed field mutation is read and its frame fault is retained', async () => {
  const disk = new Map(device.disk);
  device.launch([record(recallOf(passage.reference, START - 86_400_000, 3, 0))]);
  const app = await mount(true);
  try {
    expect(await app.until(app.home)).toBe(true);
    expect(app.faults).toEqual([]);
    const frames = app.frames.field;
    const title = document.querySelector('[data-testid="row-title"]');
    expect(title).not.toBeNull();
    title?.remove();
    expect(await app.until(() => app.frames.field > frames)).toBe(true);
    expect(
      app.faults.some((fault) => fault.startsWith('a field frame ')),
      'the observed frame retains its reader fault',
    ).toBe(true);
  } finally {
    await app.leave();
    device.launch(disk);
  }
});
