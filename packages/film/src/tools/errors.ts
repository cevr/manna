import { Schema } from 'effect';
import { EncoderName } from '../core/encoder.ts';

export class LibraryMissing extends Schema.TaggedError<LibraryMissing>()('LibraryMissing', {
  file: Schema.String,
}) {
  override get message() {
    return `no sound library at ${this.file}; declare one with defineLibrary`;
  }
}

export class SoundUnmade extends Schema.TaggedError<SoundUnmade>()('SoundUnmade', {
  name: Schema.String,
  candidates: Schema.Int,
}) {
  override get message() {
    if (this.candidates > 0)
      return `sound "${this.name}" has ${this.candidates} candidates and none kept; run sfx audition ${this.name}, then sfx keep`;
    return `sound "${this.name}" has no kept variant; run sfx make ${this.name}`;
  }
}

export class SoundFileMissing extends Schema.TaggedError<SoundFileMissing>()('SoundFileMissing', {
  name: Schema.String,
  file: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}": ${this.file} is not on disk; run sfx pull`;
  }
}

export class SoundCorrupt extends Schema.TaggedError<SoundCorrupt>()('SoundCorrupt', {
  name: Schema.String,
  file: Schema.String,
  sha256: Schema.String,
  found: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}": ${this.file} hashes ${this.found.slice(0, 12)}, the lock kept ${this.sha256.slice(0, 12)}; run sfx pull`;
  }
}

export class SoundStale extends Schema.TaggedError<SoundStale>()('SoundStale', {
  name: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}" changed since its variants were made; they still play; run sfx make ${this.name}, then keep new ones`;
  }
}

export class SoundLicence extends Schema.TaggedError<SoundLicence>()('SoundLicence', {
  file: Schema.String,
  licence: Schema.String,
}) {
  override get message() {
    return `${this.file} is ${this.licence}, which may not sit in a public repo; keep it under sounds/files (the private store)`;
  }
}

export class ChangeUnsaid extends Schema.TaggedError<ChangeUnsaid>()('ChangeUnsaid', {
  name: Schema.String,
  how: Schema.Literals(['cut', 'trimmed']),
}) {
  override get message() {
    return `sound "${this.name}" is CC BY and its kept file was ${this.how} on import, but its licence says changed: false; set changed: true so its credit line says so`;
  }
}

export class LibraryCheckFailed extends Schema.TaggedError<LibraryCheckFailed>()(
  'LibraryCheckFailed',
  { errors: Schema.Int, warnings: Schema.Int },
) {
  override get message() {
    return `sfx check failed: ${this.errors} error(s), ${this.warnings} warning(s)`;
  }
}

const SEAM_OF = {
  take: { variant: 'variant', mend: 'pick another take or trim it' },
  seed: { variant: 'seed', mend: 'edit its data until every seed loops' },
} as const;

export class LoopSeam extends Schema.TaggedError<LoopSeam>()('LoopSeam', {
  name: Schema.String,
  of: Schema.Literals(['take', 'seed']),
  variant: Schema.Int,
  db: Schema.Finite,
  click: Schema.Finite,
}) {
  override get message() {
    const { variant, mend } = SEAM_OF[this.of];
    return `bed "${this.name}" ${variant} ${this.variant}: its loop point jumps ${this.db.toFixed(1)} dB with a ${this.click.toFixed(1)}x step; ${mend}`;
  }
}

export class LeadIn extends Schema.TaggedError<LeadIn>()('LeadIn', {
  effect: Schema.String,
  name: Schema.String,
  variant: Schema.Int,
  onset: Schema.Finite,
  hit: Schema.Finite,
}) {
  override get message() {
    return `effect "${this.effect}" (${this.name} variant ${this.variant}): its sound starts ${Math.round(this.onset * 1000)} ms in, so it is heard late on its cue; place it with sync: 'onset' for a sustained sound (its hit, ${this.hit.toFixed(2)} s in, would start it that early), sync: 'hit' for an impact, or keep a tighter take`;
  }
}

export class SoundCreditMissing extends Schema.TaggedError<SoundCreditMissing>()(
  'SoundCreditMissing',
  {
    line: Schema.String,
    roll: Schema.Boolean,
  },
) {
  override get message() {
    if (!this.roll)
      return `the film places a CC BY recording but keeps no credits.ts to roll its line: ${this.line}; roll creditRoll(…, soundCredits(library, sound)) as CREDITS`;
    return `the credit roll does not give the line a CC BY recording the film places owes: ${this.line}; pass soundCredits(library, sound) to creditRoll`;
  }
}

export class SeedSilent extends Schema.TaggedError<SeedSilent>()('SeedSilent', {
  name: Schema.String,
  seed: Schema.Int,
}) {
  override get message() {
    return `sound "${this.name}" seed ${this.seed} renders silent (nothing over BS.1770's -70 LUFS gate), so it plays nothing where it is placed; edit its data until every seed is heard`;
  }
}

export class TimingUnrecorded extends Schema.TaggedError<TimingUnrecorded>()('TimingUnrecorded', {
  name: Schema.String,
  variant: Schema.Int,
}) {
  override get message() {
    return `sound "${this.name}" variant ${this.variant}: no onset or hit in the lock; run sfx describe (free)`;
  }
}

export class CreditsOverCap extends Schema.TaggedError<CreditsOverCap>()('CreditsOverCap', {
  credits: Schema.Int,
  cap: Schema.Int,
}) {
  override get message() {
    return `this run would spend ${this.credits} credits, over the cap of ${this.cap}; make less or raise --cap`;
  }
}

export class PaidUnconfirmed extends Schema.TaggedError<PaidUnconfirmed>()('PaidUnconfirmed', {
  credits: Schema.Int,
}) {
  override get message() {
    return `this make would spend ${this.credits} credits; run it again with --yes`;
  }
}

export class CandidateMissing extends Schema.TaggedError<CandidateMissing>()('CandidateMissing', {
  name: Schema.String,
  index: Schema.Int,
  candidates: Schema.Int,
}) {
  override get message() {
    return `sound "${this.name}" has ${this.candidates} candidates; there is no candidate ${this.index}`;
  }
}

export class VariantMissing extends Schema.TaggedError<VariantMissing>()('VariantMissing', {
  name: Schema.String,
  index: Schema.Int,
  variants: Schema.Int,
}) {
  override get message() {
    return `sound "${this.name}" keeps ${this.variants} variants; there is no variant ${this.index}`;
  }
}

export class TrialInvalid extends Schema.TaggedError<TrialInvalid>()('TrialInvalid', {
  name: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}": the trial's settings are not a declaration: ${this.reason}`;
  }
}

export class StoreCopyFailed extends Schema.TaggedError<StoreCopyFailed>()('StoreCopyFailed', {
  file: Schema.String,
  store: Schema.String,
}) {
  override get message() {
    return `${this.file} was copied to the store at ${this.store}, which then did not hold its bytes`;
  }
}

export class StoreFailed extends Schema.TaggedError<StoreFailed>()('StoreFailed', {
  store: Schema.String,
  op: Schema.String,
  key: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the store at ${this.store} could not ${this.op} ${this.key}: ${this.reason}`;
  }
}

export class StoreKeyTaken extends Schema.TaggedError<StoreKeyTaken>()('StoreKeyTaken', {
  key: Schema.String,
  file: Schema.String,
  store: Schema.String,
}) {
  override get message() {
    return `the store at ${this.store} holds other bytes as ${this.key}; ${this.file} was not sent (--replace sends it over them, or --under keeps it in its own folder)`;
  }
}

export class StoreCredentialsMissing extends Schema.TaggedError<StoreCredentialsMissing>()(
  'StoreCredentialsMissing',
  { bucket: Schema.String, missing: Schema.Array(Schema.String) },
) {
  override get message() {
    let verb = 'are';
    if (this.missing.length === 1) verb = 'is';
    return `the store is the R2 bucket ${this.bucket}, and ${this.missing.join(', ')} ${verb} not set: after the stack is deployed, \`bun run store:keys\` in apps/animations writes them to its .env`;
  }
}

export class SoundKindMismatch extends Schema.TaggedError<SoundKindMismatch>()(
  'SoundKindMismatch',
  { name: Schema.String, kind: Schema.String, wanted: Schema.String },
) {
  override get message() {
    return `sound "${this.name}" is ${this.kind}; this needs a ${this.wanted} one`;
  }
}

export class CutEmpty extends Schema.TaggedError<CutEmpty>()('CutEmpty', {
  name: Schema.String,
  from: Schema.Finite,
  to: Schema.Finite,
  secs: Schema.Finite,
}) {
  override get message() {
    return `the cut ${this.from}-${this.to} s of the recording for "${this.name}" holds none of it: it runs ${this.secs.toFixed(2)} s, and a cut ends after it starts`;
  }
}

export class CodeTrialMissing extends Schema.TaggedError<CodeTrialMissing>()('CodeTrialMissing', {
  name: Schema.String,
  kind: Schema.String,
}) {
  override get message() {
    return `sound "${this.name}" is ${this.kind} and has no code trial: a generated sound has one when it declares code: { sound, variants }, a recorded one when \`sfx fit ${this.name}\` has fitted it`;
  }
}

export class FitRefused extends Schema.TaggedError<FitRefused>()('FitRefused', {
  name: Schema.String,
  kind: Schema.Literals(['generated', 'code', 'kept']),
}) {
  override get message() {
    if (this.kind === 'generated')
      return `sound "${this.name}" is generated: its takes stay private, and a fit would publish a derivative of one; only a recorded sound (CC0, or CC BY with its credit) is fitted`;
    if (this.kind === 'kept')
      return `sound "${this.name}" is code kept from its fit, which it plays: declare it recorded again (its licence stays) to fit it anew, and keep the new trial only when the owner does`;
    return `sound "${this.name}" is code: it has no recording to fit`;
  }
}

export class FitModelInvalid extends Schema.TaggedError<FitModelInvalid>()('FitModelInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} is not an earshot model the fit reads: ${this.reason}`;
  }
}

export class EarshotMissing extends Schema.TaggedError<EarshotMissing>()('EarshotMissing', {
  home: Schema.String,
  reason: Schema.String,
  install: Schema.String,
}) {
  override get message() {
    return `earshot is not ready in ${this.home}: ${this.reason}\ninstall it (once, outside the repo):\n${this.install}`;
  }
}

export class EarshotFailed extends Schema.TaggedError<EarshotFailed>()('EarshotFailed', {
  source: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `earshot could not fit ${this.source}: ${this.reason}`;
  }
}

export class FilmModuleInvalid extends Schema.TaggedError<FilmModuleInvalid>()(
  'FilmModuleInvalid',
  { film: Schema.String, module: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `film "${this.film}": ${this.module} is invalid: ${this.reason}`;
  }
}

export class FileInvalid extends Schema.TaggedError<FileInvalid>()('FileInvalid', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} is invalid: ${this.reason}`;
  }
}

export class SoundMissing extends Schema.TaggedError<SoundMissing>()('SoundMissing', {
  film: Schema.String,
}) {
  override get message() {
    return `film "${this.film}" has no sound.ts`;
  }
}

export class AcceptMismatchUnnamed extends Schema.TaggedError<AcceptMismatchUnnamed>()(
  'AcceptMismatchUnnamed',
  {},
) {
  override get message() {
    return '--accept-mismatch names the beats it accepts (--accept-mismatch a,b); bare, it needs --only';
  }
}

export class ApiKeyMissing extends Schema.TaggedError<ApiKeyMissing>()('ApiKeyMissing', {}) {
  override get message() {
    return 'no ELEVENLABS_API_KEY in env or Keychain';
  }
}

export class SampleRateMismatch extends Schema.TaggedError<SampleRateMismatch>()(
  'SampleRateMismatch',
  { file: Schema.String, rate: Schema.Finite, expected: Schema.Finite },
) {
  override get message() {
    return `${this.file} is at ${this.rate} Hz; the mix runs at ${this.expected} Hz`;
  }
}

export class CuesLate extends Schema.TaggedError<CuesLate>()('CuesLate', {
  count: Schema.Int,
}) {
  override get message() {
    return `${this.count} cue(s) end after their scene`;
  }
}

export class DraftsUnread extends Schema.TaggedError<DraftsUnread>()('DraftsUnread', {
  count: Schema.Int,
}) {
  override get message() {
    return `${this.count} series draft(s) do not read`;
  }
}

export class BrowserMissing extends Schema.TaggedError<BrowserMissing>()('BrowserMissing', {
  executable: Schema.String,
}) {
  override get message() {
    return `no Chrome at ${this.executable}: install Google Chrome or Chromium, or set BUN_CHROME_PATH to its executable`;
  }
}

export class BrowserFailed extends Schema.TaggedError<BrowserFailed>()('BrowserFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the browser failed: ${this.reason}`;
  }
}

export class PreviewServerFailed extends Schema.TaggedError<PreviewServerFailed>()(
  'PreviewServerFailed',
  { reason: Schema.String },
) {
  override get message() {
    return `the player server did not start: ${this.reason}`;
  }
}

export class PageLoadFailed extends Schema.TaggedError<PageLoadFailed>()('PageLoadFailed', {
  url: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `the player did not load at ${this.url}: ${this.reason}`;
  }
}

export class PageError extends Schema.TaggedError<PageError>()('PageError', {
  reason: Schema.String,
}) {
  override get message() {
    return `the film threw in the page: ${this.reason}`;
  }
}

export class PageCrashed extends Schema.TaggedError<PageCrashed>()('PageCrashed', {
  reason: Schema.String,
}) {
  override get message() {
    return `a render page crashed: ${this.reason}`;
  }
}

export class FrameFailed extends Schema.TaggedError<FrameFailed>()('FrameFailed', {
  frame: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `frame ${this.frame} failed: ${this.reason}`;
  }
}

export class LookbookFailed extends Schema.TaggedError<LookbookFailed>()('LookbookFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the look-book failed: ${this.reason}`;
  }
}

export class ContactFailed extends Schema.TaggedError<ContactFailed>()('ContactFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return `the contact sheet failed: ${this.reason}`;
  }
}

export class EncoderMissing extends Schema.TaggedError<EncoderMissing>()('EncoderMissing', {
  reason: Schema.String,
}) {
  override get message() {
    return `the browser cannot encode the film: ${this.reason}`;
  }
}

export class EncodeFailed extends Schema.TaggedError<EncodeFailed>()('EncodeFailed', {
  from: Schema.Int,
  to: Schema.Int,
  reason: Schema.String,
}) {
  override get message() {
    return `frames ${this.from}–${this.to} failed to encode: ${this.reason}`;
  }
}

export class AudioMissing extends Schema.TaggedError<AudioMissing>()('AudioMissing', {
  file: Schema.String,
}) {
  override get message() {
    return `no audio master at ${this.file}; run mix to build it (no API calls)`;
  }
}

export class AudioStale extends Schema.TaggedError<AudioStale>()('AudioStale', {
  file: Schema.String,
  reason: Schema.Literals(['length', 'mixed for another plan']),
  length: Schema.Finite,
  film: Schema.Finite,
}) {
  override get message() {
    if (this.reason === 'mixed for another plan')
      return `the audio master ${this.file} was mixed for another plan than the film's now (its takes, score option, sounds or levels have changed); run mix to rebuild it (no API calls)`;
    return `the audio master ${this.file} runs ${this.length.toFixed(3)}s, the film ${this.film.toFixed(3)}s; run mix to rebuild it (no API calls)`;
  }
}

const FLAG_RULE = { excludes: 'does not go with', needs: 'needs' } as const;

export class FlagsConflict extends Schema.TaggedError<FlagsConflict>()('FlagsConflict', {
  flag: Schema.String,
  rule: Schema.Literals(['excludes', 'needs']),
  other: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `--${this.flag} ${FLAG_RULE[this.rule]} --${this.other}: ${this.reason}`;
  }
}

export class TooManyEncoders extends Schema.TaggedError<TooManyEncoders>()('TooManyEncoders', {
  workers: Schema.Int,
  share: Schema.Boolean,
  max: Schema.Int,
  encoder: EncoderName,
}) {
  override get message() {
    const perPage = 1 + Number(this.share);
    const copy = ' with a share copy'.repeat(Number(this.share));
    const orNoShare = ', or --no-share'.repeat(Number(this.share));
    return `${this.workers} pages${copy} need ${this.workers * perPage} encoders at once, over the ${this.max} ${this.encoder} encoders a render may run; use --workers ${Math.floor(this.max / perPage)} or fewer${orNoShare}`;
  }
}

export class PageRateDiffers extends Schema.TaggedError<PageRateDiffers>()('PageRateDiffers', {
  film: Schema.String,
  page: Schema.Finite,
  declared: Schema.Finite,
}) {
  override get message() {
    return `${this.film}'s page draws at ${this.page} fps, but the film declares ${this.declared} fps (its film.ts's fps): its page must be made at the rate it declares`;
  }
}

export class RangeEmpty extends Schema.TaggedError<RangeEmpty>()('RangeEmpty', {
  from: Schema.Finite,
  to: Schema.Finite,
}) {
  override get message() {
    return `nothing to render between ${this.from}s and ${this.to}s`;
  }
}

export class CheckFailed extends Schema.TaggedError<CheckFailed>()('CheckFailed', {
  errors: Schema.Int,
  warnings: Schema.Int,
}) {
  override get message() {
    return `film check failed: ${this.errors} error(s), ${this.warnings} warning(s)`;
  }
}

export class StoreLocked extends Schema.TaggedError<StoreLocked>()('StoreLocked', {
  file: Schema.String,
}) {
  override get message() {
    return `${this.file} is being changed by another running writer, which held its lock past every try; try again once it is done (its lock is let go the moment that writer exits)`;
  }
}

export class FormatFailed extends Schema.TaggedError<FormatFailed>()('FormatFailed', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: oxfmt failed, the file was left as it was: ${this.reason}`;
  }
}

export class WriteUnverified extends Schema.TaggedError<WriteUnverified>()('WriteUnverified', {
  file: Schema.String,
  target: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.target} did not read back once formatted (${this.reason}); the file was left as it was`;
  }
}

export class NamedFileMissing extends Schema.TaggedError<NamedFileMissing>()('NamedFileMissing', {
  file: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.file} ${this.reason}`;
  }
}

export class TakeAmbiguous extends Schema.TaggedError<TakeAmbiguous>()('TakeAmbiguous', {
  file: Schema.String,
  copies: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.file}, whose put-away copies hold different audio (${this.copies.join(', ')}) and whose name carries no hash to say which it is; restore the one you mean to narration/${this.file} by hand`;
  }
}

export class ApprovalUnnamed extends Schema.TaggedError<ApprovalUnnamed>()('ApprovalUnnamed', {
  film: Schema.String,
  verb: Schema.Literals(['approve', 'withdraw']),
}) {
  override get message() {
    return `name the scenes of ${this.film} to ${this.verb} (--scene id,id), an act (--act name), or every scene (--all)`;
  }
}

export class ProcessTimedOut extends Schema.TaggedError<ProcessTimedOut>()('ProcessTimedOut', {
  command: Schema.String,
  seconds: Schema.Finite,
}) {
  override get message() {
    return `${this.command} did not finish within ${this.seconds} s and was stopped`;
  }
}

export class ChaptersInvalid extends Schema.TaggedError<ChaptersInvalid>()('ChaptersInvalid', {
  film: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.film}: no chapters (${this.reason})`;
  }
}

export class FootageHdr extends Schema.TaggedError<FootageHdr>()('FootageHdr', {
  file: Schema.String,
}) {
  override get message() {
    return `${this.file} is HDR video, which the render cannot conform without shifting its colour; record with HDR off (Settings › Camera › Record Video › HDR Video off) and import that`;
  }
}

export class FootageSilent extends Schema.TaggedError<FootageSilent>()('FootageSilent', {
  file: Schema.String,
}) {
  override get message() {
    return `${this.file} has no sound; a take is cut on what it says (import a clip without --take)`;
  }
}

export class FootageNameTaken extends Schema.TaggedError<FootageNameTaken>()('FootageNameTaken', {
  name: Schema.String,
  file: Schema.String,
}) {
  override get message() {
    return `the footage library already names other bytes "${this.name}"; ${this.file} was not imported (give it a name of its own with --as)`;
  }
}

export class FootageNameInvalid extends Schema.TaggedError<FootageNameInvalid>()(
  'FootageNameInvalid',
  {
    name: Schema.String,
    file: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return `"${this.name}" is no footage name (${this.reason}); ${this.file} was not imported (give --as a name such as why-the-law)`;
  }
}

export class FootageExtInvalid extends Schema.TaggedError<FootageExtInvalid>()(
  'FootageExtInvalid',
  {
    file: Schema.String,
    ext: Schema.String,
    rule: Schema.String,
  },
) {
  override get message() {
    return `${this.file} ends "${this.ext}", which is no extension the library keeps (${this.rule}); rename it and import it again`;
  }
}

export class FootageUnknown extends Schema.TaggedError<FootageUnknown>()('FootageUnknown', {
  name: Schema.String,
  known: Schema.Array(Schema.String),
}) {
  override get message() {
    if (this.known.length === 0)
      return `the footage library has no "${this.name}"; it has nothing yet (film footage import)`;
    return `the footage library has no "${this.name}"; it has ${this.known.join(', ')}`;
  }
}

export class FootageOriginalMissing extends Schema.TaggedError<FootageOriginalMissing>()(
  'FootageOriginalMissing',
  { name: Schema.String, file: Schema.String },
) {
  override get message() {
    return `footage "${this.name}": its original ${this.file} is not on disk; run film footage pull`;
  }
}

export class TalkUnvoiced extends Schema.TaggedError<TalkUnvoiced>()('TalkUnvoiced', {
  film: Schema.String,
}) {
  override get message() {
    return `${this.film} is a talk: its voice is its takes, recorded on camera (film footage import, film footage make), so it has no voice to narrate or stage`;
  }
}

export class NotATalk extends Schema.TaggedError<NotATalk>()('NotATalk', {
  film: Schema.String,
}) {
  override get message() {
    return `${this.film} is not a talk: it has no talk.ts`;
  }
}

export class CacheBusy extends Schema.TaggedError<CacheBusy>()('CacheBusy', {
  folder: Schema.String,
}) {
  override get message() {
    return `a render of the film holds its cache (${this.folder}): prune again once it is done`;
  }
}

export class CacheEscapes extends Schema.TaggedError<CacheEscapes>()('CacheEscapes', {
  folder: Schema.String,
  real: Schema.String,
}) {
  override get message() {
    return `${this.folder} resolves to ${this.real}, outside the film's cache: nothing is read or deleted through a link`;
  }
}

export class CacheUnrecorded extends Schema.TaggedError<CacheUnrecorded>()('CacheUnrecorded', {
  folder: Schema.String,
}) {
  override get message() {
    return `no render has recorded the segments it used in ${this.folder}: render the film once, then prune with --days 0`;
  }
}

export class CacheOutputUnrecorded extends Schema.TaggedError<CacheOutputUnrecorded>()(
  'CacheOutputUnrecorded',
  { outputs: Schema.NonEmptyArray(Schema.String) },
) {
  override get message() {
    return `no record of the segments the newest render of each of these used: ${this.outputs.join(', ')}. Render each again, then prune with --days 0`;
  }
}
