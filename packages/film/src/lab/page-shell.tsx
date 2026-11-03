import { type JSX, Show, useHead } from '@solidjs/web';
import { Option } from 'effect';
import type { Accessor } from 'solid-js';
import type { Hub } from '../command/hub.ts';
import { BY_BUTTON } from '../command/command.ts';
import { hubKeys } from './command/changes.ts';
import { COMMAND_MENU, GO_TO_COMMAND } from './command/command-menu.tsx';
import { ViewMenu } from './command/view-menu.tsx';
import { pageTitle } from './page-title.ts';
import { pressed } from './pressed.ts';

type IconName = 'play' | 'search' | 'hear' | 'stop';

const ICON_STROKES: Readonly<Record<IconName, () => JSX.Element>> = {
  play: () => <path d="M7 4.5l12 7.5-12 7.5z" />,
  search: () => (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </>
  ),
  hear: () => (
    <path d="M4 9.5h3.5l4.5-4v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  ),
  stop: () => <rect x="6" y="6" width="12" height="12" />,
};

const Icon = (props: { readonly of: IconName }) => (
  <svg class="sh-icon" viewBox="0 0 24 24" aria-hidden="true">
    {ICON_STROKES[props.of]()}
  </svg>
);

const PLAY_ICON = { true: 'stop', false: 'play' } as const;

export const PlayIcon = (props: { readonly playing?: boolean }) => (
  <Icon of={PLAY_ICON[pressed(props.playing === true)]} />
);

interface PageShellProps {
  readonly film: Accessor<Option.Option<string>>;
  readonly hub: Hub;
  readonly crumb: Accessor<Option.Option<string>>;
  readonly children: JSX.Element;
}

export const PageShell = (props: PageShellProps) => {
  useHead(() => ({
    tag: 'title',
    props: {
      children: pageTitle([props.crumb()], props.film()),
    },
  }));
  const keys = hubKeys(props.hub);
  return (
    <div class="sh" data-film={pressed(Option.isSome(props.film()))}>
      <header class="sh-header">
        <Show when={Option.getOrUndefined(props.crumb())}>
          {(text) => (
            <span class="sh-crumb" data-role="crumb">
              <span class="sh-crumb-text">{text()}</span>
            </span>
          )}
        </Show>
        <span class="sh-spacer" />
        <button
          type="button"
          class="sh-goto"
          data-act="search"
          aria-label="Go to…"
          title={`Run a command by name (${[GO_TO_COMMAND, COMMAND_MENU]
            .map(keys.first)
            .filter((k) => k !== '')
            .join(' or ')})`}
          onClick={() => props.hub.invokeId(GO_TO_COMMAND, BY_BUTTON)}
        >
          <Icon of="search" />
          <span>Go to…</span>
          <kbd>{keys.first(COMMAND_MENU)}</kbd>
        </button>
        <ViewMenu hub={props.hub} />
      </header>
      <div class="sh-body">{props.children}</div>
    </div>
  );
};
