import { Array as Arr, Boolean as Bool, Option, Result, Schema } from 'effect';

export interface CritiqueRule {
  readonly file: string;
  readonly heading: string;
}

export interface QuotedSection {
  readonly file: string;
  readonly heading: string;
  readonly text: string;
}

export const CRITIQUE_ASPECTS = [
  'head angle',
  'face',
  'pose',
  'proportion',
  'palette',
  'artifact',
] as const;

export const CritiqueFinding = Schema.Struct({
  figure: Schema.String,
  aspect: Schema.Literals(CRITIQUE_ASPECTS),
  what: Schema.String,
  where: Schema.optionalKey(Schema.String),
});
export type CritiqueFinding = typeof CritiqueFinding.Type;

const CritiqueAnswer = Schema.Struct({ findings: Schema.Array(Schema.Unknown) });

const decodeAnswer = Schema.decodeUnknownResult(Schema.fromJsonString(CritiqueAnswer));
const decodeFinding = Schema.decodeUnknownResult(CritiqueFinding);

export interface CritiqueRead {
  readonly findings: ReadonlyArray<CritiqueFinding>;
  readonly rejected: ReadonlyArray<string>;
}

export interface CritiqueFigure {
  readonly figure: string;
  readonly concept: string;
  readonly scene: string;
  readonly flagged: ReadonlyArray<string>;
  readonly layout: Option.Option<string>;
  readonly boundary: Option.Option<string>;
}

export interface CritiqueStaging {
  readonly panel: Option.Option<{ readonly id: string; readonly image: string }>;
  readonly picture: Option.Option<string>;
}

export const UNSTAGED: CritiqueStaging = { panel: Option.none(), picture: Option.none() };

export const boardFileOf = (staging: CritiqueStaging): Option.Option<string> =>
  Option.map(staging.panel, ({ image }) => `board${image.slice(image.lastIndexOf('.'))}`);

const stagingLines = (staging: CritiqueStaging): ReadonlyArray<string> =>
  Bool.match(Option.isNone(staging.panel) && Option.isNone(staging.picture), {
    onTrue: () => [],
    onFalse: () => [
      '## Where the scene stages them',
      '',
      ...Option.match(
        Option.zipWith(staging.panel, boardFileOf(staging), (p, f) => [p.id, f]),
        {
          onNone: () => [],
          onSome: ([id, file]) => [
            `- The Board panel shown here (${id}): \`${file}\`. Read it with the Read tool.`,
          ],
        },
      ),
      ...Option.match(staging.picture, {
        onNone: () => [],
        onSome: (picture) => [`- The script's picture of this beat: ${picture}`],
      }),
      '',
      "Hold each figure's design (the face, the proportion, the palette of skin and hair) to its concept, and its state (what it wears, what it holds, what it does) to the Board panel and the script's picture. The concept is a model sheet: a robe, a held thing or a gesture this place stages that the concept lacks is not a finding; a state the place stages that the scene does not draw is a finding.",
      '',
    ],
  });

export type CritiqueDrawn = 'scene' | 'sheet' | 'render';

const drawnIn = (drawn: CritiqueDrawn, place: string): string =>
  (drawn === 'sheet' &&
    `Each figure below is one view of a cast sheet (${place}), painted from a concept: the film's rigs are traced from the sheet, so what differs here differs in every scene. Hold each view to its concept in the face, the proportion, the palette, the sleeves and the artifacts, and to its layout's words in the angle and the pose.`) ||
  (drawn === 'render' &&
    `Each figure below is a Rive rig drawn in one view of a cast member's kept sheet (${place}): the concept is that kept view, cut from the sheet the owner kept, and the render is the rig in the pose the view shows, laid in the view's box at the sheet's one scale, with any held thing, seat or table drawn as a plain flat piece. Every scene draws this rig, so what differs here differs in every scene. Hold each render to its kept view in the angle, the face, the pose, the proportion, the palette, the sleeves and the artifacts.`) ||
  `Each figure below was drawn in a film's scene (${place}) from a painted concept.`;

const angleRule = (drawn: CritiqueDrawn): string =>
  (drawn === 'sheet' &&
    "On a sheet each view's turn and tilt are what its layout asks (said under it), never the concept's: an angle is a finding only where the view differs from its layout's words.") ||
  (drawn === 'render' &&
    "The kept view's turn and tilt are the design (its layout's words, said under it, say what it was painted to show): a render turned or tilted otherwise is a finding.") ||
  "A concept's angle is design, never a slip: a different angle is a finding.";

const poseRule = (drawn: CritiqueDrawn): string =>
  (drawn === 'sheet' &&
    ' On a sheet each view holds the gesture its layout asks (said under it): a raised hand, a bow or a lean the layout asks for is never a finding.') ||
  (drawn === 'render' &&
    " The kept view's gesture is the design: a hand placed otherwise, another lean or another gesture is a finding.") ||
  '';

export const critiquePacket = (
  drawn: CritiqueDrawn,
  place: string,
  figures: ReadonlyArray<CritiqueFigure>,
  rules: ReadonlyArray<QuotedSection>,
  staging: CritiqueStaging,
): string =>
  [
    '# Critique: figures against their concepts',
    '',
    `${drawnIn(drawn, place)} Read both crops of each with the Read tool. Both are at 1:1: look at them closely, part by part, before you answer.`,
    '',
    'For each figure, name every difference between the concept and the scene in:',
    '',
    `- **head angle**: the head's turn (front, three-quarter, profile; which way) and its tilt (up, down, to a side). ${angleRule(drawn)}`,
    "- **face**: the face's shape (round, long, the jaw, the chin, the cheek) and its features (the eyes' size, spacing and height, the brows, a nose, the mouth, the beard's shape), and where the hair meets the beard: the concept's head outline runs between them, so a beard that runs into the hair, or hair drawn as beard, is a finding (owner, 2026-10-18).",
    `- **pose**: where each hand is (raised or low, which one), the lean, the gesture. The house hand is a circle at the end of an arm in its sleeve: a hand floating free of the body, with no sleeve to it, is a finding.${poseRule(drawn)}`,
    "- **proportion**: the head against the body, a garment's width and length. The figure's height in heads is not a finding: it comes from the cast's height band.",
    '- **palette**: a colour in the scene the concept does not have, or one it lost (skin, hair, a garment, the shade).',
    '- **artifact**: anything at 1:1 no part should draw: a light line between two pieces, a fill short of the outline with another colour showing in the gap, a point poking past the silhouette, rain or a stroke across the face, a hole, a ragged edge.',
    '',
    "The measure's numbers flagged the rows listed under each figure: check each against the crops, and add what the numbers missed. Say nothing a crop does not show. Name no fix; say what differs.",
    '',
    '## The house rules',
    '',
    ...rules.flatMap((rule) => [`From \`${rule.file}\`:`, '', rule.text, '']),
    ...stagingLines(staging),
    '## The figures',
    '',
    ...figures.flatMap((f) => [
      `### ${f.figure}`,
      '',
      `- The concept: \`${f.concept}\``,
      `- The ${drawn}: \`${f.scene}\``,
      ...Option.match(f.layout, {
        onNone: () => [],
        onSome: (asked) => [`- What the layout asks of it: ${asked}`],
      }),
      ...Option.match(f.boundary, {
        onNone: () => [],
        onSome: (measured) => [
          `- Where the hair meets the beard, as measured: ${measured}. Look at that edge in both crops.`,
        ],
      }),
      '',
      ...Arr.match(f.flagged, {
        onEmpty: () => ['The measure flagged no row.'],
        onNonEmpty: (rows) => ["The measure's flagged rows:", '', ...rows.map((r) => `- ${r}`)],
      }),
      '',
    ]),
    '## Your answer',
    '',
    'Write your reading in prose first, figure by figure. End with one fenced `json` block and nothing after it:',
    '',
    '```json',
    '{"findings": [{"figure": "<name>", "aspect": "head angle", "what": "<the difference, one sentence>", "where": "<where on the figure, optional>"}]}',
    '```',
    '',
    `Each \`figure\` is one of: ${figures.map((f) => `"${f.figure}"`).join(', ')}. Each \`aspect\` is one of: ${CRITIQUE_ASPECTS.map((a) => `"${a}"`).join(', ')}. A figure that matches its concept in every aspect has no finding.`,
    '',
  ].join('\n');

export const findingsOf = (
  answer: string,
  figures: ReadonlyArray<string>,
): Result.Result<CritiqueRead, string> =>
  Option.match(Arr.last([...answer.matchAll(/```json\s*\n([\s\S]*?)\n```/g)]), {
    onNone: () => Result.fail('the answer ends with no ```json block'),
    onSome: (block) =>
      Result.mapBoth(decodeAnswer(block[1] ?? ''), {
        onFailure: (error) => `its json block does not read: ${error.message}`,
        onSuccess: (read) =>
          read.findings.reduce<CritiqueRead>(
            (acc, raw, index) =>
              Result.match(decodeFinding(raw), {
                onFailure: (error) => ({
                  ...acc,
                  rejected: [
                    ...acc.rejected,
                    `finding ${index + 1} does not read: ${error.message}`,
                  ],
                }),
                onSuccess: (finding) =>
                  Option.match(
                    Arr.findFirst(figures, (f) => f.toLowerCase() === finding.figure.toLowerCase()),
                    {
                      onNone: () => ({
                        ...acc,
                        rejected: [
                          ...acc.rejected,
                          `finding ${index + 1} names ${finding.figure}, no figure asked about (${figures.join(', ')})`,
                        ],
                      }),
                      onSome: (figure) => ({
                        ...acc,
                        findings: [...acc.findings, { ...finding, figure }],
                      }),
                    },
                  ),
              }),
            { findings: [], rejected: [] },
          ),
      }),
  });

export const critiqueMarkdown = (
  figure: string,
  place: string,
  read: Result.Result<CritiqueRead, string>,
): string =>
  [
    `### ${figure}: critique (${place})`,
    '',
    ...Result.match(read, {
      onFailure: (why) => [`Skipped: ${why}. The critique fails open: look at the crops yourself.`],
      onSuccess: ({ findings, rejected }) => [
        ...Arr.match(
          findings.filter((f) => f.figure === figure),
          {
            onEmpty: () => ['No finding named this figure.'],
            onNonEmpty: (own) =>
              own.map((f) =>
                [
                  `- **${f.aspect}**: ${f.what}`,
                  ...Option.toArray(Option.map(Option.fromUndefinedOr(f.where), (w) => ` (${w})`)),
                ].join(''),
              ),
          },
        ),
        ...Arr.match(rejected, {
          onEmpty: () => [],
          onNonEmpty: (all) => ['', 'Rejected from the answer:', '', ...all.map((r) => `- ${r}`)],
        }),
      ],
    }),
    '',
  ].join('\n');
