import { chromium, type Browser, type Locator, type Page } from '@playwright/test';
import { Cause, Clock, Effect, Exit, FileSystem, Option, Ref, Schedule, Schema } from 'effect';

import { MAIL_PAGES, MAIL_ROUTES } from '../../src/mail/paths.ts';
import { NOTICE_TITLES } from '../../src/pages.ts';
import { CHANNEL } from '../../src/site.ts';
import { doctorRoot } from './doctor.ts';
import { launch, run } from './instance.ts';
import { JourneyFailed, type JourneyReport, type Letter, type Step, Steps } from './model.ts';
import { awaitLetter, readOutbox, redactTokens } from './outbox.ts';

export const JOURNEYS = ['confirm', 'confirm-noscript'] as const;
export type JourneyName = (typeof JOURNEYS)[number];

const MUTED = ['--mute-audio', '--disable-audio-output'];

const VIEWPORT = { width: 1280, height: 800 };

const SHOW_WITHIN = 5000;

const LEAST_HOLD_MS = 550;

const SIGNUP_LABEL = 'Or have each one sent to you by email';

const HOLD_MARKS = '__verifyHold';

const markHold = (key: string) => {
  const marks = { shown: -1, answered: -1 };
  Reflect.set(window, key, marks);
  new MutationObserver(() => {
    const status = document.querySelector('[role="status"]');
    if (!(status instanceof Element)) return;
    const busy = status.getAttribute('aria-busy') === 'true';
    // oxlint-disable-next-line effect/noGlobals -- run in the page, on the page's own clock.
    if (busy && marks.shown < 0) marks.shown = performance.now();
    // oxlint-disable-next-line effect/noGlobals -- run in the page, on the page's own clock.
    if (!busy && marks.shown >= 0 && marks.answered < 0) marks.answered = performance.now();
  }).observe(document, { subtree: true, childList: true, attributes: true });
};

const HoldMarks = Schema.Struct({ shown: Schema.Finite, answered: Schema.Finite });

const heldOn = Effect.fn('Verify.heldOn')(function* (drive: Drive) {
  const kept = yield* browser(drive, 'confirmed', () =>
    drive.page.evaluate((key): unknown => Reflect.get(window, key), HOLD_MARKS),
  );
  const marks = yield* Schema.decodeUnknownEffect(HoldMarks)(kept).pipe(
    Effect.mapError(() => failed(drive, 'confirmed', 'the page kept no hold marks')),
  );
  yield* expectThat(
    drive,
    'confirmed',
    marks.shown >= 0 && marks.answered >= marks.shown,
    `the page saw the skeleton at ${marks.shown} ms and its answer at ${marks.answered} ms`,
  );
  return Math.round(marks.answered - marks.shown);
});

interface Drive {
  readonly journey: JourneyName;
  readonly page: Page;
  readonly origin: string;
  readonly outbox: string;
  readonly log: string;
  readonly dir: string;
  readonly email: string;
  readonly startedAt: number;
  readonly steps: Ref.Ref<ReadonlyArray<Step>>;
  readonly loads: Array<string>;
  readonly posts: Array<string>;
}

export const failed = (drive: Pick<Drive, 'journey' | 'dir'>, step: string, message: string) =>
  JourneyFailed.make({
    journey: drive.journey,
    step,
    message: redactTokens(`${drive.journey} ${step}: ${message} (evidence ${drive.dir})`),
    evidence: drive.dir,
  });

export const failureLine = (cause: Cause.Cause<unknown>) =>
  redactTokens(Cause.pretty(cause).split('\n')[0] ?? '');

const browser = <A>(drive: Drive, step: string, call: () => PromiseLike<A>) =>
  Effect.tryPromise({ try: call, catch: (cause) => failed(drive, step, String(cause)) });

const expectThat = (drive: Drive, step: string, holds: boolean, message: string) => {
  if (holds) return Effect.void;
  return Effect.fail(failed(drive, step, message));
};

const shows = (drive: Drive, step: string, locator: Locator, what: string) =>
  browser(drive, step, () => locator.waitFor({ state: 'visible', timeout: SHOW_WITHIN })).pipe(
    Effect.mapError(() => failed(drive, step, `expected ${what} within ${SHOW_WITHIN} ms`)),
  );

const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });

const pathOf = (page: Page) => new URL(page.url()).pathname;

const StepsJson = Schema.fromJsonString(Steps);

const record = Effect.fn('Verify.record')(function* (
  drive: Drive,
  step: string,
  action: string,
  observed: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const n = (yield* Ref.get(drive.steps)).length + 1;
  const stem = `${drive.dir}/${String(n).padStart(2, '0')}-${step}`;
  yield* browser(drive, step, () => drive.page.screenshot({ path: `${stem}.png` }));
  const aria = yield* browser(drive, step, () => drive.page.ariaSnapshot());
  yield* fs.writeFileString(`${stem}.aria.txt`, `${aria}\n`);
  const entry: Step = {
    n,
    step,
    action,
    url: redactTokens(drive.page.url()),
    observed,
    files: [`${stem}.png`, `${stem}.aria.txt`],
    atMs: (yield* Clock.currentTimeMillis) - drive.startedAt,
  };
  const steps = yield* Ref.updateAndGet(drive.steps, (all) => [...all, entry]);
  yield* fs.writeFileString(
    `${drive.dir}/steps.json`,
    yield* Schema.encodeEffect(StepsJson)(steps),
  );
});

const keepLetter = Effect.fn('Verify.keepLetter')(function* (
  drive: Drive,
  letter: Letter,
  link: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const n = (yield* Ref.get(drive.steps)).length + 1;
  const kept = `${drive.dir}/${String(n).padStart(2, '0')}-letter.txt`;
  const text = yield* fs.readFileString(letter.file);
  yield* fs.writeFileString(kept, redactTokens(text));
  const entry: Step = {
    n,
    step: 'letter',
    action: `read the newest letter to ${drive.email} from the outbox`,
    url: redactTokens(drive.page.url()),
    observed: `${letter.kind} letter "${letter.subject}", link ${new URL(link).pathname}`,
    files: [kept],
    atMs: (yield* Clock.currentTimeMillis) - drive.startedAt,
  };
  const steps = yield* Ref.updateAndGet(drive.steps, (all) => [...all, entry]);
  yield* fs.writeFileString(
    `${drive.dir}/steps.json`,
    yield* Schema.encodeEffect(StepsJson)(steps),
  );
});

const signUp = Effect.fn('Verify.signUp')(function* (drive: Drive, step: string) {
  const { page } = drive;
  yield* browser(drive, step, () => page.goto(`${drive.origin}/`));
  const field = page.getByRole('textbox', { name: SIGNUP_LABEL, exact: true });
  yield* shows(drive, step, field, `the sign-up field "${SIGNUP_LABEL}"`);
  yield* browser(drive, step, () => field.fill(drive.email));
  yield* browser(drive, step, () =>
    page.getByRole('button', { name: 'Email me new films', exact: true }).click(),
  );
  yield* browser(drive, step, () => page.waitForURL(`**${MAIL_PAGES.check}`));
  yield* shows(
    drive,
    step,
    heading(page, NOTICE_TITLES.check),
    `the heading "${NOTICE_TITLES.check}"`,
  );
  yield* record(
    drive,
    step,
    `fill "${SIGNUP_LABEL}" with ${drive.email}, press "Email me new films"`,
    `${MAIL_PAGES.check}, heading "${NOTICE_TITLES.check}"`,
  );
});

const confirmLink = Effect.fn('Verify.confirmLink')(function* (drive: Drive) {
  const letter = yield* awaitLetter(drive.outbox, drive.email).pipe(
    Effect.mapError((error) => failed(drive, 'letter', error.message)),
  );
  yield* expectThat(
    drive,
    'letter',
    letter.kind === 'confirm',
    `the letter is ${letter.kind}, not a confirm letter`,
  );
  const link = yield* Effect.fromOption(Option.fromUndefinedOr(letter.link)).pipe(
    Effect.mapError(() => failed(drive, 'letter', 'the confirm letter holds no link')),
  );
  yield* keepLetter(drive, letter, link);
  return link;
});

const confirmedShows = Effect.fn('Verify.confirmedShows')(function* (drive: Drive, step: string) {
  const { page } = drive;
  yield* shows(
    drive,
    step,
    heading(page, NOTICE_TITLES.confirmed),
    `the heading "${NOTICE_TITLES.confirmed}"`,
  );
  yield* expectThat(
    drive,
    step,
    pathOf(page) === MAIL_PAGES.confirmed,
    `the address bar reads ${pathOf(page)}, not ${MAIL_PAGES.confirmed}`,
  );
  const title = yield* browser(drive, step, () => page.title());
  const expected = `${NOTICE_TITLES.confirmed} · ${CHANNEL.name}`;
  yield* expectThat(drive, step, title === expected, `the title is "${title}", not "${expected}"`);
});

const reloads = Effect.fn('Verify.reloads')(function* (drive: Drive) {
  const posted = drive.posts.length;
  yield* browser(drive, 'reload', () => drive.page.reload());
  yield* confirmedShows(drive, 'reload');
  yield* expectThat(
    drive,
    'reload',
    drive.posts.length === posted,
    'the reload posted the token again',
  );
  yield* record(
    drive,
    'reload',
    'reload the page',
    `${MAIL_PAGES.confirmed} served as it stands, no POST`,
  );
});

const quietLines = Effect.fn('Verify.quietLines')(function* (log: string) {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(log);
  return text.split('\n').filter((line) => line.includes('[mail] subscribe.quiet')).length;
});

const signsUpAgain = Effect.fn('Verify.signsUpAgain')(function* (drive: Drive) {
  const before = yield* quietLines(drive.log);
  yield* signUp(drive, 'again');
  yield* quietLines(drive.log).pipe(
    Effect.flatMap((now) =>
      expectThat(drive, 'again', now > before, 'the log holds no new subscribe.quiet'),
    ),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 50 }),
  );
  const letters = yield* readOutbox(drive.outbox);
  const to = letters.filter((letter) => letter.to === drive.email).length;
  yield* expectThat(drive, 'again', to === 1, `${to} letters to ${drive.email}, not 1`);
  const steps = yield* Ref.get(drive.steps);
  const last = steps[steps.length - 1];
  yield* Ref.set(drive.steps, [
    ...steps.slice(0, -1),
    ...Option.toArray(Option.fromUndefinedOr(last)).map((step) => ({
      ...step,
      observed: `${step.observed}; the log says subscribe.quiet and the outbox still holds one letter to ${drive.email}`,
    })),
  ]);
});

const confirmInPlace = Effect.fn('Verify.confirmInPlace')(function* (drive: Drive) {
  const { page } = drive;
  yield* signUp(drive, 'sign-up');
  const link = yield* confirmLink(drive);
  const loadsBefore = drive.loads.length;
  yield* browser(drive, 'skeleton', () => page.addInitScript(markHold, HOLD_MARKS));
  yield* browser(drive, 'skeleton', () => page.goto(link, { waitUntil: 'domcontentloaded' }));
  const status = page.getByRole('status');
  yield* shows(drive, 'skeleton', status, 'the skeleton (role status)');
  const busy = yield* browser(drive, 'skeleton', () => status.getAttribute('aria-busy'));
  yield* expectThat(
    drive,
    'skeleton',
    busy === 'true',
    `the status is aria-busy=${busy}, not true`,
  );
  const words = yield* browser(drive, 'skeleton', () => status.textContent());
  yield* expectThat(
    drive,
    'skeleton',
    (words ?? '').includes('Confirming your email'),
    'the skeleton does not say "Confirming your email"',
  );
  yield* record(
    drive,
    'skeleton',
    'open the confirm link from the letter',
    'the skeleton: status aria-busy=true, "Confirming your email"',
  );
  yield* confirmedShows(drive, 'confirmed');
  const heldMs = yield* heldOn(drive);
  const after = yield* browser(drive, 'confirmed', () => status.getAttribute('aria-busy'));
  yield* expectThat(
    drive,
    'confirmed',
    Option.isNone(Option.fromNullOr(after)),
    `the status is still aria-busy=${after}`,
  );
  yield* expectThat(
    drive,
    'confirmed',
    drive.loads.length === loadsBefore + 1,
    `${drive.loads.length - loadsBefore} loads since the link opened, not 1: the page reloaded`,
  );
  yield* expectThat(
    drive,
    'confirmed',
    drive.posts.length === 1,
    `${drive.posts.length} POSTs to ${MAIL_ROUTES.confirm}, not 1`,
  );
  yield* expectThat(
    drive,
    'confirmed',
    heldMs >= LEAST_HOLD_MS,
    `the skeleton held ${heldMs} ms by the page's clock, under the ${LEAST_HOLD_MS} ms hold`,
  );
  yield* record(
    drive,
    'confirmed',
    'wait for the answer',
    `"${NOTICE_TITLES.confirmed}" drawn in place after the skeleton held ${heldMs} ms, one load, one POST, address bar ${MAIL_PAGES.confirmed}`,
  );
  yield* reloads(drive);
  yield* signsUpAgain(drive);
});

const confirmByButton = Effect.fn('Verify.confirmByButton')(function* (drive: Drive) {
  const { page } = drive;
  yield* signUp(drive, 'sign-up');
  const link = yield* confirmLink(drive);
  yield* browser(drive, 'button', () => page.goto(link));
  const button = page.getByRole('button', { name: 'Confirm my email', exact: true });
  yield* shows(drive, 'button', button, 'the button "Confirm my email"');
  yield* shows(
    drive,
    'button',
    heading(page, 'Confirm your email'),
    'the heading "Confirm your email"',
  );
  const skeleton = yield* browser(drive, 'button', () => page.getByRole('status').isVisible());
  yield* expectThat(drive, 'button', !skeleton, 'the skeleton shows with script off');
  yield* record(
    drive,
    'button',
    'open the confirm link from the letter, script off',
    'heading "Confirm your email" and the button "Confirm my email"; no skeleton',
  );
  yield* browser(drive, 'confirmed', () => button.click());
  yield* browser(drive, 'confirmed', () => page.waitForURL(`**${MAIL_PAGES.confirmed}`));
  yield* confirmedShows(drive, 'confirmed');
  yield* record(
    drive,
    'confirmed',
    'press "Confirm my email"',
    `the form posts, 303 to ${MAIL_PAGES.confirmed}, heading "${NOTICE_TITLES.confirmed}"`,
  );
  yield* reloads(drive);
  yield* signsUpAgain(drive);
});

const JOURNEY_STEPS: Readonly<
  Record<JourneyName, { readonly javaScript: boolean; readonly run: typeof confirmInPlace }>
> = {
  confirm: { javaScript: true, run: confirmInPlace },
  'confirm-noscript': { javaScript: false, run: confirmByButton },
};

const secondsOf = Effect.fn('Verify.secondsOf')(function* (file: string) {
  const { out } = yield* run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  const seconds = Number(out.trim());
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  const frames = yield* run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'packet=pts_time',
    '-of',
    'csv=p=0',
    file,
  ]);
  const times = frames.out
    .split('\n')
    .map(Number)
    .filter((time) => Number.isFinite(time) && time > 0);
  return Math.max(0, ...times);
});

interface JourneyOptions {
  readonly browser: Browser;
  readonly origin: string;
  readonly outbox: string;
  readonly log: string;
  readonly evidence: string;
  readonly video: boolean;
}

const journey = Effect.fn('Verify.journey')(function* (name: JourneyName, options: JourneyOptions) {
  const fs = yield* FileSystem.FileSystem;
  const dir = `${options.evidence}/${name}`;
  const raw = `${dir}/video-raw`;
  yield* fs.makeDirectory(raw, { recursive: true });
  const spec = JOURNEY_STEPS[name];
  const startedAt = yield* Clock.currentTimeMillis;
  const context = yield* Effect.tryPromise({
    try: () =>
      options.browser.newContext({
        viewport: VIEWPORT,
        javaScriptEnabled: spec.javaScript,
        recordVideo: Option.getOrUndefined(
          Option.map(
            Option.liftPredicate(raw, () => options.video),
            (dir) => ({ dir, size: VIEWPORT }),
          ),
        ),
      }),
    catch: (cause) =>
      JourneyFailed.make({ journey: name, step: 'context', message: String(cause), evidence: dir }),
  });
  const page = yield* Effect.tryPromise({
    try: () => context.newPage(),
    catch: (cause) =>
      JourneyFailed.make({ journey: name, step: 'page', message: String(cause), evidence: dir }),
  });
  const drive: Drive = {
    journey: name,
    page,
    origin: options.origin,
    outbox: options.outbox,
    log: options.log,
    dir,
    email: `verify-${name}-${startedAt}@example.com`,
    startedAt,
    steps: yield* Ref.make<ReadonlyArray<Step>>([]),
    loads: [],
    posts: [],
  };
  page.on('load', () => drive.loads.push(page.url()));
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === MAIL_ROUTES.confirm)
      drive.posts.push(request.url());
  });
  const ran = yield* Effect.exit(spec.run(drive));
  if (Exit.isFailure(ran))
    yield* record(drive, 'failed', 'the journey stopped here', failureLine(ran.cause)).pipe(
      Effect.ignore,
    );
  const video = Option.fromNullOr(page.video());
  yield* Effect.promise(() => context.close());
  const steps = yield* Ref.get(drive.steps);
  const kept = yield* Option.match(video, {
    onNone: () => Effect.succeedNone,
    onSome: (handle) =>
      Effect.gen(function* () {
        const at = `${dir}/${name}.webm`;
        yield* fs.rename(yield* Effect.promise(() => handle.path()), at);
        return Option.some({ path: at, seconds: yield* secondsOf(at) });
      }),
  });
  yield* fs.remove(raw, { recursive: true });
  yield* ran;
  const report: JourneyReport = Option.match(kept, {
    onNone: () => ({ journey: name, evidence: dir, steps }),
    onSome: (seconds) => ({ journey: name, evidence: dir, steps, video: seconds }),
  });
  if (Option.exists(kept, (one) => one.seconds <= 0))
    return yield* failed(drive, 'video', `${dir}/${name}.webm has no frames`);
  return report;
});

export const drive = Effect.fn('Verify.drive')(function* (input: {
  readonly journeys: ReadonlyArray<JourneyName>;
  readonly root: string;
  readonly port: number;
  readonly evidence: string;
  readonly video: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const { record: launched } = yield* launch(input.root, input.port);
  const doctor = yield* doctorRoot(launched.root);
  yield* fs.makeDirectory(input.evidence, { recursive: true });
  const evidence = yield* fs.realPath(input.evidence);
  const chrome = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => chromium.launch({ channel: 'chrome', headless: true, args: MUTED }),
      catch: (cause) =>
        JourneyFailed.make({
          journey: 'all',
          step: 'launch Chrome',
          message: String(cause),
          evidence,
        }),
    }),
    (opened) => Effect.promise(() => opened.close()),
  );
  const journeys = yield* Effect.forEach(input.journeys, (name) =>
    journey(name, {
      browser: chrome,
      origin: launched.origin,
      outbox: launched.outbox,
      log: launched.log,
      evidence,
      video: input.video,
    }),
  );
  return { passed: true as const, origin: launched.origin, root: launched.root, doctor, journeys };
});
