import { Toggle } from '@manna/ui/toggle';
import { ToggleGroup } from '@manna/ui/toggle-group';
import { For, Show } from '@solidjs/web';
import type { Accessor } from 'solid-js';
import { Array as Arr, Match, Option } from 'effect';
import type { StagingTake } from '../../core/api.ts';
import { HOLD_DEFAULT, type Mark } from '../../core/delivery.ts';
import { PlayIcon } from '../page-shell.tsx';
import { pressed } from '../pressed.ts';
import {
  type Gap,
  HOLD_CHOICES,
  gapBefore,
  gapOpen,
  gapSet,
  paceOf,
  stressToggled,
  stressed,
} from './delivery.ts';
import { Marking, useVoice } from './voice.tsx';

const BAND = '150–165 wpm';

const secondsOf = (seconds: number): string => `${seconds} s`;

const paceText = (pace: {
  readonly wpm: number;
  readonly band: 'slow' | 'in' | 'fast';
}): string => {
  if (pace.band === 'in') return `${pace.wpm} wpm`;
  return `${pace.wpm} wpm ${pace.band}`;
};

const HEAR_TITLE = {
  true: 'Stop',
  false: 'Hear the staging take, and the beats ready after it',
} as const;
const hearLabel = (hearing: boolean, beat: string): string => {
  if (hearing) return `Stop beat ${beat}`;
  return `Hear beat ${beat}`;
};
const HEAR_ALL = { true: '■ Stop', false: '▶ Hear it' } as const;

const GAP_OF: Readonly<Record<Gap['_tag'], Gap>> = {
  None: { _tag: 'None' },
  Breath: { _tag: 'Breath' },
  Hold: { _tag: 'Hold', seconds: HOLD_DEFAULT },
};

const holdOf = (gap: Gap): Option.Option<number> =>
  Match.value(gap).pipe(
    Match.tag('Hold', (h) => Option.some(h.seconds)),
    Match.orElse(() => Option.none<number>()),
  );

export const GapGlyph = (props: { readonly gap: Gap }) => (
  <>
    {Match.value(props.gap).pipe(
      Match.tagsExhaustive({
        None: () => <></>,
        Breath: () => (
          <span class="lab-script-gap" data-gap="breath" title="A breath">
            /{' '}
          </span>
        ),
        Hold: (h) => (
          <span class="lab-script-gap" data-gap="hold" title={`A hold of ${secondsOf(h.seconds)}`}>
            {`// ${secondsOf(h.seconds)}`}{' '}
          </span>
        ),
      }),
    )}
  </>
);

export const stressAttr = (marks: ReadonlyArray<Mark>, at: number) =>
  Option.getOrUndefined(Option.liftPredicate('true', () => stressed(marks, at)));

export const TakeState = (props: { readonly beat: string }) => {
  const voice = useVoice();
  const take = () => voice.take(props.beat);
  const hearing = () => Option.contains(voice.hearing(), props.beat);
  return (
    <Show when={Option.getOrUndefined(take())}>
      {(t) => (
        <>
          {Match.value<StagingTake>(t()).pipe(
            Match.tagsExhaustive({
              Ready: (ready) => (
                <>
                  <button
                    type="button"
                    class="lab-script-hear"
                    data-act="hear-beat"
                    aria-pressed={pressed(hearing())}
                    aria-label={hearLabel(hearing(), props.beat)}
                    title={HEAR_TITLE[pressed(hearing())]}
                    onClick={() => {
                      if (hearing()) voice.stop();
                      else voice.hear(props.beat, Option.none(), true);
                    }}
                  >
                    <PlayIcon playing={hearing()} />
                  </button>
                  {Option.toArray(paceOf(ready.words)).map((pace) => (
                    <span
                      class="lab-script-pace"
                      data-band={pace.band}
                      title={`The take's pace; the band is ${BAND}`}
                    >
                      {paceText(pace)}
                    </span>
                  ))}
                </>
              ),
              Voicing: () => <span class="lab-script-voicing">voicing…</span>,
              Unvoiced: () => <></>,
              Refused: (r) => (
                <span class="lab-script-voicing" data-refused="true" title={r.reason}>
                  not voiced: {r.reason}
                </span>
              ),
            }),
          )}
        </>
      )}
    </Show>
  );
};

export interface Words {
  readonly from: number;
  readonly to: number;
}

export const HearWords = (props: {
  readonly beat: string;
  readonly words: Option.Option<Words>;
}) => {
  const voice = useVoice();
  const words = () =>
    Option.filter(props.words, () =>
      Option.exists(voice.take(props.beat), (t) => t._tag === 'Ready'),
    );
  return (
    <Show when={Option.getOrUndefined(words())}>
      {(w) => (
        <button
          type="button"
          class="sh-btn"
          data-act="hear-words"
          title="Hear these words in the staging take"
          onClick={() => voice.hear(props.beat, Option.some({ from: w().from, to: w().to }), false)}
        >
          Hear
        </button>
      )}
    </Show>
  );
};

const counted = (takes: ReadonlyArray<StagingTake>, tag: StagingTake['_tag']) =>
  takes.filter((t) => t._tag === tag).length;

interface TakesLine {
  readonly takes: string;
  readonly cost: Option.Option<string>;
}

const takesLine = (
  takes: ReadonlyArray<StagingTake>,
  spend: { readonly spent: number; readonly cap: number },
): TakesLine => {
  if (takes.length > 0 && counted(takes, 'Unvoiced') === takes.length)
    return { takes: 'staging voice off in this lab: no takes are made', cost: Option.none() };
  const parts = [
    `${counted(takes, 'Ready')} of ${takes.length} takes ready`,
    ...Option.toArray(
      Option.map(
        Option.liftPredicate(counted(takes, 'Voicing'), (n) => n > 0),
        (n) => `${n} voicing`,
      ),
    ),
    ...Option.toArray(
      Option.map(
        Option.liftPredicate(counted(takes, 'Refused'), (n) => n > 0),
        (n) => `${n} refused`,
      ),
    ),
  ];
  return {
    takes: parts.join(' · '),
    cost: Option.some(
      `${spend.spent.toLocaleString('en-US')} of ${spend.cap.toLocaleString('en-US')} characters today`,
    ),
  };
};

export const Spend = (props: { readonly cost: boolean }) => {
  const voice = useVoice();
  const line = () =>
    Option.orElse(
      Option.map(voice.unread(), (why) => ({
        takes: `staging voice unread: ${why}`,
        cost: Option.none<string>(),
      })),
      () => Option.map(voice.spend(), (s) => takesLine(voice.takes(), s)),
    );
  return (
    <Show when={Option.getOrUndefined(line())}>
      {(l) => (
        <p class="lab-script-spend">
          {[l().takes, ...Option.toArray(Option.filter(l().cost, () => props.cost))].join(' · ')}
        </p>
      )}
    </Show>
  );
};

export const HearIt = (props: { readonly beats: ReadonlyArray<string> }) => {
  const voice = useVoice();
  const first = () =>
    Arr.findFirst(props.beats, (id) => Option.exists(voice.take(id), (t) => t._tag === 'Ready'));
  const hearing = () => Option.isSome(voice.hearing());
  return (
    <Show when={Option.getOrUndefined(first())}>
      {(beat: Accessor<string>) => (
        <>
          <button
            type="button"
            class="sh-btn lab-script-hear-all"
            data-act="hear-script"
            aria-pressed={pressed(hearing())}
            onClick={() => {
              if (hearing()) voice.stop();
              else voice.hear(beat(), Option.none(), true);
            }}
          >
            {HEAR_ALL[pressed(hearing())]}
          </button>
          <span class="lab-script-blocked" role="status" data-role="hear-blocked">
            {Option.match(voice.blocked(), {
              onNone: () => '',
              onSome: (id) => `The browser kept beat ${id} quiet: tap ▶ again`,
            })}
          </span>
        </>
      )}
    </Show>
  );
};

const markingNote = (m: Marking, beat: string, written: string): string => {
  if (m._tag === 'Idle' || m.beat !== beat) return '';
  return Marking.$match(m, {
    Idle: () => '',
    Writing: () => 'marking…',
    Written: () => written,
    Failed: (f) => `not marked: ${f.reason}`,
  });
};

export const Delivery = (props: {
  readonly beat: string;
  readonly marks: ReadonlyArray<Mark>;
  readonly spoken: string;
  readonly selected: Option.Option<Words>;
}) => {
  const voice = useVoice();
  const marks = () => voice.marksOf(props.beat, props.marks);
  const words = () => props.spoken.split(' ').filter((w) => w !== '').length;
  const selected = () => props.selected;
  const write = (next: ReadonlyArray<Mark>) =>
    voice.mark(props.beat, next, { spoken: props.spoken, marks: props.marks });
  return (
    <Show when={Option.getOrUndefined(selected())}>
      {(w) => {
        const allStressed = () => Arr.range(w().from, w().to).every((i) => stressed(marks(), i));
        const gap = () => gapBefore(marks(), w().from);
        return (
          <div class="lab-script-delivery" role="group" aria-label="Delivery">
            <div class="lab-script-delivery-row">
              <button
                type="button"
                class="sh-btn"
                data-act="stress-words"
                aria-pressed={pressed(allStressed())}
                title="Stress these words"
                onClick={() => write(stressToggled(marks(), w().from, w().to))}
              >
                Stress
              </button>
              <Show when={gapOpen(w().from, words())}>
                <ToggleGroup<Gap['_tag']>
                  class="sh-seg"
                  aria-label="Before these words"
                  value={[gap()._tag]}
                  onValueChange={(next) =>
                    Option.map(Arr.head(next), (tag) =>
                      write(gapSet(marks(), w().from, GAP_OF[tag])),
                    )
                  }
                >
                  <Toggle<Gap['_tag']> value="None" title="No pause before these words">
                    no pause
                  </Toggle>
                  <Toggle<Gap['_tag']> value="Breath" title="A breath before these words">
                    breath
                  </Toggle>
                  <Toggle<Gap['_tag']> value="Hold" title="A hold before these words">
                    hold
                  </Toggle>
                </ToggleGroup>
              </Show>
            </div>
            <Show when={Option.getOrUndefined(holdOf(gap()))}>
              {(seconds) => (
                <ToggleGroup
                  class="sh-seg lab-script-holds"
                  aria-label="Hold for"
                  value={[String(seconds())]}
                  onValueChange={(next) =>
                    Option.map(Arr.head(next), (s) =>
                      write(gapSet(marks(), w().from, { _tag: 'Hold', seconds: Number(s) })),
                    )
                  }
                >
                  <For each={HOLD_CHOICES}>
                    {(s) => (
                      <Toggle value={String(s)} title={`Hold ${secondsOf(s)}`}>
                        {secondsOf(s)}
                      </Toggle>
                    )}
                  </For>
                </ToggleGroup>
              )}
            </Show>
            <Show when={markingNote(voice.marking(), props.beat, voice.written) !== ''}>
              <p class="lab-script-delivery-note" role="status">
                {markingNote(voice.marking(), props.beat, voice.written)}
              </p>
            </Show>
          </div>
        );
      }}
    </Show>
  );
};
