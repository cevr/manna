// ElevenLabs in memory for the tool tests: speech and dialogue answered from
// what was sent, every call counted. No network, no credits.

import { Array as Arr, Effect, Layer, Option, Redacted } from 'effect';
import { Base64 } from 'effect/encoding';
import { type DialogueRequest, ElevenLabs, type TtsRequest } from '../elevenlabs.ts';
import { ApiKeyMissing } from '../errors.ts';

/** What the fake ElevenLabs was asked to do. */
export interface ElevenLabsCalls {
  readonly tts: Array<TtsRequest>;
  readonly dialogue: Array<DialogueRequest>;
  readonly stt: Array<string>;
  readonly music: Array<string>;
  readonly effects: Array<string>;
}

/** Characters aligned one per 0.05 s. */
const aligned = (characters: ReadonlyArray<string>) => ({
  characters: [...characters],
  character_start_times_seconds: characters.map((_, i) => i * 0.05),
  character_end_times_seconds: characters.map((_, i) => i * 0.05 + 0.05),
});

/** What a fake voice says of a text sent it: its words, a direction (`[pause]`, `<break … />`) left unsaid. */
const said = (sent: string): string =>
  sent
    .replace(/\[[^\]]*\]|<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The beat a take file belongs to: its name up to the first dot. */
const beatOfTake = (file: string) =>
  Option.getOrElse(Arr.head(file.slice(file.lastIndexOf('/') + 1).split('.')), () => '');

/** A transcript's words, one every half second, each 0.4 s long. */
const heardAt = (said: string) =>
  said
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w, i) => ({ text: w, start: i * 0.5, end: i * 0.5 + 0.4, type: 'word' }));

/**
 * Speech comes back aligned one character per 0.05 s, and its "audio" is the
 * text itself, padded with one space per take so no two takes are the same
 * bytes. A dialogue aligns its lines joined with nothing between them, as the
 * API does, and its audio is the lines read one after another. The transcript
 * of a take file is what was spoken into it, unless `heard` maps that text to
 * something else; a person's take (fake FLAC bytes, `fakeMedia.encodeFlac`)
 * says what `recorded` has for its beat. Every transcript's words are timed
 * by `heardAt`, unless `untimed`, when the reply carries its text and no words.
 * A direction sent in the text (`[pause]`, `<break … />`) is aligned, as the
 * API may align it, and never said.
 */
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
          // A person's take is fake MP3 bytes: what was said is the recording's, by beat.
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
      // The score's bytes name the plan's styles, so each option hashes apart.
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
