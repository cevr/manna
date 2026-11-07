# Kokoro's seven-stage chain, vendored from FluidAudio

These files are taken from [FluidAudio](https://github.com/FluidInference/FluidAudio) at commit `ee78635d23d52379117554ba72358b65a0612447`, under the Apache License, Version 2.0. `LICENSE` here is FluidAudio's licence, byte for byte.

They are vendored, not added as a dependency, because One's prebuild refuses SwiftPM package dependencies. The chain loads compiled `.mlmodelc` bundles, so the phone compiles nothing.

| File here                                        | Upstream path                                                                     | Changed for Heartseed                                                                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `KokoroAneConstants.swift`                       | `Sources/FluidAudio/TTS/KokoroAne/KokoroAneConstants.swift`                       | `#if TTS` wrapper removed; trimmed to the English legacy chain (no `KokoroAneVariant`, no `Repo`, no other language's voices, no G2P constants) |
| `KokoroAneError.swift`                           | `Sources/FluidAudio/TTS/KokoroAne/KokoroAneError.swift`                           | `#if TTS` wrapper removed; the `voiceNotFound` case removed, since it names `KokoroAneVariant`                                                  |
| `Pipeline/KokoroAneVoicePack.swift`              | `Sources/FluidAudio/TTS/KokoroAne/Pipeline/KokoroAneVoicePack.swift`              | `#if TTS` wrapper removed                                                                                                                       |
| `Pipeline/KokoroAneSynthesizer.swift`            | `Sources/FluidAudio/TTS/KokoroAne/Pipeline/KokoroAneSynthesizer.swift`            | `#if TTS` wrapper removed                                                                                                                       |
| `Pipeline/KokoroAneSynthesizer+Conversion.swift` | `Sources/FluidAudio/TTS/KokoroAne/Pipeline/KokoroAneSynthesizer+Conversion.swift` | `#if TTS` wrapper removed                                                                                                                       |
| `Pipeline/KokoroAneSynthesizer+Types.swift`      | `Sources/FluidAudio/TTS/KokoroAne/Pipeline/KokoroAneSynthesizer+Types.swift`      | `#if TTS` wrapper removed                                                                                                                       |

Each file starts with the same notice. FluidAudio's model store, which downloads from its own repository, is not vendored: `../ModelStore.swift` is Heartseed's own `KokoroAneModelStore`, with the same `model(for:)`. FluidAudio's vocab is not vendored either: the app's JavaScript plans the token ids.

## Credits

- **Kokoro-82M**, the model, by hexgrad, under the Apache License, Version 2.0.
- **The Core ML conversion** into seven stages, by laishere (`kokoro-coreml`), under the Apache License, Version 2.0. The pinned files are FluidInference's `kokoro-82m-coreml`, folder `ANE/`; that folder's README front matter says MIT while its LICENSE says Apache-2.0, and Heartseed follows the LICENSE.
- **FluidAudio**, the Swift chain, by FluidInference, under the Apache License, Version 2.0.
