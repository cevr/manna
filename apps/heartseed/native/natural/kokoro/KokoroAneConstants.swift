// Vendored from FluidAudio (https://github.com/FluidInference/FluidAudio)
// at commit ee78635d23d52379117554ba72358b65a0612447,
// file Sources/FluidAudio/TTS/KokoroAne/KokoroAneConstants.swift.
// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Changed for Heartseed:
// - the `#if TTS` / `#endif` wrapper removed;
// - trimmed to the English legacy chain: the other languages' default
//   voices and voice lists, the English voice list, the G2P, jieba, g2pW,
//   Japanese and Spanish/French lexicon constants, and `KokoroAneVariant`
//   (with its `Repo`) removed.

import Foundation

/// Compile-time constants for the laishere/kokoro 7-stage CoreML chain.
///
/// Source of truth: mobius/models/tts/kokoro/laishere-coreml/convert-coreml.py
/// (specifically `compute_shape_bounds(max_frames=2000)` and the per-stage
/// I/O contracts).
public enum KokoroAneConstants {

    /// Default voice id for the English (`ANE/`) variant.
    public static let defaultVoice = "af_heart"

    /// Output sample rate of the iSTFT in `KokoroTail_v2.mlpackage`.
    public static let sampleRate = 24_000

    /// BOS / EOS token id used by both `convert-coreml.py` and the iOS demo.
    public static let bosTokenId: Int32 = 0
    public static let eosTokenId: Int32 = 0

    /// ALBERT context window — input_ids cannot exceed this, so the IPA
    /// phoneme sequence (excluding BOS/EOS) must be ≤ 510.
    public static let maxInputTokens = 512
    public static let maxPhonemeLength = 510

    /// Voice pack rows × columns. The pack is stored flat as `[510, 256]` fp32:
    ///   * row index = `min(max(phonemeCount - 1, 0), 509)` — bucketed by the
    ///     raw phoneme-string length (BOS/EOS excluded), matching
    ///     `convert.py:get_ref_data`.
    ///   * cols `[0..<128]`   = `style_timbre` (→ Noise + Vocoder)
    ///   * cols `[128..<256]` = `style_s`      (→ PostAlbert + Prosody)
    public static let voicePackRows = 510
    public static let voicePackCols = 256

    /// `--max-frames` baked into the converted models. Sentences whose `T_a`
    /// exceeds this must be skipped or chunked.
    public static let maxAcousticFrames = 2_000

    /// Default playback speed factor for PostAlbert.
    public static let defaultSpeed: Float = 1.0
}
