import { Show } from '@solidjs/web';
import type { Following } from './follow.ts';

/** Follow, while a reader has the box `following` keeps. */
export const FollowButton = (props: { readonly following: Following }) => (
  <Show when={!props.following.on()}>
    <button
      type="button"
      class="sh-btn lab-follow"
      data-act="follow"
      title="Scroll with the playhead"
      onClick={() => props.following.resume()}
    >
      Follow
    </button>
  </Show>
);
