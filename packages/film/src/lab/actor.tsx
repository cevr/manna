import { useAtomSuspense } from '@manna/atom-solid';
import { type JSX, Loading, Show } from '@solidjs/web';
import type { Effect, Scope } from 'effect';
import { Machine } from 'effect-machine';
import type * as Atom from 'effect/reactivity/Atom';

interface ActorProps<A, R> {
  readonly runtime: Atom.AtomRuntime<R>;
  readonly spawn: Effect.Effect<A, never, R | Scope.Scope>;
  readonly children: (actor: A) => JSX.Element;
}

const Spawned = <A, R>(props: ActorProps<A, R>) => {
  const spawned = props.runtime.atom(Machine.scoped(props.spawn));
  const actor = useAtomSuspense(() => spawned);
  return (
    <Show when={actor()} keyed>
      {(a: A) => props.children(a)}
    </Show>
  );
};

export const Actor = <A, R>(props: ActorProps<A, R>) => (
  <Loading>
    <Spawned {...props} />
  </Loading>
);
