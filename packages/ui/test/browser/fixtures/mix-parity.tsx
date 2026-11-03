import type { JSX } from '@solidjs/web';
import { createSignal } from 'solid-js';

import { type RefFactory, onElement } from '../../../src/mix/element.ts';
import { mix, type Mixin } from '../../../src/mix/mix.ts';
import { Toggle } from '../../../src/toggle/index.ts';
import { ToggleGroup } from '../../../src/toggle-group/index.ts';

function switchable(on: () => boolean): Mixin<HTMLDivElement> {
  return {
    role: 'switch',
    tabindex: 0,
    get 'aria-checked'() {
      return on() ? 'true' : 'false';
    },
    get 'data-on'() {
      return on() ? '' : undefined;
    },
  };
}

function reporting(report: (line: string) => void): RefFactory<HTMLDivElement> {
  report('made');
  return (el) => report(`ref ${el.id}`);
}

export function Parity(props: { report: (line: string) => void }): JSX.Element {
  const [on] = createSignal(true);
  const behaviour = mix<HTMLDivElement>(
    switchable(on),
    { class: 'base', style: { color: 'red' }, 'aria-label': 'parity', title: 'left' },
    false,
    { class: 'caller', style: 'margin: 1px', title: 'right', 'data-caller': 'yes' },
  );
  const refs = [
    reporting(props.report),
    onElement<HTMLDivElement>((el) => props.report(`setup ${el.id}`)),
  ];
  return (
    <main>
      <div id="parity" {...behaviour} ref={refs} />
      <ToggleGroup id="group" value={['two']} onValueChange={() => undefined}>
        <Toggle id="one" value="one">
          One
        </Toggle>
        <Toggle id="two" value="two">
          Two
        </Toggle>
      </ToggleGroup>
    </main>
  );
}
