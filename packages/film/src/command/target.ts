import { Option, Predicate, Schema } from 'effect';
import { Selection, type SelectionTag } from './selection.ts';

export type Target = SelectionTag | 'Page';

export const EVERYWHERE: ReadonlyArray<Target> = [
  ...Object.keys(Selection.cases).filter((tag): tag is SelectionTag => tag in Selection.cases),
  'Page',
];

const SelectionJson = Schema.fromJsonString(Selection);

const TARGET_ATTR = 'data-target';

export const targetAttr = (selection: Selection): string =>
  Schema.encodeSync(SelectionJson)(selection);

interface Markable {
  closest(selector: string): unknown;
}

const markable = (target: EventTarget): target is EventTarget & Markable => 'closest' in target;

const attributeOf = (el: { readonly getAttribute: unknown }): Option.Option<unknown> =>
  Option.flatMap(Option.liftPredicate(el.getAttribute, Predicate.isFunction), (read) =>
    Option.fromNullishOr(Reflect.apply(read, el, [TARGET_ATTR])),
  );

export const targetAt = (target: Option.Option<EventTarget>): Option.Option<Selection> =>
  Option.filter(target, markable).pipe(
    Option.map((el) => el.closest(`[${TARGET_ATTR}]`)),
    Option.filter(Predicate.hasProperty('getAttribute')),
    Option.flatMap(attributeOf),
    Option.flatMap(Schema.decodeUnknownOption(SelectionJson)),
  );

export const targetOf = (selection: Option.Option<Selection>): Target =>
  Option.match(selection, { onNone: (): Target => 'Page', onSome: (s): Target => s._tag });
