import { Array as Arr, Option, Result, Schema } from 'effect';
import { type SceneTimes, momentOf } from './easel.ts';

const JUDGE_MOMENTS = 12;

export const JUDGE_SIZE = 1280;

export const LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

const Register = Schema.Literals(['STORY', 'IDEA']);
type Register = typeof Register.Type;

export class JudgePointUnjudged extends Schema.TaggedError<JudgePointUnjudged>()(
  'JudgePointUnjudged',
  { point: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `the judge cannot judge ${this.point}: ${this.reason}`;
  }
}

export class JudgeNothingToCompare extends Schema.TaggedError<JudgeNothingToCompare>()(
  'JudgeNothingToCompare',
  { scene: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `nothing to judge at scene ${this.scene}: ${this.reason}`;
  }
}

export class JudgePointAmbiguous extends Schema.TaggedError<JudgePointAmbiguous>()(
  'JudgePointAmbiguous',
  { scene: Schema.String, points: Schema.Array(Schema.String) },
) {
  override get message() {
    return `scene ${this.scene} has ${this.points.length} choices to judge: name one with --point (${this.points.join(', ')})`;
  }
}

export class JudgeRuleMissing extends Schema.TaggedError<JudgeRuleMissing>()('JudgeRuleMissing', {
  file: Schema.String,
  heading: Schema.String,
}) {
  override get message() {
    return `${this.file} has no section "${this.heading}": the app's judge rules name it`;
  }
}

export class CounselFailed extends Schema.TaggedError<CounselFailed>()('CounselFailed', {
  dir: Schema.optionalKey(Schema.String),
  reason: Schema.String,
}) {
  override get message() {
    const kept = Option.match(Option.fromUndefinedOr(this.dir), {
      onNone: () => '',
      onSome: (dir) => `; what it printed is under ${dir}`,
    });
    return `the counsel run failed (${this.reason})${kept}`;
  }
}

export class CounselUnreadable extends Schema.TaggedError<CounselUnreadable>()(
  'CounselUnreadable',
  { file: Schema.String, reason: Schema.String },
) {
  override get message() {
    return `the counsel's answer (${this.file}) has no readable ranking: ${this.reason}`;
  }
}

export interface JudgeMoment {
  readonly at: string;
  readonly second: number;
}

export const judgeMoments = (
  scene: SceneTimes,
  fps: number,
  cap: number = JUDGE_MOMENTS,
): ReadonlyArray<JudgeMoment> => {
  const places = [
    ...Object.entries(scene.marks).map(([name, second]) => ({ at: `mark:${name}`, second })),
    ...Object.entries(scene.cues).map(([name, c]) => ({
      at: `cue:${name}@0.5`,
      second: (c.start + c.end) / 2,
    })),
  ]
    .filter((m) => m.second >= 0 && m.second <= scene.dur)
    .flatMap((m) => Option.toArray(Result.getSuccess(momentOf(scene, fps, m.at))))
    .toSorted((a, b) => a.frame - b.frame || a.at.localeCompare(b.at));
  const once = Arr.dedupeWith(places, (a, b) => a.frame === b.frame).map((m): JudgeMoment => ({
    at: m.at,
    second: m.time,
  }));
  if (once.length === 0) return [{ at: (scene.dur / 2).toFixed(2), second: scene.dur / 2 }];
  if (once.length <= cap) return once;
  const picks = Arr.dedupe(
    Arr.makeBy(cap, (i) => Math.round((i * (once.length - 1)) / Math.max(1, cap - 1))),
  );
  return picks.flatMap((i) => Option.toArray(Arr.get(once, i)));
};

export const registersOf = (picture: string): ReadonlyArray<Register> => {
  const head = Option.getOrElse(Arr.head(picture.split(/[:.]/)), () => '');
  if (head.length > 40) return [];
  const words = Option.getOrElse(Option.fromNullishOr(head.match(/\b(?:STORY|IDEA)\b/g)), () => []);
  return Arr.dedupe(Arr.filter(words, Schema.is(Register)));
};

export interface JudgeRule {
  readonly file: string;
  readonly heading: string;
  readonly registers: ReadonlyArray<Register>;
}

export const rulesFor = (
  rules: ReadonlyArray<JudgeRule>,
  registers: ReadonlyArray<Register>,
): ReadonlyArray<JudgeRule> =>
  rules.filter((r) => r.registers.length === 0 || r.registers.some((x) => registers.includes(x)));

const levelOf = (line: string): number =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(/^(#+)\s/.exec(line)), (m) => m[0].trim().length),
    () => 0,
  );

export const sectionOf = (text: string, heading: string): Option.Option<string> => {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.trim() === heading.trim());
  if (at === -1) return Option.none();
  const level = levelOf(heading.trim());
  const rest = lines.slice(at + 1);
  const end = Option.getOrElse(
    Arr.findFirstIndex(rest, (line) => {
      const l = levelOf(line);
      return l > 0 && l <= level;
    }),
    () => rest.length,
  );
  return Option.some([heading.trim(), ...rest.slice(0, end)].join('\n').trim());
};

const KeyedVersion = Schema.Struct({
  label: Schema.String,
  version: Schema.String,
  picked: Schema.Boolean,
  detail: Schema.String,
});
type KeyedVersion = typeof KeyedVersion.Type;

export const JudgeKey = Schema.Struct({
  film: Schema.String,
  scene: Schema.String,
  point: Schema.String,
  at: Schema.String,
  versions: Schema.Array(KeyedVersion),
});
export type JudgeKey = typeof JudgeKey.Type;

export const JudgeKeyJson = Schema.fromJsonString(JudgeKey);

export interface QuotedRule {
  readonly file: string;
  readonly heading: string;
  readonly text: string;
}

interface PacketInput {
  readonly choice: string;
  readonly scene: string;
  readonly say: string;
  readonly picture: string;
  readonly registers: ReadonlyArray<Register>;
  readonly act: Option.Option<string>;
  readonly rules: ReadonlyArray<QuotedRule>;
  readonly moments: ReadonlyArray<JudgeMoment>;
  readonly stills: ReadonlyArray<{ readonly label: string; readonly files: ReadonlyArray<string> }>;
}

const spoken = (say: string) =>
  say
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const packetOf = (input: PacketInput): string => {
  const labels = input.stills.map((s) => s.label);
  const momentRows = input.moments.map((m, i) => {
    const cells = input.stills.map((s) => Option.getOrElse(Arr.get(s.files, i), () => ''));
    return `| ${String(i + 1).padStart(2, '0')} | \`${m.at}\` | ${m.second.toFixed(2)} | ${cells.join(' | ')} |`;
  });
  const each = labels.map(
    (label) =>
      `### ${label}\n- Decided by: <still path> against <rule file> § <heading>\n- <one to three sentences on what the stills show against the rules>`,
  );
  return [
    `# Judge ${labels.length} versions of one scene`,
    '',
    `You are a second opinion on one choice in a narrated storybook explainer film. The ${labels.length} versions below are the same scene, \`${input.scene}\`, drawn the same way but for one choice: ${input.choice}. You see them only by label (${labels.join(', ')}), in an order drawn at random. This review is read-only: edit nothing.`,
    '',
    '## The beat',
    '',
    `- **Register:** ${input.registers.join(', then ') || 'not stated'}`,
    ...Option.toArray(Option.map(input.act, (act) => `- **Act:** ${act}`)),
    `- **What is said:** ${spoken(input.say)}`,
    `- **What the picture does (its brief):** ${input.picture}`,
    '',
    '## The rules that bear on it',
    '',
    ...input.rules.flatMap((r) => [`From \`${r.file}\`:`, '', r.text, '']),
    '## The stills',
    '',
    `Each row is one moment of the scene (a mark's word or a cue's middle), the same frame for every version. Open every still: each is an image file; view it.`,
    '',
    `| # | moment | s | ${labels.join(' | ')} |`,
    `|---|---|---|${labels.map(() => '---').join('|')}|`,
    ...momentRows,
    '',
    '## What to do',
    '',
    '1. View every still above.',
    '2. Judge each version against the rules quoted above, at these moments.',
    '3. Rank the versions, best first. For each version name the still (its file) and the rule (its file and heading) that decides it.',
    '4. When no version earns a preference over another, say so: a tie (`=`) or `no preference` is a sound answer, better than a guess.',
    '5. Judge only what the stills show against the rules: nothing else about the versions is given, and nothing else counts.',
    '',
    'Answer in exactly this form, the ranking line first and nothing else on it:',
    '',
    '```',
    `RANKING: <labels best first, ">" between, "=" for a tie>   (or: RANKING: no preference)`,
    '',
    ...each.flatMap((e) => [e, '']),
    '```',
  ].join('\n');
};

export type Ranking =
  | { readonly _tag: 'Ranked'; readonly tiers: ReadonlyArray<ReadonlyArray<string>> }
  | { readonly _tag: 'NoPreference' };

const RANKING_LINE = /^[\s>*_`-]*RANKING[*_`]*\s*:\s*(.+)$/i;

const LABEL_HEADING = /^(#{2,4})\s*(?:Version\s+)?([A-H])\s*$/i;

const RANKING_EXPRESSION = /^[A-Za-z](?:\s*[>=]\s*[A-Za-z])*$/;

const NO_PREFERENCE = /^no preference$/i;

export const rankingOf = (
  answer: string,
  labels: ReadonlyArray<string>,
): Result.Result<Ranking, string> => {
  const line = Arr.findLast(answer.split('\n'), (l) => RANKING_LINE.test(l));
  if (Option.isNone(line)) return Result.fail('no line starts RANKING:');
  const said = Option.getOrElse(
    Option.flatMap(Option.fromNullishOr(RANKING_LINE.exec(line.value)), (m) =>
      Option.fromUndefinedOr(m[1]),
    ),
    () => '',
  )
    .replace(/[*_`]/g, '')
    .trim();
  if (NO_PREFERENCE.test(said)) return Result.succeed({ _tag: 'NoPreference' });
  if (!RANKING_EXPRESSION.test(said))
    return Result.fail(
      `"${said}" is no whole ranking: labels best first, ">" or "=" between, and nothing else (or: no preference)`,
    );
  const tiers = said
    .split('>')
    .map((tier) => tier.split('=').map((label) => label.trim().toUpperCase()));
  const named = tiers.flat();
  const strange = named.filter((label) => !labels.includes(label));
  if (strange.length > 0) return Result.fail(`"${said}" names ${strange.join(', ')}, no label`);
  const missing = labels.filter((label) => !named.includes(label));
  if (missing.length > 0) return Result.fail(`"${said}" leaves out ${missing.join(', ')}`);
  if (named.length !== labels.length) return Result.fail(`"${said}" names a label twice`);
  return Result.succeed({ _tag: 'Ranked', tiers });
};

const nameOf = (key: JudgeKey, label: string): string =>
  Option.match(
    Arr.findFirst(key.versions, (v) => v.label === label),
    { onNone: () => label, onSome: (v) => v.version },
  );

export const rankingLine = (key: JudgeKey, ranking: Ranking): string => {
  if (ranking._tag === 'NoPreference') return 'no preference';
  return ranking.tiers.map((tier) => tier.map((l) => nameOf(key, l)).join(' = ')).join(' > ');
};

export const pickOf = (key: JudgeKey): Option.Option<KeyedVersion> =>
  Arr.findFirst(key.versions, (v) => v.picked);

const besidePick = (key: JudgeKey, ranking: Ranking): string =>
  Option.match(pickOf(key), {
    onNone: () => "No version is the owner's pick yet.",
    onSome: (pick) => {
      if (ranking._tag === 'NoPreference')
        return `The owner's pick is ${pick.version}; the judge prefers none of the versions to another.`;
      const first = Option.getOrElse(Arr.head(ranking.tiers), (): ReadonlyArray<string> => []);
      if (!first.includes(pick.label))
        return `The owner's pick is ${pick.version}; the judge ranks ${first.map((l) => nameOf(key, l)).join(' and ')} above it.`;
      if (first.length > 1)
        return `The owner's pick is ${pick.version}; the judge ties it first with ${first
          .filter((l) => l !== pick.label)
          .map((l) => nameOf(key, l))
          .join(' and ')}.`;
      return `The owner's pick is ${pick.version}; the judge ranks it first too.`;
    },
  });

interface VerdictInput {
  readonly key: JudgeKey;
  readonly ranking: Ranking;
  readonly answer: string;
  readonly counsel: string;
  readonly packet: string;
}

export const verdictOf = (input: VerdictInput): string => {
  const { key } = input;
  const named = (label: string) => `${nameOf(key, label)} (${label})`;
  const reasons = input.answer
    .split('\n')
    .map((line) =>
      Option.match(Option.fromNullishOr(LABEL_HEADING.exec(line.trim())), {
        onSome: ([, hashes = '###', label = '']) => `${hashes} ${named(label.toUpperCase())}`,
        onNone: () => {
          if (RANKING_LINE.test(line)) return `RANKING: ${rankingLine(key, input.ranking)}`;
          return line;
        },
      }),
    )
    .join('\n')
    .replace(/^```\w*\n?|\n?```\s*$/g, '')
    .trim();
  return [
    `# Judge: ${key.film}, scene ${key.scene}, ${key.point}`,
    '',
    "A blind second opinion beside the owner's pick. The judge writes no choice.",
    '',
    `**Ranking:** ${rankingLine(key, input.ranking)}`,
    '',
    besidePick(key, input.ranking),
    '',
    '## The key',
    '',
    "| label | version | what it is | owner's pick |",
    '|---|---|---|---|',
    ...key.versions.map(
      (v) =>
        `| ${v.label} | ${v.version} | ${v.detail} | ${Arr.filter(['yes'], () => v.picked).join('')} |`,
    ),
    '',
    "## The reasons (the counsel's, each label named)",
    '',
    reasons,
    '',
    '## Where it is',
    '',
    `- The counsel's answer: ${input.counsel}`,
    `- The packet it judged: ${input.packet}`,
    `- Drawn: ${key.at}`,
    '',
  ].join('\n');
};
