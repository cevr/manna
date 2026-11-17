# Takes

A native macOS app for recording a script beat by beat and editing it by its words. You import the points as beats, read and ad-lib each one into the mic, and Takes transcribes every take on the Mac. You cut words out of the transcript, keep the best take of each beat, and export a WAV per beat with a `script.md` of what is said.

SwiftUI, Swift 6, SwiftPM, laid out like `apps/selah`. Transcription is Parakeet TDT 0.6B v3 through [FluidAudio](https://github.com/FluidInference/FluidAudio), from the models Hex already downloaded. Takes never downloads anything and makes no network call.

## Run

```sh
bun run --filter @manna/takes build      # → apps/takes/dist/Takes.app
open apps/takes/dist/Takes.app
open apps/takes/dist/Takes.app --args --project /path/to/folder   # open or create that project
open -a "$PWD/apps/takes/dist/Takes.app" outline.md take.wav      # import files (absolute app path)
```

Launch the bundle with `open`, not its binary from a terminal: macOS gives the microphone permission to whatever launched the binary. The bundle is signed ad hoc, and each build changes the signature, so macOS may ask for the microphone again after a rebuild. When access was refused, Takes says so and opens System Settings ▸ Privacy & Security ▸ Microphone.

## Terms

- **Project**: a folder, by default `~/Documents/Takes/<name>/`, holding `project.json` and `audio/`. The last project opened reopens at launch.
- **Beat**: one point of the script: a title, a talking-point note shown large while recording, its takes, and the take kept.
- **Take**: one recording of a beat, as one or more clips. The kept take (★) is what the beat plays and exports.
- **Clip**: a span of a source recording with frames cut out of it. Recordings in `audio/` are never changed; every edit is data in `project.json`.
- **Session take**: one recording through many beats. Press → at each new beat; on stop the recording is split at the quietest point within half a second of each press, one kept take per beat from where it started, new beats made past the last.

## Keys

| Key      | Does                                                      |
| -------- | --------------------------------------------------------- |
| ⌘R       | Record a take on the selected beat, or stop               |
| ⇧⌘R      | Record a session take                                     |
| →        | In a session take: the next beat                          |
| ⌫        | Cut the selected words or waveform range (editor focused) |
| Space    | Play or stop the take shown (editor focused)              |
| R        | Record or stop (editor focused)                           |
| ⌘P / ⇧⌘P | Play the beat / the film's kept takes in order            |
| ⌘Z / ⇧⌘Z | Undo / redo every edit (transcripts are not undone)       |
| ⌘I / ⇧⌘I | Import audio / an outline                                 |
| ⌘E / ⇧⌘E | Export to `<project>/export/` / to a folder you pick      |
| ⌘N / ⌘O  | New project / open a project folder                       |

The bare keys act only while the take editor has focus (click a word or the waveform), so they never reach the title or note fields.

## Editing

Click a word to select it, shift-click to extend. Cut takes the words plus 30 ms of silence each side where the gap allows, and stops at a neighbour that touches; cut words show struck through, and Restore brings them back. Drag on the waveform to select a range, drag its orange handles to trim the start and end, click to play from there. Move to ▸ and Copy to ▸ put the selected words on another beat's kept take as a clip over the same recording; Move also cuts them here. A 10 ms fade at each join keeps cuts from clicking.

## Outline import

Each `**N. Title.**` paragraph, inline or on its own line, or `##` heading starts a beat; the text under it, up to the next, is its note. Text before the first is skipped.

## Transcription

Takes loads the models from `~/Library/Application Support/FluidAudio/Models/parakeet-tdt-0.6b-v3` (Encoder, Decoder, JointDecisionv3, Preprocessor and the vocabulary), once per run, off the main thread; the first load compiles them for the Neural Engine and takes about 15 s. When the folder or a file in it is missing, the status line says "Parakeet models not found at … — recording and editing still work", and every take is still recorded, edited and exported.

## Export

Per beat with a kept take, `NN-slug.wav` (`01-hook.wav`): 48 kHz, 24-bit, mono, rendered from the edits. A beat without one gets no WAV. `script.md` lists `## N. Title` for each beat with the words of its edited audio, `_(no take)_` where there is none.

## Code

| Target            | Holds                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TakesCore`       | Foundation only: the model, edits and undo, the cut rule, plans and timelines, the project file, outline import, session split, input choice, `script.md` |
| `TakesAudio`      | AVFoundation and CoreAudio: reading, rendering, WAV export, peaks, input devices, the recorder and the player                                             |
| `TakesTranscribe` | The only target that imports FluidAudio: `Transcriber`, `ParakeetModels`                                                                                  |
| `TakesApp`        | The SwiftUI app over `AppModel`                                                                                                                           |

The gate, `bun run --filter @manna/takes gate`, lints the Swift, builds with warnings as errors on these targets (not FluidAudio's), runs the tests and builds the app. It runs in `bun run test:slow`, not in the root `bun run gate`. The Parakeet test runs only when the models are present.
