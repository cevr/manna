import { Match, Option } from 'effect';
import type { PageName } from '../core/api.ts';
import type { Selection, SelectionTag } from './selection.ts';

export type Focus = 'page' | 'field' | 'studio' | 'slider' | 'control';

export interface Context {
  readonly page: PageName;
  readonly href: string;
  readonly selection: ReadonlyArray<Selection>;
  readonly focus: Focus;
  readonly playing: boolean;
}

export const contextAt = (page: PageName, href: string): Context => ({
  page,
  href,
  selection: [],
  focus: 'page',
  playing: false,
});

export const selected = <T extends SelectionTag>(
  ctx: Context,
  tag: T,
): Option.Option<Extract<Selection, { readonly _tag: T }>> =>
  Option.filter(
    Option.fromUndefinedOr(ctx.selection[0]),
    (s): s is Extract<Selection, { readonly _tag: T }> => s._tag === tag,
  );

export const withSelection = (ctx: Context, selection: ReadonlyArray<Selection>): Context => ({
  ...ctx,
  selection,
});

export const withFocused = (ctx: Context, focused: Option.Option<Selection>): Context =>
  Option.match(
    Option.filter(focused, (f) => !ctx.selection.some((s) => s._tag === f._tag)),
    { onNone: () => ctx, onSome: (f) => withSelection(ctx, [f, ...ctx.selection]) },
  );

interface Focusable {
  readonly tagName: string;
  readonly isContentEditable?: boolean;
  closest(selector: string): unknown;
}

const focusable = (target: EventTarget): target is EventTarget & Focusable =>
  'tagName' in target && 'closest' in target;

const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'AUDIO', 'VIDEO']);

const OVERLAYS =
  ':is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]):not([data-ending-style], [data-closed])';

const STUDIO = '[data-role="studio"]';

const SLIDER = '[role="slider"]';

const CONTROLS = new Set(['BUTTON', 'A', 'SUMMARY']);

const within = (el: Focusable, selector: string): boolean =>
  Option.isSome(Option.fromNullishOr(el.closest(selector)));

const typedInto = (el: Focusable): boolean =>
  FIELDS.has(el.tagName) || el.isContentEditable === true;

export const isField = (target: Option.Option<EventTarget>): boolean =>
  Option.exists(Option.filter(target, focusable), typedInto);

export const focusOf = (target: Option.Option<EventTarget>): Focus =>
  Option.match(Option.filter(target, focusable), {
    onNone: (): Focus => 'page',
    onSome: (el): Focus =>
      Match.value(el).pipe(
        Match.when(typedInto, (): Focus => 'field'),
        Match.when(
          (e) => within(e, STUDIO),
          (): Focus => 'studio',
        ),
        Match.when(
          (e) => within(e, OVERLAYS),
          (): Focus => 'field',
        ),
        Match.when(
          (e) => within(e, SLIDER),
          (): Focus => 'slider',
        ),
        Match.when(
          (e) => CONTROLS.has(e.tagName),
          (): Focus => 'control',
        ),
        Match.orElse((): Focus => 'page'),
      ),
  });
