import { Show } from '@solidjs/web';
import { Boolean as Bool, Option } from 'effect';
import type { ParentProps } from 'solid-js';
import { createEffect, createSignal, createUniqueId } from 'solid-js';
import { pressed } from '../pressed.ts';
import { BRIEF_LINES } from './style.ts';

export const BriefBox = (props: ParentProps) => {
  const [open, setOpen] = createSignal(false, { ownedWrite: true });
  const [clips, setClips] = createSignal(false, { ownedWrite: true });
  const id = createUniqueId();
  let brief = Option.none<HTMLElement>();
  createEffect(
    () => true,
    () =>
      Option.match(brief, {
        onNone: () => () => {},
        onSome: (el) => {
          const o = new ResizeObserver(() =>
            setClips(
              el.scrollHeight >
                BRIEF_LINES * (Number.parseFloat(getComputedStyle(el).lineHeight) || 0) + 1,
            ),
          );
          o.observe(el);
          return () => o.disconnect();
        },
      }),
  );
  return (
    <div class="lab-script-brief">
      <p
        class="lab-script-picture"
        id={id}
        data-open={pressed(open())}
        ref={(el: HTMLParagraphElement) => {
          brief = Option.some(el);
        }}
        onFocusIn={(e) => {
          const landed = e.target;
          if (
            landed instanceof HTMLElement &&
            Option.exists(
              brief,
              (el) => landed.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 1,
            )
          )
            setOpen(true);
        }}
      >
        {props.children}
      </p>
      <Show when={clips()}>
        <button
          type="button"
          class="lab-script-more"
          data-act="more-brief"
          aria-expanded={pressed(open())}
          aria-controls={id}
          onClick={() => setOpen((on) => !on)}
        >
          {Bool.match(open(), { onTrue: () => 'Less', onFalse: () => 'More' })}
        </button>
      </Show>
    </div>
  );
};
