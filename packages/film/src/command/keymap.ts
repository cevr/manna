import { Data, Option } from 'effect';
import type { KeyPress } from '../browser/keys.ts';
import type { Command, CommandId, Invocation } from './command.ts';
import type { Context, Focus } from './context.ts';

interface Binding {
  readonly key: string;
  readonly command: CommandId;
}

const MODIFIERS = ['mod', 'alt', 'shift'] as const;
type Modifier = (typeof MODIFIERS)[number];

const MODIFIER_NAMES: ReadonlyMap<string, Modifier> = new Map([
  ['mod', 'mod'],
  ['cmd', 'mod'],
  ['meta', 'mod'],
  ['ctrl', 'mod'],
  ['alt', 'alt'],
  ['option', 'alt'],
  ['shift', 'shift'],
]);

const KEY_NAMES: ReadonlyMap<string, string> = new Map([
  [' ', 'space'],
  ['esc', 'escape'],
  ['left', 'arrowleft'],
  ['right', 'arrowright'],
  ['up', 'arrowup'],
  ['down', 'arrowdown'],
]);

const keyName = (key: string): string =>
  Option.getOrElse(Option.fromUndefinedOr(KEY_NAMES.get(key.toLowerCase())), () =>
    key.toLowerCase(),
  );

const isLetter = (name: string): boolean => name.toUpperCase() !== name.toLowerCase();

const isDigit = (name: string): boolean => name.length === 1 && name >= '0' && name <= '9';

const shiftCounts = (name: string): boolean => name.length !== 1 || isLetter(name) || isDigit(name);

const chordText = (key: string, held: ReadonlySet<Modifier>): string =>
  [...MODIFIERS.filter((m) => held.has(m) && (m !== 'shift' || shiftCounts(key))), key].join('+');

const lastKey = (parts: ReadonlyArray<string>): string =>
  Option.getOrElse(
    Option.filter(Option.fromUndefinedOr(parts.at(-1)), (p) => p !== ''),
    () => '+',
  );

const declaredKeys = (command: Command): ReadonlyArray<string> =>
  Option.getOrElse(Option.fromUndefinedOr(command.keys), () => []);

export const parseChord = (text: string): Option.Option<string> => {
  const parts = text.trim().split('+');
  const key = keyName(lastKey(parts));
  const named = parts.slice(0, -1).filter((p) => p !== '');
  const held = named.flatMap((p) =>
    Option.toArray(Option.fromUndefinedOr(MODIFIER_NAMES.get(p.toLowerCase()))),
  );
  return Option.liftPredicate(
    chordText(key, new Set(held)),
    () => held.length === named.length && key !== '',
  );
};

const pressedKey = (press: KeyPress): string =>
  Option.getOrElse(
    Option.filter(physical(press.code), (key) => press.alt || (press.shift && isDigit(key))),
    () => keyName(press.key),
  );

const physical = (code: string): Option.Option<string> =>
  Option.orElse(
    Option.liftPredicate(
      code.slice(3).toLowerCase(),
      () => code.startsWith('Key') && code.length === 4,
    ),
    () => Option.liftPredicate(code.slice(5), () => code.startsWith('Digit') && code.length === 6),
  );

const heldBy = (press: KeyPress): ReadonlySet<Modifier> =>
  new Set(
    MODIFIERS.filter(
      (m) => [press.meta || press.ctrl, press.alt, press.shift][MODIFIERS.indexOf(m)],
    ),
  );

const chordOf = (press: KeyPress): string => chordText(pressedKey(press), heldBy(press));

export const bindingsOf = (commands: ReadonlyArray<Command>): ReadonlyArray<Binding> =>
  commands.flatMap((c) =>
    declaredKeys(c).flatMap((k) =>
      Option.toArray(Option.map(parseChord(k), (key) => ({ key, command: c.id }))),
    ),
  );

export const keysOf = (bindings: ReadonlyArray<Binding>, id: CommandId): ReadonlyArray<string> =>
  bindings.filter((b) => b.command === id).map((b) => b.key);

export type Resolved = Data.TaggedEnum<{
  Run: { readonly command: Command; readonly how: Invocation };
  Owned: {};
  Pass: {};
}>;
export const Resolved = Data.taggedEnum<Resolved>();

const SCOPES: Readonly<Record<Focus, ReadonlyArray<Focus>>> = {
  page: ['page'],
  field: ['field'],
  studio: ['studio', 'page'],
  slider: ['slider', 'page'],
  control: ['page'],
};

const OWNS: ReadonlySet<Focus> = new Set<Focus>(['studio', 'slider']);

const PAGE_ONLY: ReadonlyArray<Focus> = ['page'];

const triesOf = (press: KeyPress): ReadonlyArray<readonly [string, Invocation['step']]> => {
  const key = pressedKey(press);
  const held = heldBy(press);
  const without = (m: Modifier) => new Set([...held].filter((h) => h !== m));
  return [
    [chordOf(press), 'normal'] as const,
    ...[[chordText(key, without('shift')), 'coarse'] as const].filter(() => press.shift),
    ...[[chordText(key, without('alt')), 'fine'] as const].filter(() => press.alt),
  ];
};

export const resolve = (
  press: KeyPress,
  ctx: Context,
  commands: ReadonlyArray<Command>,
  bindings: ReadonlyArray<Binding>,
): Resolved => {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const tries = triesOf(press);
  for (const scope of SCOPES[ctx.focus]) {
    const live = (c: Command) =>
      Option.getOrElse(Option.fromUndefinedOr(c.keysIn), () => PAGE_ONLY).includes(scope);
    let bound = false;
    for (const [chord, step] of tries) {
      const named = bindings
        .filter((b) => b.key === chord)
        .flatMap((b) => Option.toArray(Option.fromUndefinedOr(byId.get(b.command))))
        .filter((c) => live(c) && (step === 'normal' || c.stepped === true));
      bound = bound || named.length > 0;
      const ready = Option.fromUndefinedOr(named.filter((c) => c.when(ctx)).at(-1));
      if (Option.isSome(ready))
        return Resolved.Run({ command: ready.value, how: { step, via: 'key', input: 'key' } });
    }
    if (bound && OWNS.has(scope)) return Resolved.Owned();
  }
  return Resolved.Pass();
};

export const chordLabel = (chord: string, mac: boolean): string => {
  const parts = chord.split('+');
  const key = lastKey(parts);
  const held = new Set(parts.slice(0, -1));
  const shown = Option.getOrElse(Option.fromUndefinedOr(KEY_LABELS.get(key)), () =>
    Option.getOrElse(
      Option.liftPredicate(key.toUpperCase(), () => key.length === 1),
      () => key,
    ),
  );
  const style = STYLES[`${mac}`];
  const mods = MAC_ORDER.filter((m) => held.has(m)).map((m) => style.marks[m]);
  return [...mods, shown].join(style.between);
};

export const titleWith = (title: string, key: string): string =>
  Option.match(
    Option.liftPredicate(key, (k) => k !== ''),
    {
      onNone: () => title,
      onSome: (k) => `${title} (${k})`,
    },
  );

const KEY_LABELS: ReadonlyMap<string, string> = new Map([
  ['arrowleft', '←'],
  ['arrowright', '→'],
  ['arrowup', '↑'],
  ['arrowdown', '↓'],
  ['escape', 'Esc'],
  ['space', 'Space'],
  ['enter', 'Enter'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['tab', 'Tab'],
]);

const MAC_ORDER: ReadonlyArray<Modifier> = ['alt', 'shift', 'mod'];
const STYLES: Readonly<
  Record<
    'true' | 'false',
    { readonly marks: Readonly<Record<Modifier, string>>; readonly between: string }
  >
> = {
  true: { marks: { mod: '⌘', alt: '⌥', shift: '⇧' }, between: '' },
  false: { marks: { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' }, between: '+' },
};
