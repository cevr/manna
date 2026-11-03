import { describe, expect, it } from 'bun:test';
import { RegistryProvider } from '@effect/atom-react';
import { Array as Arr, Data, Option } from 'effect';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { propsWith } from '../test/props';

import { TunerScreen } from './Tuner';
import type { StringId } from './tuning';

const IDS: ReadonlyArray<StringId> = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

const HINT = 'Goes back to Auto';

const LOWEST: StringId = 'E2';

type Press = Data.TaggedEnum<{
  Tap: { readonly id: StringId };
  Switch: {};
}>;
const Press = Data.taggedEnum<Press>();

const PRESSES: ReadonlyArray<Press> = [Press.Switch(), ...IDS.map((id) => Press.Tap({ id }))];

const after = (target: Option.Option<StringId>, press: Press): Option.Option<StringId> =>
  Press.$match(press, {
    Tap: ({ id }) => {
      if (Option.contains(target, id)) return Option.none();
      return Option.some(id);
    },
    Switch: () => {
      if (Option.isSome(target)) return Option.none();
      return Option.some(LOWEST);
    },
  });

const nameOf = (target: Option.Option<StringId>) => Option.getOrElse(target, () => 'Auto');

const pressName = (press: Press) =>
  Press.$match(press, { Tap: ({ id }) => `tap ${id}`, Switch: () => 'switch' });

const mount = () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  act(() =>
    root.render(
      <RegistryProvider>
        <TunerScreen />
      </RegistryProvider>,
    ),
  );
  return {
    host,
    [Symbol.dispose]: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const byTestId = (host: HTMLElement, id: string) =>
  Option.getOrThrow(Option.fromNullishOr(host.querySelector(`[data-testid="${id}"]`)));

const circle = (host: HTMLElement, id: StringId) => byTestId(host, `tuner-string-${id}`);

const click = (element: Element) =>
  act(
    () =>
      void element.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      ),
  );

const press = (host: HTMLElement, each: Press) =>
  Press.$match(each, {
    Tap: ({ id }) => click(circle(host, id)),
    Switch: () => click(byTestId(host, 'tuner-auto')),
  });

const hintOf = (element: Element): Option.Option<unknown> =>
  Option.liftThrowable(() => propsWith(element, 'accessibilityHint')['accessibilityHint'])();

const shown = (host: HTMLElement) => ({
  selected: IDS.filter((id) => circle(host, id).getAttribute('aria-selected') === 'true'),
  auto: byTestId(host, 'tuner-auto').getAttribute('aria-checked') === 'true',
  backToAuto: IDS.filter((id) => Option.exists(hintOf(circle(host, id)), (hint) => hint === HINT)),
});

type Shown = ReturnType<typeof shown>;

const want = (target: Option.Option<StringId>): Shown => ({
  selected: Option.toArray(target),
  auto: Option.isNone(target),
  backToAuto: Option.toArray(target),
});

const told = ({ selected, auto, backToAuto }: Shown) =>
  `selected=[${selected.join(' ')}] auto=${String(auto)} hint=[${backToAuto.join(' ')}]`;

describe('the tuner string pick', () => {
  it('opens in Auto, with no string chosen', () => {
    using app = mount();
    expect(shown(app.host)).toEqual(want(Option.none()));
  });

  it('chooses D on a tap and turns Auto off; a second tap on D lets it go and turns Auto on', () => {
    using app = mount();
    press(app.host, Press.Tap({ id: 'D3' }));
    const first = shown(app.host);
    press(app.host, Press.Tap({ id: 'D3' }));
    expect({ first, second: shown(app.host) }).toEqual({
      first: { selected: ['D3'], auto: false, backToAuto: ['D3'] },
      second: { selected: [], auto: true, backToAuto: [] },
    });
  });

  it('moves the choice from D to A on a tap of A, Auto still off', () => {
    using app = mount();
    press(app.host, Press.Tap({ id: 'D3' }));
    press(app.host, Press.Tap({ id: 'A2' }));
    expect(shown(app.host)).toEqual({ selected: ['A2'], auto: false, backToAuto: ['A2'] });
  });

  it('turns Auto off with the switch, choosing the lowest string, and on again', () => {
    using app = mount();
    press(app.host, Press.Switch());
    const off = shown(app.host);
    press(app.host, Press.Switch());
    expect({ off, on: shown(app.host) }).toEqual({
      off: { selected: ['E2'], auto: false, backToAuto: ['E2'] },
      on: { selected: [], auto: true, backToAuto: [] },
    });
  });

  it('follows the rule from every target on every press, the screen read after each', () => {
    using app = mount();
    const targets: ReadonlyArray<Option.Option<StringId>> = [
      Option.none(),
      ...IDS.map((id) => Option.some(id)),
    ];
    let now: Option.Option<StringId> = Option.none();
    const misses: Array<string> = [];
    const step = (each: Press) => {
      const from = now;
      now = after(from, each);
      press(app.host, each);
      const seen = shown(app.host);
      if (Bun.deepEquals(seen, want(now))) return;
      misses.push(
        `${nameOf(from)} + ${pressName(each)}: want ${told(want(now))}, saw ${told(seen)}`,
      );
      now = Arr.head(seen.selected);
    };
    const reach = (target: Option.Option<StringId>) => {
      if (Option.isNone(target)) {
        if (Option.isSome(now)) step(Press.Switch());
        return;
      }
      if (!Option.contains(now, target.value)) step(Press.Tap({ id: target.value }));
    };
    for (const target of targets)
      for (const each of PRESSES) {
        reach(target);
        step(each);
      }
    expect(misses).toEqual([]);
  });
});
