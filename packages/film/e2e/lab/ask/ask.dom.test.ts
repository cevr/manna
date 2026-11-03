import { Array as Arr, Boolean as Bool, Deferred, Effect, Exit, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { pageHref } from '../../../src/core/api.ts';
import { AskRefused } from '../../../src/core/refusals.ts';
import {
  type Asked,
  DESK,
  type FakeRoute,
  type Json,
  PHONE,
  TONE,
  file,
  json,
  later,
  madeBy,
  openAsk,
  refused,
  route,
  told,
  text as textAnswer,
} from '../../../src/lab/fixtures/harness.ts';
import { fitsPhone } from '../../../src/lab/fixtures/phone-fit.ts';
import {
  FOCUS_SHOWN,
  countIs,
  evaluates,
  textHas,
  textIs,
  until,
  waitFor,
} from '../../../src/lab/fixtures/settled.ts';
import {
  STUDIO_ASK,
  STUDIO_FILM,
  STUDIO_GUIDED,
  STUDIO_PAGE,
  STUDIO_PAGE_PACE,
  STUDIO_PAGE_TAKES,
  askRecordWith,
  draftVoice,
  draftWrites,
  guidedRoutes,
  pacedAsk,
  pacedPage,
  studioPage,
  studioRoutes,
} from '../../../src/lab/fixtures/studio-film.ts';
import { ASK_READY, PAGE_READY, SLOW } from '../studio-states.ts';

const ANSWER = new RegExp(`^/api/asks/${STUDIO_ASK}/answer$`);
const STILL_1080 = new URL('../../../src/tools/fixtures/still-1080.svg', import.meta.url).pathname;
const HD_720 = new URL('../../../src/tools/fixtures/hd-720.mp4', import.meta.url).pathname;
const AT_THE_TOP_AT_THE_END = `(() => { scrollTo(0, document.documentElement.scrollHeight); const y = document.querySelector('.sh-header').getBoundingClientRect().bottom + 2; return document.elementFromPoint(innerWidth / 2, y)?.closest('.ak-step')?.dataset.step ?? ''; })()`;
const SCRIPT_ASK = 'a0123456781';
const slow = { kind: 'choose', value: 'slow', label: 'Slow' };
const words = 'It breathes before the cut, so the turn lands.';
const pick = { step: 'pick', values: { take: 'slow' }, at: '2026-10-14T00:01:00.000Z' };
const atWhy = askRecordWith({ _tag: 'Asking', step: 'why', answers: { take: slow } }, [pick]);
const sections = (why: Record<string, string>) => ({
  sections: [
    { step: 'pick', values: { take: 'slow' } },
    { step: 'why', values: why },
  ],
});
const skipped = askRecordWith(
  { _tag: 'Answered', step: 'done', answers: { take: slow, why: { kind: 'skipped' } } },
  [pick, { step: 'why', values: {}, at: '2026-10-14T00:02:00.000Z' }],
);
const done = askRecordWith(
  {
    _tag: 'Answered',
    step: 'done',
    answers: { take: slow, why: { kind: 'free_text', text: words } },
  },
  [
    { step: 'pick', values: { take: 'slow' }, at: '2026-10-14T00:01:00.000Z' },
    { step: 'why', values: { why: words }, at: '2026-10-14T00:02:00.000Z' },
  ],
);
const scriptAsk: Json = {
  id: SCRIPT_ASK,
  title: 'Hear the toy',
  why: 'The script goes to the Board once kept.',
  by: 'toy-agent',
  film: STUDIO_FILM,
  created: '2026-10-15T00:00:00.000Z',
  ask: {
    start: 'script',
    steps: {
      script: {
        title: 'The script',
        blocks: [
          { kind: 'script', film: STUDIO_FILM },
          {
            kind: 'choose',
            id: 'script',
            label: 'Keep the script?',
            options: [
              { value: 'keep', label: 'Keep it', recommended: true, why: 'It is 156 wpm.' },
              { value: 'redo', label: 'Again' },
            ],
          },
        ],
        next: [{ to: 'done' }],
      },
      done: { end: true },
    },
  },
  state: { _tag: 'Asking', step: 'script', answers: {} },
  answered: [],
};
const said = (say: string) => ({
  film: STUDIO_FILM,
  beats: [{ id: '1', say, cite: ['Gen 2:7'] }],
});

describe("an agent's ask on a phone", () => {
  it.live(
    'a choice brings the words it asks for onto the page; one Send sends both; the end shows every answer',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, (asked) => {
            posted.push(asked);
            return json(done);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* evaluates(page, `document.querySelectorAll('.ak-step').length`, 1);
        yield* countIs(page, '.ak-section-h', 0);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-section-h .ak-count')].map((c) => c.textContent.trim())`,
          ['1 of 2', '2 of 2'],
        );
        yield* page.fill('.ak-step[data-step="why"] textarea', words);
        yield* evaluates(page, AT_THE_TOP_AT_THE_END, 'why');
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', words);
        yield* textHas(page, '.ak-outcome [data-answer="take"]', 'Slow');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([sections({ why: words })]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an ask that names no film: at its end its last section still holds the top',
    () =>
      Effect.gen(function* () {
        const { film: _film, ...noFilm } = askRecordWith() as Record<string, Json>;
        const { page, errors } = yield* openAsk(
          [
            route('GET', new RegExp(`^/api/asks/${STUDIO_ASK}$`), () => json(noFilm)),
            ...studioRoutes,
          ],
          { href: pageHref.ask(STUDIO_ASK), viewport: PHONE },
        );
        yield* waitFor(page, `.sh[data-film="false"] ${ASK_READY}`);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* evaluates(page, AT_THE_TOP_AT_THE_END, 'why');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'answers not sent come back after a reload; a send that lands leaves the tab nothing to bring back',
    () =>
      Effect.gen(function* () {
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, () => json(done)),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* page.fill('.ak-step[data-step="why"] textarea', words);
        yield* page.reload;
        yield* waitFor(page, '.ak-option[data-value="slow"][aria-pressed="true"]');
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="why"] textarea')?.value`,
          words,
        );
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', words);
        yield* page.reload;
        yield* waitFor(page, ASK_READY);
        yield* textHas(page, '.ak-send [data-role="answered"]', '0 of 1 answered');
        yield* countIs(page, '.ak-option[aria-pressed="true"]', 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'the words, optional, go with nothing in them; the field says so and the end says skipped',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, (asked) => {
            posted.push(asked);
            return json(skipped);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* textHas(
          page,
          '.ak-step[data-step="why"] .ak-legend',
          'Why the slow one? (optional)',
        );
        yield* page.click('.ak-option[data-value="warm"]');
        yield* evaluates(page, `document.querySelectorAll('.ak-step[data-step="why"]').length`, 0);
        yield* page.click('.ak-option[data-value="slow"]');
        yield* waitFor(page, '.ak-step[data-step="why"] textarea');
        yield* page.click(ASK_READY);
        yield* textHas(page, '.ak-outcome [data-answer="why"]', 'Skipped');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([sections({})]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'an answer refused is read again, where the ask now is, and the refusal said',
    () =>
      Effect.gen(function* () {
        let reads = 0;
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, () =>
            refused(AskRefused.make({ id: STUDIO_ASK, reason: 'step pick is answered already' })),
          ),
          route('GET', new RegExp(`^/api/asks/${STUDIO_ASK}$`), () => {
            reads += 1;
            return json(
              Bool.match(reads === 1, { onTrue: () => askRecordWith(), onFalse: () => atWhy }),
            );
          }),
          ...studioRoutes,
        ];
        const { page } = yield* openAsk(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* page.click('.ak-option[data-value="warm"]');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-step[data-step="why"]');
        yield* textHas(page, '.ak-send', 'step pick is answered already');
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a Send with a question open sends nothing: it goes to the question, marks it and says what it needs',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', ANSWER, (asked) => {
            posted.push(asked);
            return json(done);
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(STUDIO_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* textHas(page, '.ak-send [data-role="answered"]', '0 of 1 answered');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-field[data-answer="take"][data-invalid="true"]');
        yield* textIs(page, '.ak-field[data-answer="take"] .ak-unanswered', 'Needs a choice');
        yield* textHas(page, '.ak-send [data-role="answered"]', 'Which take? needs a choice');
        yield* evaluates(
          page,
          `document.querySelector('.ak-field[data-answer="take"]').contains(document.activeElement)`,
          true,
        );
        yield* page.click('.ak-option[data-value="warm"]');
        yield* evaluates(
          page,
          `document.querySelectorAll('.ak-field[data-invalid="true"], .ak-unanswered').length`,
          0,
        );
        yield* textHas(page, '.ak-send [data-role="answered"]', '1 of 1 answered');
        expect(posted).toEqual([]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a film's script under review is its Script reader: named by its film, its take heard, and Stress writes script.ts",
    () =>
      Effect.gen(function* () {
        const marked: Array<Asked> = [];
        let reads = 0;
        const readAgain = Deferred.makeUnsafe<void>();
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () => {
            reads += 1;
            return told(
              Effect.when(Deferred.done(readAgain, Exit.void), Effect.succeed(reads > 1)),
              json(
                said(
                  Bool.match(reads === 1, {
                    onTrue: () => 'The first thing God {*}gave was breath.',
                    onFalse: () => 'The first thing {*}God {*}gave was breath.',
                  }),
                ),
              ),
            );
          }),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => json(draftVoice)),
          route('POST', /^\/api\/films\/toy\/script\/marks$/, (asked) => {
            marked.push(asked);
            return json({ file: 'script.ts', target: 'marks of 1', findings: [] });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* textHas(page, '[data-role="script-name"]', `The script of ${STUDIO_FILM}`);
        yield* textHas(page, '.ak-rec-why', 'Recommended: It is 156 wpm.');
        yield* waitFor(page, '.lab-script-beat[data-beat="1"] [data-act="hear-beat"]');
        yield* waitFor(page, '[data-act="hear-script"]');
        yield* page.click('.lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]');
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* Deferred.await(readAgain);
        yield* evaluates(
          page,
          `document.querySelector('.lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]').dataset.stress`,
          'true',
        );
        expect(marked.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            beat: '1',
            read: {
              spoken: 'The first thing God gave was breath.',
              marks: [{ _tag: 'Stress', word: 4 }],
            },
            marks: [
              { _tag: 'Stress', word: 3 },
              { _tag: 'Stress', word: 4 },
            ],
          },
        ]);
        yield* fitsPhone(page);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a second mark made before the line is read again stands on the first: the page carries the line as its own write left it',
    () =>
      Effect.gen(function* () {
        const marked: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () =>
            json(said('The first thing God {*}gave was breath.')),
          ),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => json(draftVoice)),
          route('POST', /^\/api\/films\/toy\/script\/marks$/, (asked) => {
            marked.push(asked);
            return json({ file: 'script.ts', target: 'marks of 1', findings: [] });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        const word = (i: number) =>
          `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${i}"]`;
        yield* page.click(word(3));
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* waitFor(page, `${word(3)}[data-stress="true"]`);
        yield* page.click(word(6));
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* waitFor(page, `${word(6)}[data-stress="true"]`);
        const spoken = 'The first thing God gave was breath.';
        const stress = (w: number) => ({ _tag: 'Stress', word: w });
        expect(marked.map((p) => Option.getOrNull(p.body))).toEqual([
          { beat: '1', read: { spoken, marks: [stress(4)] }, marks: [stress(3), stress(4)] },
          {
            beat: '1',
            read: { spoken, marks: [stress(3), stress(4)] },
            marks: [stress(3), stress(4), stress(6)],
          },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a line put back elsewhere to the marks the page read before its own write shows as put back',
    () =>
      Effect.gen(function* () {
        const SAY = {
          M0: 'The first thing God {*}gave was breath.',
          M1: 'The first thing {*}God {*}gave was breath.',
        } as const;
        let line: keyof typeof SAY = 'M0';
        const readBack = Deferred.makeUnsafe<void>();
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () =>
            told(
              Effect.when(Deferred.done(readBack, Exit.void), Effect.succeed(line === 'M1')),
              json(said(SAY[line])),
            ),
          ),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => {
            const [first, ...rest] = (draftVoice as { beats: ReadonlyArray<Json> }).beats;
            const take = (first as { take: Record<string, Json> }).take;
            return json({
              ...(draftVoice as Record<string, Json>),
              beats: [{ id: '1', take: { ...take, file: `k-${line}.mp3` } }, ...rest],
            });
          }),
          route('POST', /^\/api\/films\/toy\/script\/marks$/, () => {
            line = 'M1';
            return json({ file: 'script.ts', target: 'marks of 1', findings: [] });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        const word = (i: number) =>
          `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${i}"]`;
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        yield* page.click(word(3));
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* waitFor(page, `${word(3)}[data-stress="true"]`);
        yield* Deferred.await(readBack);
        line = 'M0';
        yield* countIs(page, `${word(3)}[data-stress="true"]`, 0);
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW * 2,
  );

  it.live(
    "a line put back before the takes read past the page's own write land shows as put back",
    () =>
      Effect.gen(function* () {
        const SAY = {
          M0: 'The first thing God {*}gave was breath.',
          M1: 'The first thing {*}God {*}gave was breath.',
        } as const;
        let line: keyof typeof SAY = 'M0';
        let written = false;
        const [readBack, takesAsked, putBackDone] = [
          Deferred.makeUnsafe<void>(),
          Deferred.makeUnsafe<void>(),
          Deferred.makeUnsafe<void>(),
        ];
        const takes = () => {
          const [first, ...rest] = (draftVoice as { beats: ReadonlyArray<Json> }).beats;
          const take = (first as { take: Record<string, Json> }).take;
          return json({
            ...(draftVoice as Record<string, Json>),
            beats: [{ id: '1', take: { ...take, file: `k-${line}.mp3` } }, ...rest],
          });
        };
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () =>
            told(
              Effect.when(Deferred.done(readBack, Exit.void), Effect.succeed(line === 'M1')),
              json(said(SAY[line])),
            ),
          ),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => {
            if (!written) return takes();
            return told(
              Deferred.done(takesAsked, Exit.void),
              later(putBackDone, madeBy(Effect.sync(takes))),
            );
          }),
          route('POST', /^\/api\/films\/toy\/script\/marks$/, () => {
            line = 'M1';
            written = true;
            return json({ file: 'script.ts', target: 'marks of 1', findings: [] });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        const word = (i: number) =>
          `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${i}"]`;
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        yield* page.click(word(3));
        yield* page.click('.lab-script-delivery [data-act="stress-words"]');
        yield* waitFor(page, `${word(3)}[data-stress="true"]`);
        yield* Deferred.await(readBack);
        yield* Deferred.await(takesAsked);
        line = 'M0';
        yield* Deferred.done(putBackDone, Exit.void);
        yield* countIs(page, `${word(3)}[data-stress="true"]`, 0);
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "a line changed under the reader is read again once the voice's poll sees its take change",
    () =>
      Effect.gen(function* () {
        let polls = 0;
        const routes: ReadonlyArray<FakeRoute> = [
          route('GET', new RegExp(`^/api/asks/${SCRIPT_ASK}$`), () => json(scriptAsk)),
          route('GET', /^\/api\/films\/toy\/script$/, () => {
            if (polls > 1) return json(said('The first thing {*}God gave was breath.'));
            return json(said('The first thing God {*}gave was breath.'));
          }),
          route('GET', /^\/api\/films\/toy\/script\/voice$/, () => {
            polls += 1;
            if (polls === 1) return json(draftVoice);
            const [first, ...rest] = (draftVoice as { beats: ReadonlyArray<Json> }).beats;
            const take = (first as { take: Record<string, Json> }).take;
            return json({
              ...(draftVoice as Record<string, Json>),
              beats: [{ id: '1', take: { ...take, file: 'k1-marked.mp3' } }, ...rest],
            });
          }),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(SCRIPT_ASK),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        const word = (i: number) =>
          `.lab-script-beat[data-beat="1"] .lab-script-w[data-index="${i}"]`;
        yield* waitFor(page, `${word(4)}[data-stress="true"]`);
        yield* waitFor(page, `${word(3)}[data-stress="true"]`);
        yield* countIs(page, `${word(4)}[data-stress="true"]`, 0);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a guided review: each section its material in place, then its question; the recommendation first; it fits a phone',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const marked: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', new RegExp(`^/api/asks/${STUDIO_GUIDED}/answer$`), (asked) => {
            posted.push(asked);
            return json(askRecordWith({ _tag: 'Answered', step: 'done', answers: {} }));
          }),
          ...draftWrites('The first thing {*}God {*}gave was breath.', marked),
          route('GET', /^\/api\/review\/(files|phone)\/out\/toy\/take-1\.mp4/, () => file(HD_720)),
          ...guidedRoutes,
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: PHONE,
        });
        yield* waitFor(page, ASK_READY);
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-section-h')].map((h) => h.textContent)`,
          ['1 of 3 · The script', '2 of 3 · The Board', '3 of 3 · The cut'],
        );
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-index-go')].map((b) => b.textContent)`,
          ['1 · The script', '2 · The Board', '3 · The cut'],
        );
        yield* textHas(page, '.ak-send [data-role="answered"]', '0 of 3 answered');
        yield* textHas(
          page,
          '.ak-step[data-step="script"] [data-role="script-name"]',
          'The first breath',
        );
        yield* waitFor(
          page,
          '.ak-step[data-step="script"] .lab-script-beat[data-beat="1"] .lab-script-w',
        );
        yield* textHas(page, '.ak-step[data-step="script"] .lab-script-pace', '156 wpm');
        yield* evaluates(
          page,
          `getComputedStyle(document.querySelector('.ak-step[data-step="board"] legend')).fontSize === getComputedStyle(document.querySelector('.ak-step[data-step="board"] .ak-section-h')).fontSize`,
          true,
        );
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="script"] .lab-script-hear .sh-icon') !== null`,
          true,
        );
        yield* textHas(page, '.ak-step[data-step="script"] .lab-script-spend', 'takes ready');
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="script"] .lab-script-spend').textContent.includes('characters today')`,
          false,
        );
        yield* page.click(
          '.ak-step[data-step="script"] .lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]',
        );
        yield* page.click(
          '.ak-step[data-step="script"] .lab-script-delivery [data-act="stress-words"]',
        );
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="script"] .lab-script-beat[data-beat="1"] .lab-script-w[data-index="3"]').dataset.stress`,
          'true',
        );
        expect(marked.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            beat: '1',
            read: {
              spoken: 'The first thing God gave was breath.',
              marks: [{ _tag: 'Stress', word: 4 }],
            },
            marks: [
              { _tag: 'Stress', word: 3 },
              { _tag: 'Stress', word: 4 },
            ],
          },
        ]);
        yield* countIs(page, '.ak-head [data-role="status"]', 0);
        yield* textHas(page, '.ak-step[data-step="board"] [data-panel="open.title"]', 'breath');
        yield* textHas(page, '.ak-step[data-step="board"] [data-panel="open.field"]', 'no try yet');
        yield* waitFor(page, '.ak-step[data-step="cut"] [data-material="video"] video');
        yield* textHas(
          page,
          '.ak-step[data-step="cut"] [data-material="video"] figcaption',
          'From the turn.',
        );
        yield* waitFor(page, '.ak-step[data-step="cut"] [data-material="audio"] audio');
        yield* textHas(page, '.ak-step[data-step="cut"] .ak-heard', 'The first thing God gave');
        yield* textHas(
          page,
          '.ak-step[data-step="cut"] [data-material="document"]',
          'The turn lands',
        );
        yield* evaluates(
          page,
          `[...document.querySelectorAll('.ak-step[data-step="board"] .ak-option')].map((o) => o.dataset.value)`,
          ['keep', 'redo'],
        );
        yield* textHas(
          page,
          '.ak-step[data-step="board"] .ak-option[data-value="keep"] .sh-badge',
          'recommended',
        );
        yield* evaluates(
          page,
          `document.querySelector('${ASK_READY}').hasAttribute('data-primary')`,
          true,
        );
        yield* page.focus('.ak-step[data-step="board"] .ak-option[data-value="keep"]');
        yield* evaluates(page, FOCUS_SHOWN, 'ring');
        yield* page.click('.ak-index-go[data-step="board"]');
        yield* evaluates(
          page,
          `document.activeElement === document.querySelector('.ak-step[data-step="board"] .ak-section-h') && Math.round(document.querySelector('.ak-step[data-step="board"]').getBoundingClientRect().top) === Math.round(document.querySelector('.sh-header').getBoundingClientRect().bottom)`,
          true,
        );
        yield* evaluates(
          page,
          `document.querySelector('.ak-step[data-step="cut"] [data-material="video"] video').videoWidth`,
          1280,
        );
        yield* evaluates(page, 'document.documentElement.scrollWidth === innerWidth', true);
        yield* fitsPhone(page);
        yield* evaluates(page, AT_THE_TOP_AT_THE_END, 'cut');
        const cut = '.ak-step[data-step="cut"] [data-material="video"]';
        yield* evaluates(
          page,
          `((b) => b !== null && !b.hasAttribute('data-primary') && b.getBoundingClientRect().height >= 44)(document.querySelector('${cut} .rv-big'))`,
          true,
        );
        for (const step of ['script', 'board', 'cut'])
          yield* page.click(`.ak-step[data-step="${step}"] .ak-option[data-value="keep"]`);
        yield* textHas(page, '.ak-send [data-role="answered"]', '3 of 3 answered');
        yield* page.click(ASK_READY);
        yield* waitFor(page, '.ak-outcome');
        yield* textIs(page, '.ak-head [data-role="status"]', 'answered');
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          {
            sections: [
              { step: 'script', values: { script: 'keep' } },
              { step: 'board', values: { board: 'keep' } },
              { step: 'cut', values: { cut: 'keep' } },
            ],
          },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a laptop the script's words start on the column's edge with the band's, and the dock ends on the window's bottom",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openAsk([...guidedRoutes, ...studioRoutes], {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: DESK,
        });
        yield* waitFor(page, ASK_READY);
        yield* waitFor(page, '.ak-step[data-step="script"] .lab-script-beat');
        const left = (selector: string) =>
          `Math.round(document.querySelector('${selector}').getBoundingClientRect().left)`;
        const textLeft = (selector: string) =>
          `((el) => Math.round(el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft)))(document.querySelector('${selector}'))`;
        yield* evaluates(
          page,
          `[${textLeft('.ak-step[data-step="script"] .ak-section-h')}, ${textLeft('.ak-step[data-step="script"] .ak-mat-name')}, ${textLeft('.ak-step[data-step="script"] .lab-script-beat')}, ${left('.ak-step[data-step="board"] .ak-board')}].every((x, _, all) => x === all[0])`,
          true,
        );
        yield* evaluates(
          page,
          `Math.round(document.querySelector('.ak-step[data-step="script"] .ak-section-h').getBoundingClientRect().width) === Math.round(document.querySelector('.ak-step[data-step="script"] .lab-script-beat').getBoundingClientRect().width)`,
          true,
        );
        yield* evaluates(
          page,
          `(scrollTo(0, document.documentElement.scrollHeight), Math.round(innerHeight - document.querySelector('.ak-send').getBoundingClientRect().bottom))`,
          0,
        );
        const right = (selector: string) =>
          `Math.round(document.querySelector('${selector}').getBoundingClientRect().right)`;
        yield* evaluates(
          page,
          `[${left('.ak-send [data-role="answered"]')} === ${left('.ak-step[data-step="board"] .ak-board')}, ${right('.ak-send [data-act="send"]')} === ${right('.ak-step[data-step="board"] .ak-board')}]`,
          [true, true],
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a long document is clamped near its question, Read all opens it whole, and words typed leave it and the index as they are',
    () =>
      Effect.gen(function* () {
        const long = Array.from(
          { length: 60 },
          (_, i) => `Paragraph ${i + 1}: the turn lands after the breath, and the page waits.`,
        ).join('\n\n');
        const { page, errors } = yield* openAsk(
          [
            route('GET', /^\/api\/review\/files\/out\/toy\/notes\.md/, () =>
              textAnswer(`# Notes\n\n${long}\n`, 200),
            ),
            ...guidedRoutes,
            ...studioRoutes,
          ],
          { href: pageHref.ask(STUDIO_GUIDED), viewport: PHONE },
        );
        const doc = '.ak-step[data-step="cut"] [data-material="document"]';
        yield* textHas(page, doc, 'Paragraph 60');
        yield* waitFor(page, `${doc} .ak-clamp[data-open="false"][data-long="true"]`);
        yield* evaluates(
          page,
          `((c) => c.scrollHeight > c.clientHeight * 2 && c.clientHeight < innerHeight)(document.querySelector('${doc} .ak-clamp'))`,
          true,
        );
        yield* textIs(page, `${doc} .ak-doc + .ak-mat-cap`, 'The notes on the cut.');
        yield* evaluates(
          page,
          `((d) => getComputedStyle(d).maskImage === 'none' && d.lastElementChild.matches('[data-act="read-all"]'))(document.querySelector('${doc} .ak-doc'))`,
          true,
        );
        const toggle = `${doc} [data-act="read-all"]`;
        yield* page.click(toggle);
        yield* waitFor(page, `${doc} .ak-clamp[data-open="true"]`);
        yield* textIs(page, toggle, 'Show less');
        yield* evaluates(
          page,
          `document.activeElement === document.querySelector('${toggle}')`,
          true,
        );
        yield* evaluates(
          page,
          `document.querySelector('${toggle}').getAttribute('aria-expanded')`,
          'true',
        );
        yield* evaluates(
          page,
          `((c) => c.scrollHeight <= c.clientHeight + 1)(document.querySelector('${doc} .ak-clamp'))`,
          true,
        );
        yield* page.evaluate(
          `document.querySelector('${toggle}').scrollIntoView({ block: 'center' })`,
        );
        yield* page.click(toggle);
        yield* waitFor(page, `${doc} .ak-clamp[data-open="false"][data-long="true"]`);
        yield* textIs(page, toggle, 'Read all');
        yield* evaluates(
          page,
          `document.activeElement === document.querySelector('${toggle}')`,
          true,
        );
        yield* evaluates(
          page,
          `((t) => t >= document.querySelector('.sh-header').getBoundingClientRect().bottom && t < innerHeight)(document.querySelector('${doc} .ak-doc').getBoundingClientRect().top)`,
          true,
        );
        yield* page.click(toggle);
        yield* waitFor(page, `${doc} .ak-clamp[data-open="true"]`);
        yield* page.evaluate(
          `(window.__indexGo = document.querySelector('.ak-index-go[data-step="cut"]'), true)`,
        );
        yield* page.fill('.ak-step[data-step="cut"] textarea', 'a');
        yield* page.fill('.ak-step[data-step="cut"] textarea', 'ab');
        yield* evaluates(
          page,
          `window.__indexGo !== null && window.__indexGo === document.querySelector('.ak-index-go[data-step="cut"]')`,
          true,
        );
        yield* waitFor(page, `${doc} .ak-clamp[data-open="true"]`);
        yield* fitsPhone(page);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'a Board still opens full size on an ask, its place in the link, and Escape or a tap closes it',
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openAsk([...guidedRoutes, ...studioRoutes], {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: PHONE,
        });
        const thumb = '.ak-step[data-step="board"] [data-panel="open.breath"] .rv-zoom';
        yield* waitFor(page, thumb);
        for (const close of ['key', 'tap'] as const) {
          yield* page.click(thumb);
          yield* textIs(page, '.rv-lightbox .rv-lightbox-caption', 'open · breath');
          yield* until(
            page,
            `(() => {
              const still = document.querySelector('.rv-lightbox img').getBoundingClientRect();
              const caption = document.querySelector('.rv-lightbox-caption').getBoundingClientRect();
              return caption.top - still.bottom <= 12 && caption.bottom <= innerHeight;
            })()`,
          );
          yield* until(page, "location.search === '?still=board-open.breath'");
          if (close === 'key') yield* page.press('Escape');
          else yield* page.click('.rv-lightbox');
          yield* until(page, "document.querySelector('.rv-lightbox') === null");
          yield* until(page, "location.search === ''");
        }
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "on a laptop a Board still's caption sits clear above the dimmed dock under the scrim",
    () =>
      Effect.gen(function* () {
        const tall = route('GET', /^\/api\/films\/toy\/board\/files\/open\.breath\.1\.png$/, () =>
          file(STILL_1080),
        );
        const { page, errors } = yield* openAsk([tall, ...guidedRoutes, ...studioRoutes], {
          href: pageHref.ask(STUDIO_GUIDED),
          viewport: DESK,
        });
        const thumb = '.ak-step[data-step="board"] [data-panel="open.breath"] .rv-zoom';
        yield* waitFor(page, thumb);
        yield* page.click(thumb);
        yield* textIs(page, '.rv-lightbox .rv-lightbox-caption', 'open · breath');
        yield* until(
          page,
          `(() => {
            const still = document.querySelector('.rv-lightbox img').getBoundingClientRect();
            const caption = document.querySelector('.rv-lightbox-caption').getBoundingClientRect();
            const dock = document.querySelector('.ak-send').getBoundingClientRect();
            return still.height > 0 && caption.top - still.bottom <= 12 && dock.top - caption.bottom >= 8;
          })()`,
        );
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

const PARTS = `[...document.querySelectorAll('.akp .ak')].map((a) => a.dataset.ask)`;
const inView = (ask: string) =>
  `(() => { const top = document.querySelector('.ak[data-ask="${ask}"]').getBoundingClientRect().top; const under = document.querySelector('.sh-header').getBoundingClientRect().bottom; return top >= under - 4 && top <= innerHeight * 2 / 3; })()`;
const sendReached = (ask: string) =>
  `(() => { const send = document.querySelector('.ak[data-ask="${ask}"] .ak-send [data-act="send"]'); send.scrollIntoView({ block: 'center' }); const r = send.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('[data-act="send"]') === send; })()`;
const takenTo = (ask: string) =>
  `(() => { const top = document.querySelector('.ak[data-ask="${ask}"]').getBoundingClientRect().top; const under = document.querySelector('.sh-header').getBoundingClientRect().bottom; return Math.abs(top - under) <= 4; })()`;

describe('a page of asks', () => {
  for (const [width, viewport] of [
    ['phone', PHONE],
    ['laptop', DESK],
  ] as const)
    it.live(
      `on a ${width}: the asks in the order made under one count, the answered one folded, the first asking in view`,
      () =>
        Effect.gen(function* () {
          const { page, errors } = yield* openAsk(studioRoutes, {
            href: pageHref.askPage(STUDIO_PAGE),
            viewport,
          });
          yield* waitFor(page, PAGE_READY);
          yield* textIs(page, '.akp-head h1', '3 asks from toy-agent');
          yield* textIs(page, '.akp-count', '1 of 3 answered');
          yield* evaluates(page, PARTS, [STUDIO_PAGE, STUDIO_PAGE_TAKES, STUDIO_PAGE_PACE]);
          yield* countIs(page, `.ak[data-ask="${STUDIO_PAGE}"] .ak-folded:not([open])`, 1);
          yield* textHas(
            page,
            `.ak[data-ask="${STUDIO_PAGE}"] summary`,
            'What do we call the act?',
          );
          yield* textHas(page, `.ak[data-ask="${STUDIO_PAGE}"] summary`, 'The breath');
          yield* countIs(page, `.ak[data-ask="${STUDIO_PAGE}"] .ak-send`, 0);
          yield* countIs(page, '.akp .ak-send [data-act="send"]', 2);
          yield* textIs(
            page,
            `.ak[data-ask="${STUDIO_PAGE_PACE}"] .ak-part-h`,
            'Keep the pace of the open?',
          );
          yield* until(page, inView(STUDIO_PAGE_TAKES));
          yield* evaluates(page, 'scrollY', 0);
          if (viewport === PHONE) yield* fitsPhone(page);
          yield* evaluates(page, sendReached(STUDIO_PAGE_TAKES), true);
          yield* evaluates(page, sendReached(STUDIO_PAGE_PACE), true);
          expect(errors).toEqual([]);
        }).pipe(Effect.scoped),
      SLOW,
    );

  it.live(
    'one ask sends alone; the page read again moves the count and folds it',
    () =>
      Effect.gen(function* () {
        const posted: Array<Asked> = [];
        const routes: ReadonlyArray<FakeRoute> = [
          route('POST', new RegExp(`^/api/asks/${STUDIO_PAGE_PACE}/answer$`), (asked) => {
            posted.push(asked);
            return json(pacedAsk);
          }),
          route('GET', /^\/api\/asks\/a012345678[234]\/page$/, () =>
            json(Arr.match(posted, { onEmpty: () => studioPage, onNonEmpty: () => pacedPage })),
          ),
          ...studioRoutes,
        ];
        const { page, errors } = yield* openAsk(routes, {
          href: pageHref.askPage(STUDIO_PAGE),
          viewport: PHONE,
        });
        yield* waitFor(page, PAGE_READY);
        const pace = `.ak[data-ask="${STUDIO_PAGE_PACE}"]`;
        yield* page.click(`${pace} .ak-option[data-value="keep-it"]`);
        yield* page.click(`${pace} .ak-send [data-act="send"]`);
        yield* textIs(page, '.akp-count', '2 of 3 answered');
        yield* textHas(page, `${pace} .ak-folded summary`, 'Keep it');
        yield* countIs(page, `${pace} .ak-send`, 0);
        yield* countIs(page, `.ak[data-ask="${STUDIO_PAGE_TAKES}"] .ak-send [data-act="send"]`, 1);
        expect(posted.map((p) => Option.getOrNull(p.body))).toEqual([
          { sections: [{ step: 'ask', values: { pace: 'keep-it' } }] },
        ]);
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    "one ask's own link opens its page, taken to that ask",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openAsk(studioRoutes, {
          href: pageHref.ask(STUDIO_PAGE_PACE),
          viewport: { ...PHONE, height: 560 },
        });
        yield* waitFor(page, PAGE_READY);
        yield* textIs(page, '.akp-count', '1 of 3 answered');
        yield* until(page, takenTo(STUDIO_PAGE_PACE));
        yield* until(page, 'scrollY > 0');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});

const CUT = '.ak-step[data-step="cut"] [data-material="video"]';
const CUT_VIDEO = `document.querySelector('${CUT} video')`;
const VIEW_MENU = '.sh-header [data-act="view-menu"]';
const viewRow = (id: string) => `[data-role="view-menu"] [data-command="${id}"]`;
const WATCH_START = `(() => {
  for (const v of document.querySelectorAll('video')) v.dataset.seen = '';
  window.__startedAt = undefined;
  document.addEventListener('playing', (e) => {
    if (!('seen' in e.target.dataset)) window.__startedAt ??= e.target.currentTime;
  }, true);
})()`;
const STARTED_AT = 'window.__startedAt';

describe("an ask's View menu", () => {
  it.live(
    "a phone plays the originals from it and the proxies again: the cut's video stands where it stood, playing",
    () =>
      Effect.gen(function* () {
        const { page, errors } = yield* openAsk(
          [
            route('GET', /^\/api\/review\/(files|phone)\/out\/toy\/take-1\.mp4/, () => TONE),
            ...guidedRoutes,
            ...studioRoutes,
          ],
          { href: pageHref.ask(STUDIO_GUIDED), viewport: PHONE },
        );
        yield* waitFor(page, `${CUT} [data-act="play-video"]`);
        yield* evaluates(page, `${CUT_VIDEO}.src.includes('/api/review/phone/')`, true);
        yield* page.click(`${CUT} [data-act="play-video"]`);
        yield* until(page, `!${CUT_VIDEO}.paused && ${CUT_VIDEO}.currentTime > 3`);
        for (const [label, src] of [
          ['Play the originals', '/api/review/files/'],
          ['Play the proxies', '/api/review/phone/'],
        ] as const) {
          yield* page.evaluate(WATCH_START);
          yield* page.click(VIEW_MENU);
          yield* textIs(page, viewRow('ask.quality'), label);
          yield* page.click(viewRow('ask.quality'));
          yield* until(page, `${CUT_VIDEO}.src.includes('${src}')`);
          yield* until(page, `${STARTED_AT} > 2.9 && !${CUT_VIDEO}.paused`);
        }
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );

  it.live(
    'Refresh reads the review index again from its roots, and the Board again',
    () =>
      Effect.gen(function* () {
        const guided = (path: string) =>
          Option.getOrThrow(
            Arr.findFirst(guidedRoutes, (r) => r.method === 'GET' && r.path.test(path)),
          );
        const index = guided('/api/review/index');
        const board = guided('/api/films/toy/board');
        const walked = yield* Deferred.make<void>();
        const boardAgain = yield* Deferred.make<void>();
        let boards = 0;
        const { page, asked, errors } = yield* openAsk(
          [
            route('GET', /^\/api\/review\/index\?fresh=1$/, (a) =>
              told(Deferred.done(walked, Exit.void), index.answer(a)),
            ),
            route('GET', board.path, (a) => {
              boards += 1;
              if (boards === 1) return board.answer(a);
              return told(Deferred.done(boardAgain, Exit.void), board.answer(a));
            }),
            ...guidedRoutes,
            ...studioRoutes,
          ],
          { href: pageHref.ask(STUDIO_GUIDED), viewport: PHONE },
        );
        yield* waitFor(page, ASK_READY);
        yield* textHas(page, '.ak-step[data-step="board"] [data-panel="open.title"]', 'breath');
        expect(asked.filter((a) => a.path === '/api/review/index?fresh=1')).toEqual([]);
        yield* page.click(VIEW_MENU);
        yield* page.click(viewRow('ask.refresh'));
        yield* Deferred.await(walked);
        yield* Deferred.await(boardAgain);
        yield* textHas(page, '.ak-step[data-step="board"] [data-panel="open.title"]', 'breath');
        expect(errors).toEqual([]);
      }).pipe(Effect.scoped),
    SLOW,
  );
});
