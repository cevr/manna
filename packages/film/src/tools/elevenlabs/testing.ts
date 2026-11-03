import { Array as Arr, Effect, Layer, Option, Redacted } from 'effect';
import { Base64 } from 'effect/encoding';
import { type DialogueRequest, ElevenLabs, type TtsRequest } from '../elevenlabs.ts';
import { ApiKeyMissing } from '../errors.ts';

export interface ElevenLabsCalls {
  readonly tts: Array<TtsRequest>;
  readonly dialogue: Array<DialogueRequest>;
  readonly stt: Array<string>;
  readonly music: Array<string>;
  readonly effects: Array<string>;
}

const aligned = (characters: ReadonlyArray<string>) => ({
  characters: [...characters],
  character_start_times_seconds: characters.map((_, i) => i * 0.05),
  character_end_times_seconds: characters.map((_, i) => i * 0.05 + 0.05),
});

const said = (sent: string): string =>
  sent
    .replace(/\[[^\]]*\]|<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const beatOfTake = (file: string) =>
  Option.getOrElse(Arr.head(file.slice(file.lastIndexOf('/') + 1).split('.')), () => '');

const heardAt = (said: string) =>
  said
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w, i) => ({ text: w, start: i * 0.5, end: i * 0.5 + 0.4, type: 'word' }));

export const fakeElevenLabs = (
  files: Map<string, Uint8Array>,
  calls: ElevenLabsCalls,
  options: {
    readonly heard?: ReadonlyMap<string, string>;
    readonly recorded?: ReadonlyMap<string, string>;
    readonly untimed?: boolean;
    readonly apiKey?: string;
  } = {},
) =>
  Layer.succeed(
    ElevenLabs,
    ElevenLabs.of({
      tts: (request) =>
        Effect.sync(() => {
          calls.tts.push(request);
          return {
            audio_base64: Base64.encode(said(request.text) + ' '.repeat(calls.tts.length)),
            alignment: aligned([...request.text]),
          };
        }),
      dialogue: (request) =>
        Effect.sync(() => {
          calls.dialogue.push(request);
          const spoken = said(request.lines.map((line) => line.text).join(' '));
          const starts = request.lines.map((_, i) =>
            request.lines.slice(0, i).reduce((n, line) => n + [...line.text].length, 0),
          );
          return {
            audio_base64: Base64.encode(spoken + ' '.repeat(calls.dialogue.length)),
            alignment: aligned(request.lines.flatMap((line) => [...line.text])),
            voice_segments: request.lines.map((line, i) => ({
              character_start_index: starts[i] ?? 0,
              voice_id: line.voiceId,
            })),
          };
        }),
      stt: (file) =>
        Effect.sync(() => {
          calls.stt.push(file);
          const bytes = new TextDecoder().decode(files.get(file)).trim();
          const person = Option.filter(
            Option.fromNullishOr(options.recorded?.get(beatOfTake(file))),
            () => bytes.startsWith('flac '),
          );
          const said = Option.getOrElse(person, () => bytes);
          const heard = Option.getOrElse(
            Option.fromNullishOr(options.heard?.get(said)),
            () => said,
          );
          if (options.untimed === true) return { text: heard };
          return { text: heard, words: heardAt(heard) };
        }),
      composeMusic: (plan, _model, out) =>
        Effect.sync(() => {
          calls.music.push(out);
          const styles = plan.chunks.flatMap((c) => c.positive_styles).join(' ');
          files.set(out, new TextEncoder().encode(`music ${styles}`));
        }),
      ready: Effect.void,
      apiKey: Option.match(Option.fromNullishOr(options.apiKey), {
        onNone: () => Effect.fail(ApiKeyMissing.make({})),
        onSome: (key) => Effect.succeed(Redacted.make(key)),
      }),
      soundEffect: (_request, out) => Effect.sync(() => void calls.effects.push(out)),
    }),
  );

export const emptyCalls = (): ElevenLabsCalls => ({
  tts: [],
  dialogue: [],
  stt: [],
  music: [],
  effects: [],
});
