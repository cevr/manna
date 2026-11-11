/* oxlint-disable effect/noNodeBuiltinImport -- the test reads the app's stack layout from disk, synchronously, outside any Effect. */

/**
 * A screen opened while a sheet is up, on React Navigation's own
 * `StackRouter` with the stack's `cardsOutOfSheets` override: a screen drawn
 * in the stack never lands over a screen drawn over it, since there it would
 * be drawn inside the sheet, over the docked bar and its `#`. Sheets and
 * modals opened over a sheet stay where they are.
 */

import { describe, expect, it } from 'bun:test';
import { CommonActions, StackActions, StackRouter } from '@react-navigation/native';
import { Option } from 'effect';
import { readFileSync } from 'node:fs';

import { cardsOutOfSheets, drawnOver, outOfSheets } from './stack';

const HYMN = 'hymns/[number]';
const routeNames = ['index', 'recent', HYMN, 'settings', 'player', 'chord', 'about', 'tuner'];
const over = new Set(['settings', 'player', 'chord', 'about', 'tuner']);
const options = { routeNames, routeParamList: {}, routeGetIdList: {} };
const plain = StackRouter({});
const router = { ...plain, ...cardsOutOfSheets(over)(plain) };

/** The stack holding `names`, the last shown, keyed by their place. */
const stackOf = (names: ReadonlyArray<string>) =>
  plain.getRehydratedState(
    { routes: names.map((name, at) => ({ key: `k${at}`, name, params: { number: String(at) } })) },
    options,
  );

type Action = Parameters<typeof router.getStateForAction>[1];

/** The stack `action` leads to from `state`, when the router handles it. */
const step = (state: ReturnType<typeof stackOf>, action: Action) =>
  Option.fromNullishOr(router.getStateForAction(state, action, options));

/** The route names of the stack `action` leads to from `names`, and the one shown. */
const after = (names: ReadonlyArray<string>, action: Action) =>
  step(stackOf(names), action).pipe(
    Option.map((next) => ({
      names: next.routes.map((route) => route.name),
      shown: Option.fromNullishOr(next.routes[next.index ?? 0]?.name),
    })),
  );

const pushHymn = StackActions.push(HYMN, { number: '100' });

describe('a screen opened while a sheet is up', () => {
  it('a hymn pushed or linked over Settings takes the sheet’s place, over the screen the sheet lay on', () => {
    expect(after(['index', HYMN, 'settings'], pushHymn)).toEqual(
      Option.some({ names: ['index', HYMN, HYMN], shown: Option.some(HYMN) }),
    );
    expect(after(['index', 'settings'], CommonActions.navigate(HYMN, { number: '100' }))).toEqual(
      Option.some({ names: ['index', HYMN], shown: Option.some(HYMN) }),
    );
    expect(after(['index', 'settings'], StackActions.push('recent'))).toEqual(
      Option.some({ names: ['index', 'recent'], shown: Option.some('recent') }),
    );
  });

  it('every sheet under the opened screen goes, and Back goes where Back from the sheets went', () => {
    const opened = step(stackOf(['index', 'about', 'chord']), pushHymn);
    expect(Option.map(opened, (next) => next.routes.map((route) => route.name))).toEqual(
      Option.some(['index', HYMN]),
    );
    const back = Option.flatMap(opened, (next) =>
      step(next as ReturnType<typeof stackOf>, CommonActions.goBack()),
    );
    expect(Option.map(back, (next) => next.routes.map((route) => route.name))).toEqual(
      Option.some(['index']),
    );
  });

  it('a sheet or the tuner opened over a sheet stays over it, and a stack with no sheet is left as it is', () => {
    expect(
      Option.map(after(['index', 'settings'], StackActions.push('tuner')), (a) => a.names),
    ).toEqual(Option.some(['index', 'settings', 'tuner']));
    expect(Option.map(after([HYMN, 'chord'], StackActions.push('about')), (a) => a.names)).toEqual(
      Option.some([HYMN, 'chord', 'about']),
    );
    const state = stackOf(['index', HYMN]);
    expect(outOfSheets(state, over)).toBe(state);
    expect(Option.map(after(['index', HYMN], pushHymn), (a) => a.names)).toEqual(
      Option.some(['index', HYMN, HYMN]),
    );
  });

  it('the app’s stack runs on this router, its sheets told apart by their presentation', () => {
    const layout = readFileSync(`${import.meta.dir}/../app/(hymnal)/_layout.tsx`, 'utf8');
    expect(layout).toContain('router={cardsOutOfSheets(over)}');
    expect(layout).toMatch(/const over = new Set\([\s\S]*?drawnOver\(options\)/);
  });

  it('the sheets are told apart by how the stack presents them', () => {
    const shown = ['formSheet', 'pageSheet', 'modal', 'transparentModal', 'fullScreenModal'];
    expect(shown.map((presentation) => drawnOver({ presentation }))).toEqual(shown.map(() => true));
    expect(drawnOver({})).toBe(false);
    expect(['card', 'containedModal'].map((presentation) => drawnOver({ presentation }))).toEqual([
      false,
      false,
    ]);
  });
});
