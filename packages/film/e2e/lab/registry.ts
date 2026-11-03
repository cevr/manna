import { Effect, Exit, Option, Scope } from 'effect';
import type { Input } from '../../src/browser/keys.ts';
import { menuEntry } from '../../src/lab/fixtures/gestures.ts';
import { until, waitFor } from '../../src/lab/fixtures/settled.ts';
import type { Tab } from '../../src/lab/fixtures/tab.ts';

export const pageAfterPage = <P extends { readonly page: Tab }>(
  open: () => Effect.Effect<P, never, Scope.Scope>,
) =>
  Effect.gen(function* () {
    const parent = yield* Effect.scope;
    const opened = Effect.gen(function* () {
      const scope = yield* Scope.fork(parent);
      return { scope, page: (yield* Scope.provide(scope)(open())).page };
    });
    let now = yield* opened;
    return {
      page: () => now.page,
      again: Effect.gen(function* () {
        yield* Scope.close(now.scope, Exit.void);
        now = yield* opened;
      }),
    };
  });

export const COMMAND_MENU = '[data-role="command-menu"]';

export const registry = (page: Tab) =>
  Effect.gen(function* () {
    yield* page.press('Control+k');
    yield* waitFor(page, '.lab-command-query');
    yield* page.fill('.lab-command-query', '.');
    yield* waitFor(page, `${COMMAND_MENU} [data-command]`);
    const ids = yield* page.evaluate<ReadonlyArray<string>>(
      `[...new Set([...document.querySelectorAll('${COMMAND_MENU} [data-command]')].map((e) => e.dataset.command))]`,
    );
    yield* page.press('Escape');
    yield* until(page, `document.querySelector('${COMMAND_MENU}') === null`);
    return ids;
  });

const SAMPLED = /^(go\.[^.]+\.|studio\.mic\.)/;

export const sampled = (ids: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const family = Option.match(Option.fromNullishOr(SAMPLED.exec(id)), {
      onNone: () => id,
      onSome: ([prefix]) => prefix,
    });
    if (seen.has(family)) return false;
    seen.add(family);
    return true;
  });
};

export const runFromMenu = (page: Tab, id: string, input: Input) =>
  Effect.gen(function* () {
    const row = menuEntry(id);
    const goTo = yield* page.evaluate<boolean>(
      `document.querySelector('.sh-header [data-act="search"]') !== null`,
    );
    if (input === 'key' || !goTo) yield* page.press('Control+k');
    else yield* page.click('.sh-header [data-act="search"]');
    yield* waitFor(page, '.lab-command-query');
    yield* page.fill('.lab-command-query', id);
    yield* until(
      page,
      `document.querySelector('${COMMAND_MENU} [data-command]') !== null || document.querySelector('.lab-command-none') !== null`,
    );
    if (!(yield* page.evaluate<boolean>(`document.querySelector('${row}') !== null`))) {
      yield* page.press('Escape');
      yield* until(page, `document.querySelector('${COMMAND_MENU}') === null`);
      return false;
    }
    if (input === 'key') {
      const at = yield* page.evaluate<number>(
        `[...document.querySelectorAll('${COMMAND_MENU} [data-command]')].findIndex((e) => e.dataset.command === '${id}')`,
      );
      for (let i = 0; i < at; i++) yield* page.press('ArrowDown');
      yield* until(
        page,
        `document.getElementById(document.querySelector('.lab-command-query').getAttribute('aria-activedescendant'))?.dataset.command === '${id}'`,
      );
      yield* page.press('Enter');
    } else yield* page.click(row);
    yield* until(page, `document.querySelector('${COMMAND_MENU}') === null`);
    return true;
  });

export const FLOATING = '[role=dialog], [role=alertdialog], [role=menu], [role=listbox]';

export const LEFT_OPEN = `([...document.querySelectorAll('${FLOATING}')].some((e) => !e.matches('.lab-receipt') && e.checkVisibility()) || document.querySelector('[data-role="note-bar"]') !== null)`;
