import { Boolean as Bool, Option, Schema } from 'effect';
import { sceneAddress } from '../../core/address.ts';
import { Render, RenderVariantName } from '../../core/catalogue.ts';
import {
  type Asked,
  type FakeRoute,
  type Json,
  file,
  json,
  route,
  text as textAnswer,
} from './harness.ts';

export const STUDIO_FILM = 'toy';

const STUDIO_FOLDER = 'out/toy';

const STUDIO_SET = 'render:scenes:open';

const FILM_AT: Json = { _tag: 'Film' };
const scenesAt = (...ids: ReadonlyArray<string>): Json => ({ _tag: 'Scenes', ids });

const said = (address: Json, text: string, point: Option.Option<string> = Option.none()): Json => ({
  id: `c-${text.length}`,
  address,
  ...Option.match(point, { onNone: () => ({}), onSome: (p) => ({ point: p }) }),
  variant: 'main',
  key: 'k',
  text,
  at: 0,
  onThis: true,
});

const heard = (
  id: string,
  fields: {
    readonly picked?: boolean;
    readonly verbs?: ReadonlyArray<string>;
    readonly media?: Json;
    readonly comments?: ReadonlyArray<Json>;
  } = {},
): Json => ({
  id,
  label: id.slice(0, 12),
  lines: [`${id.slice(0, 12)} · 1.5 s · -14.3 LUFS`],
  state: 'current',
  picked: fields.picked ?? false,
  verbs: fields.verbs ?? [],
  media: fields.media ?? { _tag: 'Heard', alone: true, inPlace: true },
  key: id,
  approval: 'none',
  comments: fields.comments ?? [],
});

const point = (id: string, kind: string, address: Json, variants: ReadonlyArray<Json>): Json => ({
  id,
  kind,
  address,
  title: id,
  lines: [],
  start: 0,
  marks: [],
  variants,
});

const takes = (sound: string, scene: string, seed: string): Json =>
  point(`take:${sound}`, 'take', scenesAt(scene), [
    heard(seed.repeat(64), { picked: true, verbs: ['unpick'] }),
    heard(`${seed}1`.repeat(32), { verbs: ['pick', 'reject'] }),
    heard(`${seed}2`.repeat(32), { verbs: ['pick', 'reject'] }),
  ]);

const choices: Json = {
  film: STUDIO_FILM,
  pictures: ['toy', 'toy.warm'].map((name) => ({
    ref: `${STUDIO_FOLDER}/${name}.mp4`,
    name: `${name}.mp4`,
    size: 2048,
    mtime: 0,
    phone: 'none',
  })),
  points: [
    point('score', 'score', FILM_AT, [
      heard('strings', {
        picked: true,
        comments: [said(FILM_AT, 'warmer in the close', Option.some('score'))],
      }),
      heard('piano', { verbs: ['pick'] }),
      heard('choir', { verbs: ['pick'] }),
    ]),
    point('look:ground', 'look', FILM_AT, [
      heard('now', { picked: true, media: { _tag: 'Unseen' } }),
      heard('light', { verbs: ['pick'], media: { _tag: 'Unseen' } }),
    ]),
    takes('paper.page', 'open', 'a'),
    takes('paper.hum', 'close', 'b'),
    point('take:room.tone', 'take', scenesAt('open', 'close'), [
      heard('c'.repeat(64), { picked: true, verbs: ['unpick'] }),
    ]),
  ],
};

const renderOf = (id: string): Json =>
  Schema.encodeSync(Schema.toCodecJson(Render))({
    address: sceneAddress(id),
    variant: RenderVariantName.make('main'),
    kind: 'video',
    settings: { scale: 1, captions: false },
    stamp: { commit: Option.none(), key: 'k' },
    span: Option.none(),
    files: {
      clip: Option.some(`scenes/${id}/main.mp4`),
      share: Option.none(),
      captions: Option.none(),
      chapters: Option.none(),
      description: Option.none(),
      images: [],
    },
    sound: Option.none(),
    at: 0,
  });

const videoOf = (scene: string): Json => ({
  ref: `${STUDIO_FOLDER}/scenes/${scene}/main.share.mp4`,
  name: 'main.share.mp4',
  size: 1024,
  mtime: 0,
  phone: 'none',
});

const looseOf = (name: string, phone: string): Json => ({
  ref: `${STUDIO_FOLDER}/${name}`,
  name,
  size: 2048,
  mtime: 0,
  phone,
});

const scene = (id: string, state: string) => ({
  scene: id,
  key: 'k',
  state,
  approval: 'none',
  comments: [id].filter((s) => s === 'open').map((s) => said(scenesAt(s), 'hold the page')),
});

const project: Json = {
  project: {
    film: STUDIO_FILM,
    variant: RenderVariantName.make('main'),
    key: 'fk',
    comments: [said(FILM_AT, 'the flow holds')],
    acts: [
      {
        name: 'opening',
        scenes: ['open', 'close'],
        key: 'ak',
        comments: [said({ _tag: 'Act', act: 'opening' }, 'a beat slower')],
      },
    ],
    scenes: [
      { ...scene('open', 'current'), render: renderOf('open') },
      scene('close', 'stale'),
      scene('coda', 'current'),
      scene('end', 'missing'),
    ],
  },
  folder: STUDIO_FOLDER,
  videos: { open: videoOf('open') },
};

const renderSetOf = (versions: ReadonlyArray<string>): Json => ({
  id: STUDIO_SET,
  kind: 'render',
  address: scenesAt('open'),
  title: 'scene open',
  lines: [],
  start: 0,
  marks: [],
  variants: versions.map((id) => ({
    id,
    label: id,
    lines: [`${id} look`],
    state: 'current',
    picked: false,
    verbs: [],
    media: { _tag: 'Seen', video: videoOf('open') },
    key: 'k',
    approval: 'none',
    comments: [id]
      .filter((v) => v === 'main')
      .map(() => said(scenesAt('open'), 'the page lands', Option.some(STUDIO_SET))),
  })),
});

const indexOf = (versions: ReadonlyArray<string>, docs: ReadonlyArray<Json> = []): Json => ({
  folders: [
    {
      ref: STUDIO_FOLDER,
      title: STUDIO_FILM,
      mtime: 0,
      sets: [renderSetOf(versions)],
      videos: [looseOf('take-1.mp4', 'ready'), looseOf('take-2.mp4', 'pending')],
      images: [],
      docs: [...docs],
    },
  ],
});

const STUDIO_PRODUCTION = 'toy-cut';

const productionLedgerWith = (
  later: ReadonlyArray<Json>,
  film: ReadonlyArray<string> = [],
): Json => ({
  production: STUDIO_PRODUCTION,
  ...Object.fromEntries(film.map((f) => ['film', f])),
  title: 'The toy, cut by cut',
  blurb: 'A film in two versions.',
  versions: [
    { at: 0, title: 'First cut' },
    { at: 1000, title: 'Second cut', because: 'The first cut holds: open is approved' },
    ...later,
  ],
  said: [
    { _tag: 'Decided', at: 1000, text: 'The first cut holds', quote: 'ship it' },
    { _tag: 'Asked', at: 1500, text: 'Which cut of the open?', set: 'gone-2026-10-01' },
  ],
  filed: [{ set: 'gone-2026-10-01', version: 1 }],
});

const productionLedger = productionLedgerWith([]);

export const STUDIO_ASK = 'a0123456789';

const askMachine: Json = {
  start: 'pick',
  steps: {
    pick: {
      blocks: [
        { kind: 'heading', text: 'The open, its take' },
        {
          kind: 'prose',
          text: 'Three takes of the open line. The slow one changes the cut after it.',
        },
        {
          kind: 'choose',
          id: 'take',
          label: 'Which take?',
          options: [
            { value: 'warm', label: 'Warm' },
            { value: 'bright', label: 'Bright' },
            { value: 'slow', label: 'Slow' },
          ],
        },
      ],
      next: [{ to: 'why', when: { answer: 'take', is: ['slow'] } }, { to: 'done' }],
    },
    why: {
      blocks: [{ kind: 'free_text', id: 'why', label: 'Why the slow one?' }],
      next: [{ to: 'done' }],
    },
    done: { end: true },
  },
};

export const askRecordWith = (
  state: Json = { _tag: 'Asking', step: 'pick', answers: {} },
  answered: ReadonlyArray<Json> = [],
): Json => ({
  id: STUDIO_ASK,
  title: 'Which take opens the toy?',
  why: 'The open sets the pace of the act.',
  by: 'toy-agent',
  film: STUDIO_FILM,
  created: '2026-10-14T00:00:00.000Z',
  ask: askMachine,
  state,
  answered: [...answered],
});

const askRecord = askRecordWith();

export const STUDIO_PAGE = 'a0123456782';
export const STUDIO_PAGE_TAKES = 'a0123456783';
export const STUDIO_PAGE_PACE = 'a0123456784';

const option = (label: string) => ({ value: label.toLowerCase().replaceAll(' ', '-'), label });

const oneChoice = (
  id: string,
  label: string,
  recommended: string,
  others: ReadonlyArray<string>,
): Json => ({
  start: 'ask',
  steps: {
    ask: {
      blocks: [
        {
          kind: 'choose',
          id,
          label,
          options: [{ ...option(recommended), recommended: true }, ...others.map(option)],
        },
      ],
      next: [{ to: 'done' }],
    },
    done: { end: true },
  },
});

const paceAsking = {
  id: STUDIO_PAGE_PACE,
  page: STUDIO_PAGE,
  title: 'Keep the pace of the open?',
  why: 'The act is timed from it.',
  by: 'toy-agent',
  film: STUDIO_FILM,
  created: '2026-10-17T00:02:00.000Z',
  ask: oneChoice('pace', 'The pace', 'Keep it', ['Slower']),
  state: { _tag: 'Asking', step: 'ask', answers: {} },
  answered: [],
};

const pageAsks: ReadonlyArray<Json> = [
  {
    id: STUDIO_PAGE,
    title: 'What do we call the act?',
    why: 'The act card says it.',
    by: 'toy-agent',
    film: STUDIO_FILM,
    created: '2026-10-17T00:00:00.000Z',
    ask: oneChoice('name', 'Its name', 'The breath', ['The dust']),
    state: {
      _tag: 'Answered',
      step: 'done',
      answers: { name: { kind: 'choose', value: 'the-breath', label: 'The breath' } },
    },
    answered: [{ step: 'ask', values: { name: 'the-breath' }, at: '2026-10-17T00:05:00.000Z' }],
  },
  {
    id: STUDIO_PAGE_TAKES,
    page: STUDIO_PAGE,
    title: 'Which take opens the toy?',
    why: 'The open sets the pace of the act.',
    by: 'toy-agent',
    film: STUDIO_FILM,
    created: '2026-10-17T00:01:00.000Z',
    ask: askMachine,
    state: { _tag: 'Asking', step: 'pick', answers: {} },
    answered: [],
  },
  paceAsking,
];

export const studioPage: Json = { page: STUDIO_PAGE, asks: [...pageAsks] };

export const pacedAsk: Json = {
  ...paceAsking,
  state: {
    _tag: 'Answered',
    step: 'done',
    answers: { pace: { kind: 'choose', value: 'keep-it', label: 'Keep it' } },
  },
  answered: [{ step: 'ask', values: { pace: 'keep-it' }, at: '2026-10-17T00:06:00.000Z' }],
};

export const pacedPage: Json = { page: STUDIO_PAGE, asks: [...pageAsks.slice(0, 2), pacedAsk] };

const pageRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/asks\/a012345678[234]\/page$/, () => json(studioPage)),
  route('GET', /^\/api\/asks\/a012345678[234]$/, (asked) =>
    json(
      pageAsks[
        [STUDIO_PAGE, STUDIO_PAGE_TAKES, STUDIO_PAGE_PACE].findIndex((id) =>
          asked.path.endsWith(`/${id}`),
        )
      ] ?? {},
    ),
  ),
];

export const STUDIO_GUIDED = 'a0123456780';

const STUDIO_NOTES = `${STUDIO_FOLDER}/notes.md`;

const keepIt = (id: string, label: string): Json => ({
  kind: 'choose',
  id,
  label,
  options: [
    { value: 'redo', label: 'Again' },
    { value: 'keep', label: 'Keep it', recommended: true },
  ],
});

const guidedMachine: Json = {
  start: 'script',
  steps: {
    script: {
      title: 'The script',
      blocks: [
        { kind: 'script', series: 'toy-talks', draft: '01-first-breath' },
        keepIt('script', 'Keep the script?'),
      ],
      next: [{ to: 'board' }],
    },
    board: {
      title: 'The Board',
      blocks: [{ kind: 'board', film: STUDIO_FILM }, keepIt('board', 'Keep the Board?')],
      next: [{ to: 'cut' }],
    },
    cut: {
      title: 'The cut',
      blocks: [
        { kind: 'video', ref: `${STUDIO_FOLDER}/take-1.mp4`, at: 2, caption: 'From the turn.' },
        { kind: 'audio', film: STUDIO_FILM, beat: 'open' },
        { kind: 'document', ref: STUDIO_NOTES, caption: 'The notes on the cut.' },
        keepIt('cut', 'Keep the cut?'),
        { kind: 'free_text', id: 'more', label: 'Anything else?' },
      ],
      next: [{ to: 'done' }],
    },
    done: { end: true, text: 'Thank you.' },
  },
};

const guidedRecord: Json = {
  id: STUDIO_GUIDED,
  title: 'Review the toy',
  why: 'Each part goes on to the next stage once kept.',
  by: 'toy-agent',
  film: STUDIO_FILM,
  created: '2026-10-15T00:00:00.000Z',
  ask: guidedMachine,
  state: { _tag: 'Asking', step: 'script', answers: {} },
  answered: [],
};

const STILL = new URL('../../tools/fixtures/still.svg', import.meta.url).pathname;

const guidedBoard: Json = {
  film: STUDIO_FILM,
  panels: [
    {
      id: 'open.title',
      beat: 'open',
      at: 'title',
      tries: [],
      text: { _tag: 'Card', payoff: 'breath' },
    },
    { id: 'open.field', beat: 'open', at: 'field', tries: [] },
    {
      id: 'open.breath',
      beat: 'open',
      at: 'breath',
      tries: [
        {
          n: 1,
          file: 'open.breath.1.png',
          sha256: 'openbreath1',
          made: 'generate',
          refs: [],
          at: '2026-10-15T00:00:00.000Z',
        },
      ],
      kept: 1,
    },
  ],
  approvals: [],
};

export const guidedRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', new RegExp(`^/api/asks/${STUDIO_GUIDED}$`), () => json(guidedRecord)),
  route('GET', /^\/api\/review\/index/, () =>
    json(indexOf(['main', 'warm'], [{ ref: STUDIO_NOTES, name: 'notes.md', size: 64, mtime: 0 }])),
  ),
  route('GET', /^\/api\/review\/files\/out\/toy\/notes\.md/, () =>
    textAnswer('# Notes\n\nThe turn lands **after** the breath.\n', 200),
  ),
  route('GET', /^\/api\/films\/toy\/board$/, () => json(guidedBoard)),
  route('GET', /^\/api\/films\/toy\/board\/files\/open\.breath\.1\.png$/, () => file(STILL)),
  route('GET', /^\/api\/films\/toy\/studio\/takes\/open\/attempts$/, () =>
    json({
      beat: 'open',
      attempts: [
        {
          file: 'open.abc.flac',
          transcript: 'The first thing God gave was breath.',
          wer: 0,
          at: 0,
          duration: 2,
          kept: true,
          current: true,
        },
      ],
    }),
  ),
];

const STUDIO_SERIES = 'toy-talks';
const STUDIO_DRAFT = '01-first-breath';

const draftRecordWith = (say = 'The first thing God {*}gave was breath.'): Json => ({
  series: STUDIO_SERIES,
  draft: STUDIO_DRAFT,
  title: 'The first breath',
  beats: [
    {
      id: '1',
      label: 'Hook',
      say,
      brief: 'A figure of clay on a bench, still.',
      cite: ['Gen 2:7'],
    },
    { id: '2', label: 'Turn', say: 'He spoke, {//1} and it was.', cite: ['Ps 33:9'] },
    { id: '3', label: 'Card', brief: 'The title, on paper.', cite: [] },
  ],
});

const draftRecord = draftRecordWith();

export const draftWrites = (say: string, posted: Array<Asked>): ReadonlyArray<FakeRoute> => {
  let written = false;
  return [
    route('POST', new RegExp(`^/api/series/${STUDIO_SERIES}/${STUDIO_DRAFT}/marks$`), (asked) => {
      posted.push(asked);
      written = true;
      return json(draftRecordWith(say));
    }),
    route('GET', new RegExp(`^/api/series/${STUDIO_SERIES}/${STUDIO_DRAFT}$`), () =>
      json(Bool.match(written, { onTrue: () => draftRecordWith(say), onFalse: () => draftRecord })),
    ),
  ];
};

const takeWord = (text: string, at: number): Json => ({
  text,
  start: at,
  end: at + 0.3,
  voiced: { start: at, end: at + 0.3 },
});

export const draftVoice: Json = {
  film: `${STUDIO_SERIES}/${STUDIO_DRAFT}`,
  spent: 1240,
  cap: 20000,
  beats: [
    {
      id: '1',
      take: {
        _tag: 'Ready',
        file: 'k1.mp3',
        duration: 2.8,
        words: ['The', 'first', 'thing', 'God', 'gave', 'was', 'breath.'].map((w, i) =>
          takeWord(w, i * 0.4),
        ),
      },
    },
    { id: '2', take: { _tag: 'Voicing' } },
  ],
};

export const studioRoutes: ReadonlyArray<FakeRoute> = [
  route('GET', /^\/api\/review\/index/, () => json(indexOf(['main', 'warm']))),
  route('GET', /^\/api\/review\/duration/, () => json({ seconds: 20 })),
  route('GET', /^\/api\/films$/, () => json({ films: [STUDIO_FILM] })),
  route('GET', /^\/api\/films\/toy\/choices$/, () => json(choices)),
  route('GET', /^\/api\/films\/toy\/choices\/check$/, () =>
    json({
      findings: [
        {
          level: 'warning',
          tag: 'Balance',
          message: 'the score sits under the voice',
          address: { part: FILM_AT, time: 2 },
        },
      ],
    }),
  ),
  route('GET', /^\/api\/films\/toy\/check$/, () =>
    json({
      findings: [
        { level: 'warning', tag: 'score', message: 'piano is stale' },
        {
          level: 'warning',
          tag: 'cue',
          message: 'the page turns early',
          address: { part: scenesAt('open'), time: 2 },
        },
      ],
    }),
  ),
  route('GET', /^\/api\/films\/toy\/steps$/, () => json({})),
  route('GET', /^\/api\/films\/toy\/project$/, () => json(project)),
  route('GET', /^\/api\/productions$/, () => json({ productions: [productionLedger] })),
  route('GET', /^\/api\/asks\/a0123456789$/, () => json(askRecord)),
  ...pageRoutes,
  route('GET', /^\/api\/series$/, () =>
    json({
      series: [
        {
          name: STUDIO_SERIES,
          title: 'Toy talks',
          drafts: [{ name: STUDIO_DRAFT, title: 'The first breath' }],
        },
      ],
    }),
  ),
  route('GET', /^\/api\/series\/toy-talks\/01-first-breath$/, () => json(draftRecord)),
  route('GET', /^\/api\/series\/toy-talks\/01-first-breath\/voice$/, () => json(draftVoice)),
];
