// Vendored from FluidAudio (https://github.com/FluidInference/FluidAudio)
// at commit ee78635d23d52379117554ba72358b65a0612447,
// file Sources/FluidAudio/TTS/KokoroAne/Pipeline/KokoroAneSynthesizer.swift.
// Licensed under the Apache License, Version 2.0 (see LICENSE).
// Changed for Heartseed:
// - the `#if TTS` / `#endif` wrapper removed. `KokoroAneModelStore` is
//   Heartseed's own (../../ModelStore.swift), with the same `model(for:)`.
// - `synthesize` split in two at the pitch curve: `prosody` runs stages 1-4
//   and returns `KokoroAneProsody`, `vocode` runs stages 5-7 on a curve the
//   caller gives; `synthesize` is `prosody` then `vocode` on its own curve.

@preconcurrency import CoreML
import Foundation

/// The chain's first four stages for one input: the durations, Prosody's
/// pitch curve `F0` (Hz, two points per acoustic frame), and what the last
/// three stages read besides it.
public struct KokoroAneProsody: @unchecked Sendable {
    public let inputIds: [Int32]
    public let predictedDurations: [Int32]
    public let acousticFrames: Int
    public let f0: [Float]
    public let timings: KokoroAneStageTimings
    let f0Shape: [Int]
    let n: MLMultiArray
    let asr: MLMultiArray
}

/// Orchestrates the 7-stage CoreML chain produced by laishere/kokoro-coreml.
///
/// All inputs / outputs follow `convert-coreml.py:run_chain()`. fp16 ↔ fp32
/// conversions are applied at the boundaries identified in
/// `mobius/.../docs/architecture.md`:
///   * Prosody → Noise   : fp16 → fp32
///   * Noise → Vocoder   : fp32 → fp16
///   * Vocoder → Tail    : fp16 → fp32 (and `anchor` is discarded)
public struct KokoroAneSynthesizer {

    /// One-shot synthesis from already-tokenised input ids + style slices:
    /// `prosody`, then `vocode` on its own curve.
    public static func synthesize(
        inputIds: [Int32],
        styleS: [Float],
        styleTimbre: [Float],
        speed: Float = KokoroAneConstants.defaultSpeed,
        store: KokoroAneModelStore
    ) async throws -> KokoroAneSynthesisResult {
        let found = try await prosody(inputIds: inputIds, styleS: styleS, speed: speed, store: store)
        return try await vocode(found, f0: found.f0, styleTimbre: styleTimbre, store: store)
    }

    /// Stages 1-4 (Albert, PostAlbert, Alignment, Prosody): the frames each
    /// id takes and the pitch curve. The durations are fixed here, so no
    /// curve given to `vocode` can change the audio's length. Throws
    /// `nonFiniteModelOutput` on a non-finite point of `F0`.
    public static func prosody(
        inputIds: [Int32],
        styleS: [Float],
        speed: Float = KokoroAneConstants.defaultSpeed,
        store: KokoroAneModelStore
    ) async throws -> KokoroAneProsody {
        guard styleS.count == 128 else {
            throw KokoroAneError.invalidVoicePack("style_s must be length 128, got \(styleS.count)")
        }
        try Task.checkCancellation()
        let tEnc = inputIds.count
        var timings = KokoroAneStageTimings()

        // Build base tensors used by multiple stages.
        let inputIdsArr = try KokoroAneArrays.int32Array(shape: [1, tEnc], from: inputIds)
        let attnMaskArr = try KokoroAneArrays.attentionMask(length: tEnc)
        let styleSArr = try KokoroAneArrays.float16Array(shape: [1, 128], from: styleS)
        let speedArr = try KokoroAneArrays.float16Array(shape: [1], from: [speed])

        // ── 1: Albert ────────────────────────────────────────────────
        let albertModel = try await store.model(for: .albert)
        let albertOut = try await predict(
            stage: .albert, model: albertModel,
            inputs: ["input_ids": inputIdsArr, "attention_mask": attnMaskArr],
            timing: &timings.albert
        )
        let bertDur = try rebuild16(albertOut, key: "bert_dur", stage: .albert)

        // ── 2: PostAlbert ────────────────────────────────────────────
        try Task.checkCancellation()
        let postModel = try await store.model(for: .postAlbert)
        let postOut = try await predict(
            stage: .postAlbert, model: postModel,
            inputs: [
                "bert_dur": bertDur,
                "input_ids": inputIdsArr,
                "style_s": styleSArr,
                "speed": speedArr,
                "attention_mask": attnMaskArr,
            ],
            timing: &timings.postAlbert
        )
        let duration = try outputArray(postOut, key: "duration", stage: .postAlbert)

        // duration → pred_dur (int32, rounded, clamped ≥ 1)
        let predDur = try predictedDurations(from: KokoroAneArrays.readFloats(duration))
        let tA = predDur.reduce(0) { $0 + Int($1) }
        if tA > KokoroAneConstants.maxAcousticFrames {
            throw KokoroAneError.acousticFramesExceedCap(
                have: tA, cap: KokoroAneConstants.maxAcousticFrames)
        }
        let predDurArr = try KokoroAneArrays.int32Array(shape: [1, predDur.count], from: predDur)
        let dArr = try rebuild16(postOut, key: "d", stage: .postAlbert)
        let tEnArr = try rebuild16(postOut, key: "t_en", stage: .postAlbert)

        // ── 3: Alignment ─────────────────────────────────────────────
        try Task.checkCancellation()
        let alignModel = try await store.model(for: .alignment)
        let alignOut = try await predict(
            stage: .alignment, model: alignModel,
            inputs: ["pred_dur": predDurArr, "d": dArr, "t_en": tEnArr],
            timing: &timings.alignment
        )
        let enArr = try rebuild16(alignOut, key: "en", stage: .alignment)
        let asrArr = try rebuild16(alignOut, key: "asr", stage: .alignment)

        // ── 4: Prosody ───────────────────────────────────────────────
        try Task.checkCancellation()
        let prosodyModel = try await store.model(for: .prosody)
        let prosOut = try await predict(
            stage: .prosody, model: prosodyModel,
            inputs: ["en": enArr, "style_s": styleSArr],
            timing: &timings.prosody
        )
        // F0 and N are kept for `vocode`: F0 read fp32 by Noise and fp16 by Vocoder.
        let f0Raw = try outputArray(prosOut, key: "F0", stage: .prosody)
        let nRaw = try outputArray(prosOut, key: "N", stage: .prosody)
        let f0 = KokoroAneArrays.readFloats(f0Raw)
        guard f0.allSatisfy({ $0.isFinite }) else {
            throw KokoroAneError.nonFiniteModelOutput(
                stage: KokoroAneStage.prosody.rawValue, output: "F0")
        }
        return KokoroAneProsody(
            inputIds: inputIds, predictedDurations: predDur, acousticFrames: tA, f0: f0,
            timings: timings, f0Shape: f0Raw.shape.map(\.intValue), n: nRaw, asr: asrArr)
    }

    /// Stages 5-7 (Noise, Vocoder, Tail) on `f0`, a curve of exactly as
    /// many points as `prosody`'s own, fed to Noise (fp32) and the Vocoder
    /// (fp16) in its place. Throws when the point count differs.
    public static func vocode(
        _ prosody: KokoroAneProsody,
        f0: [Float],
        styleTimbre: [Float],
        store: KokoroAneModelStore
    ) async throws -> KokoroAneSynthesisResult {
        guard styleTimbre.count == 128 else {
            throw KokoroAneError.invalidVoicePack(
                "style_timbre must be length 128, got \(styleTimbre.count)")
        }
        guard f0.count == prosody.f0.count else {
            throw KokoroAneError.unexpectedOutputShape(
                stage: KokoroAneStage.noise.rawValue,
                expected: "F0_curve of \(prosody.f0.count) points", got: "\(f0.count)")
        }
        var timings = prosody.timings
        let styleTimbreF32 = try KokoroAneArrays.float32Array(shape: [1, 128], from: styleTimbre)
        let styleTimbreF16 = try KokoroAneArrays.float16Array(shape: [1, 128], from: styleTimbre)

        // ── 5: Noise (fp32 boundary) ─────────────────────────────────
        try Task.checkCancellation()
        let f0F32 = try KokoroAneArrays.float32Array(shape: prosody.f0Shape, from: f0)
        let noiseModel = try await store.model(for: .noise)
        let noiseOut = try await predict(
            stage: .noise, model: noiseModel,
            inputs: ["F0_curve": f0F32, "style_timbre": styleTimbreF32],
            timing: &timings.noise
        )

        // ── 6: Vocoder (fp16 boundary) ───────────────────────────────
        try Task.checkCancellation()
        let f0F16 = try KokoroAneArrays.float16Array(shape: prosody.f0Shape, from: f0)
        let nF16 = try KokoroAneArrays.float16Array(
            shape: prosody.n.shape.map(\.intValue), from: prosody.n)
        let xs0F16 = try rebuild16(noiseOut, key: "x_source_0", stage: .noise)
        let xs1F16 = try rebuild16(noiseOut, key: "x_source_1", stage: .noise)
        let vocoderModel = try await store.model(for: .vocoder)
        let vocOut = try await predict(
            stage: .vocoder, model: vocoderModel,
            inputs: [
                "asr": prosody.asr,
                "F0_curve": f0F16,
                "N_pred": nF16,
                "x_source_0": xs0F16,
                "x_source_1": xs1F16,
                "style_timbre": styleTimbreF16,
            ],
            timing: &timings.vocoder
        )

        // ── 7: Tail (fp32 iSTFT) ─────────────────────────────────────
        try Task.checkCancellation()
        // Discard "anchor"; use only "x_pre".
        let xPreF32 = try rebuild32(vocOut, key: "x_pre", stage: .vocoder)
        let tailModel = try await store.model(for: .tail)
        let tailOut = try await predict(
            stage: .tail, model: tailModel,
            inputs: ["x_pre": xPreF32],
            timing: &timings.tail
        )
        let audioArr = try outputArray(tailOut, key: "audio", stage: .tail)
        let samples = KokoroAneArrays.readFloats(audioArr)

        return KokoroAneSynthesisResult(
            samples: samples,
            sampleRate: KokoroAneConstants.sampleRate,
            encoderTokens: prosody.inputIds.count,
            acousticFrames: prosody.acousticFrames,
            timings: timings,
            inputIds: prosody.inputIds,
            predictedDurations: prosody.predictedDurations
        )
    }

    // MARK: - Helpers

    /// Round PostAlbert `duration` floats to per-token frame counts, clamped
    /// to [1, maxAcousticFrames]. Throws instead of trapping when the model
    /// emits NaN/±inf — broken CoreML runtimes can return non-finite outputs
    /// (iOS 27 betas mis-execute the dynamic-shape stages, issue #738), and
    /// `Int32(Float)` on those values is a fatal error in the host app.
    static func predictedDurations(from durFloats: [Float]) throws -> [Int32] {
        guard durFloats.allSatisfy({ $0.isFinite }) else {
            throw KokoroAneError.nonFiniteModelOutput(
                stage: KokoroAneStage.postAlbert.rawValue, output: "duration")
        }
        let cap = Float(KokoroAneConstants.maxAcousticFrames)
        return durFloats.map { d in
            Int32(min(max(d.rounded(), 1), cap))
        }
    }

    private static func predict(
        stage: KokoroAneStage,
        model: MLModel,
        inputs: [String: MLMultiArray],
        timing: inout Double
    ) async throws -> MLFeatureProvider {
        let provider = try MLDictionaryFeatureProvider(
            dictionary: inputs.mapValues { MLFeatureValue(multiArray: $0) })
        let clock = ContinuousClock()
        let start = clock.now
        do {
            let out = try await model.prediction(from: provider)
            timing = milliseconds(start.duration(to: clock.now))
            return out
        } catch let error as CancellationError {
            // Preserve cancellation semantics — don't bury it as a stage failure.
            throw error
        } catch {
            throw KokoroAneError.predictionFailed(stage: stage.rawValue, underlying: error)
        }
    }

    /// Convert a monotonic `Duration` to milliseconds (1 ms = 1e15 attoseconds).
    private static func milliseconds(_ duration: Duration) -> Double {
        let c = duration.components
        return Double(c.seconds) * 1_000 + Double(c.attoseconds) / 1_000_000_000_000_000
    }

    private static func outputArray(
        _ provider: MLFeatureProvider, key: String, stage: KokoroAneStage
    ) throws -> MLMultiArray {
        guard let value = provider.featureValue(for: key)?.multiArrayValue else {
            throw KokoroAneError.unexpectedOutputShape(
                stage: stage.rawValue, expected: "MLMultiArray for '\(key)'", got: "nil")
        }
        return value
    }

    /// Fetch `key` from `provider` and rebuild as an fp16 MLMultiArray with
    /// the same shape. Single feature-dict lookup (avoids the previous
    /// `outputShape` + `outputArray` double-fetch pattern).
    private static func rebuild16(
        _ provider: MLFeatureProvider, key: String, stage: KokoroAneStage
    ) throws -> MLMultiArray {
        let arr = try outputArray(provider, key: key, stage: stage)
        return try KokoroAneArrays.float16Array(shape: arr.shape.map(\.intValue), from: arr)
    }

    /// Same as `rebuild16` but produces an fp32 MLMultiArray. Used at the
    /// Prosody → Noise and Vocoder → Tail boundaries.
    private static func rebuild32(
        _ provider: MLFeatureProvider, key: String, stage: KokoroAneStage
    ) throws -> MLMultiArray {
        let arr = try outputArray(provider, key: key, stage: stage)
        return try KokoroAneArrays.float32Array(shape: arr.shape.map(\.intValue), from: arr)
    }
}
