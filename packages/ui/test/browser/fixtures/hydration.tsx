import type { JSX } from '@solidjs/web';
import { createRenderEffect, createSignal } from 'solid-js';

import type { HTMLProps } from '../../../src/internals/types.ts';
import { onElement } from '../../../src/mix/element.ts';
import { mix } from '../../../src/mix/mix.ts';
import { Toggle } from '../../../src/toggle/index.ts';
import { ToggleGroup } from '../../../src/toggle-group/index.ts';
import { log } from './log.ts';

function Probed(props: { value: string }): JSX.Element {
  return (
    <Toggle
      id={props.value}
      value={props.value}
      render={(merged: HTMLProps) => {
        let logged: unknown = null;
        createRenderEffect(
          () => merged['tabindex'] as unknown,
          (tabindex) => {
            if (tabindex !== logged) {
              logged = tabindex;
              log(`tabindex ${props.value} ${String(tabindex)}`);
            }
          },
        );
        return <button {...merged} />;
      }}
    >
      {props.value}
    </Toggle>
  );
}

const group = (initial: ReadonlyArray<string>) =>
  function Group(): JSX.Element {
    const [value, setValue] = createSignal<readonly string[]>(initial);
    const behaviour = mix<HTMLDivElement>({
      get 'data-pressed-count'() {
        return String(value().length);
      },
      'aria-label': 'spread',
    });
    const refs = [onElement<HTMLDivElement>((el) => log(`setup ${el.id}`))];
    return (
      <main>
        <div id="spread" {...behaviour} ref={refs} />
        <ToggleGroup
          id="group"
          value={value()}
          onValueChange={(next) => {
            log(`value [${next.join(',')}]`);
            setValue(next);
          }}
        >
          <Probed value="one" />
          <Probed value="two" />
          <Probed value="three" />
        </ToggleGroup>
      </main>
    );
  };

const Pressed = group(['two']);
const Unpressed = group([]);

export const fixtures: Record<string, () => JSX.Element> = {
  pressed: () => <Pressed />,
  unpressed: () => <Unpressed />,
};
