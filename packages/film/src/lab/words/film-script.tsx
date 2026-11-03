import { useAtomRefresh, useAtomValue } from '@manna/atom-solid';
import { Show } from '@solidjs/web';
import { Effect, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import type * as Atom from 'effect/reactivity/Atom';
import { type DraftBeatRead, type ScriptBeats, stagingTakeUrl } from '../../core/api.ts';
import { type LabFailure, reasonOf } from '../api.ts';
import { AskApi } from '../ask/api.ts';
import {
  type BriefShown,
  type ReaderPage,
  STATUS_ROLE,
  ScriptReader,
  type Selecting,
} from './reader.tsx';

const beatRead = (beat: ScriptBeats['beats'][number]): DraftBeatRead => ({
  id: beat.id,
  label: '',
  ...Option.match(Option.fromUndefinedOr(beat.say), {
    onNone: () => ({}),
    onSome: (say) => ({ say }),
  }),
  ...Option.match(Option.fromUndefinedOr(beat.picture), {
    onNone: () => ({}),
    onSome: (brief) => ({ brief }),
  }),
  cite: beat.cite,
});

export const FilmScriptReader = (props: {
  readonly page: ReaderPage;
  readonly script: Atom.Atom<AsyncResult.AsyncResult<ScriptBeats, LabFailure>>;
  readonly film: string;
  readonly only: Option.Option<ReadonlyArray<string>>;
  readonly selecting: Selecting;
  readonly brief?: BriefShown;
}) => {
  const read = useAtomValue(() => props.script);
  const again = useAtomRefresh(() => props.script);
  const beats = () =>
    Option.match(AsyncResult.value(read()), {
      onNone: () => [],
      onSome: (s) =>
        s.beats
          .filter((b) =>
            Option.match(props.only, { onNone: () => true, onSome: (only) => only.includes(b.id) }),
          )
          .map(beatRead),
    });
  return (
    <Show
      when={Option.isSome(AsyncResult.value(read()))}
      fallback={
        <p class="dr-status" role={STATUS_ROLE[`${AsyncResult.isFailure(read())}`]}>
          {AsyncResult.match(read(), {
            onInitial: () => 'Reading the script…',
            onFailure: (f) => `Could not read the script: ${reasonOf(f.cause)}`,
            onSuccess: () => '',
          })}
        </p>
      }
    >
      <ScriptReader
        page={props.page}
        beats={beats}
        selecting={props.selecting}
        cost={false}
        brief={props.brief ?? 'boxed'}
        source={{
          voice: AskApi.use((api) => api.filmVoice(props.film)),
          mark: (post) =>
            AskApi.use((api) => api.filmMarks(props.film, post)).pipe(
              Effect.ensuring(Effect.sync(again)),
            ),
          takeUrl: (file) => stagingTakeUrl(props.film, file),
          written: 'marked in the script',
          reread: again,
        }}
      />
    </Show>
  );
};
