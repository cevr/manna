import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import type { Page } from '@playwright/test';

import type * as ServerEntry from './fixtures/mix-server.tsx';
import { buildServer, harness, logOf, type ServerBuild } from './harness.ts';

const h = harness('mix.tsx');

let build: ServerBuild<typeof ServerEntry>;
let server: typeof ServerEntry;

beforeAll(async () => {
  build = await buildServer(`${import.meta.dir}/fixtures/mix-server.tsx`);
  server = build.module;
});

afterAll(async () => {
  await build.dispose();
});

/** The markers Solid's server build adds for hydration: not attributes a mixin gives. */
const HYDRATION_MARKERS = ['_hk', 'data-hk'];

/** Each element's attributes, `style` as the browser serializes the declarations it parsed. */
const attributesIn = (
  page: Page,
  html: string | null,
  ids: ReadonlyArray<string>,
): Promise<Record<string, Record<string, string>>> =>
  page.evaluate(
    ([markup, wanted, markers]) => {
      let root: ParentNode = document;
      if (markup !== null) {
        const template = document.createElement('template');
        template.innerHTML = markup;
        root = template.content;
      }
      const out: Record<string, Record<string, string>> = {};
      for (const id of wanted) {
        const el = root.querySelector<HTMLElement>(`#${id}`);
        const attributes: Record<string, string> = {};
        for (const attribute of Array.from(el?.attributes ?? [])) {
          if (!markers.includes(attribute.name)) {
            attributes[attribute.name] =
              attribute.name === 'style' ? el!.style.cssText : attribute.value;
          }
        }
        out[id] = attributes;
      }
      return out;
    },
    [html, ids, HYDRATION_MARKERS] as const,
  );

describe('mix server-render parity', () => {
  it("renders a prop mixin's attributes the same on the server as in the browser", async () => {
    const page = await h.open('parity');
    const { html } = server.render();
    const client = await attributesIn(page, null, ['parity', 'one', 'two']);
    const served = await attributesIn(page, html, ['parity', 'one', 'two']);
    expect(served['parity']).toEqual(client['parity']);
    expect(client['parity']).toEqual({
      id: 'parity',
      role: 'switch',
      tabindex: '0',
      'aria-checked': 'true',
      'data-on': '',
      'aria-label': 'parity',
      title: 'right',
      'data-caller': 'yes',
      class: 'caller base',
      style: 'color: red; margin: 1px;',
    });
    for (const id of ['one', 'two']) {
      expect(served[id]).toEqual(client[id]);
    }
    expect(client['one']).toEqual({
      id: 'one',
      type: 'button',
      'aria-pressed': 'false',
      tabindex: '-1',
    });
    expect(client['two']).toEqual({
      id: 'two',
      type: 'button',
      'aria-pressed': 'true',
      'data-pressed': '',
      tabindex: '0',
    });
  });

  it('makes the ref factories on both sides, and calls and sets them up in the browser alone', async () => {
    const page = await h.open('parity');
    expect(server.render().reported).toEqual(['made']);
    expect(await logOf(page)).toEqual(['made', 'ref parity', 'setup parity']);
  });
});
