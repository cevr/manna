/* oxlint-disable effect/noNodeBuiltinImport, effect/noGlobals, effect/noTernary, effect/noNullish -- the ports' Contract files are read off disk as text, as the agent's `layout` reply names their testIds; a row has a band or none, and a testId is quoted or a template. */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AppName } from '../src/model.ts';
import { ROWS } from './index.ts';

const PORTS: Readonly<Record<AppName, string>> = {
  heartseed: join(import.meta.dir, '../../../apps/heartseed-exact'),
  hymnal: join(import.meta.dir, '../../../apps/hymnal-exact'),
};

const escape = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * The `testId`s a port's Contract files give its nodes: each quoted name,
 * and each template as a pattern whose `${…}` parts stand for any text
 * after its literal head. A testId set by a bare expression, or a template
 * that opens on one (`${name}-${value}` matches any hyphened name), names
 * nothing a row can rely on, so it is left out.
 */
const testIdsOf = (app: AppName) => {
  const files = [
    'app.contract',
    ...new Bun.Glob('features/*.contract').scanSync({ cwd: PORTS[app] }),
  ];
  const found = files.flatMap((file) => [
    ...readFileSync(join(PORTS[app], file), 'utf8').matchAll(
      /testId=(?:"([^"]*)"|`([^`$][^`]*)`)/gu,
    ),
  ]);
  return {
    names: new Set(found.flatMap(([, quoted]) => (quoted === undefined ? [] : [quoted]))),
    templates: found.flatMap(([, , template]) =>
      template === undefined
        ? []
        : [
            new RegExp(
              `^${template
                .split(/\$\{[^}]*\}/u)
                .map(escape)
                .join('.+')}$`,
              'u',
            ),
          ],
    ),
  };
};

describe('the port band edges', () => {
  test("every band edge a row names is a testId of its app's contracts, so the agent's replies hold it; a foot is one fixed node, named outright", () => {
    const missing = (['heartseed', 'hymnal'] as const).flatMap((app) => {
      const { names, templates } = testIdsOf(app);
      return ROWS[app].flatMap((row) => {
        const band = row.exact?.band;
        if (band === undefined) return [];
        const top = names.has(band.top) || templates.some((each) => each.test(band.top));
        return [
          ...(top ? [] : [`${app}/${row.id}: top ${band.top}`]),
          ...(names.has(band.bottom) ? [] : [`${app}/${row.id}: bottom ${band.bottom}`]),
        ];
      });
    });
    expect(missing).toEqual([]);
  });
});
