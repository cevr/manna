/**
 * One way the promise was lost, or one source of words the check refuses:
 * the words put in a file of the app (after the build when `after`, so
 * `dist/` is no longer the build of what the app holds; a new file of those
 * words when `find` is empty), and what the check must say of it.
 */
export interface Case {
  readonly name: string;
  readonly file: string;
  readonly find: string;
  readonly put: string;
  readonly said: ReadonlyArray<string>;
  readonly after?: boolean;
  /** The check's printed entries, pasted into the copy's `HELD` as printed, turn it green. */
  readonly held?: boolean;
}

const CONFIRMED = 'Thank you. We will send you ${PROMISE}.';
const LABEL = "export const SIGNUP_LABEL = 'Or get them by email';";
const LABEL_JSX = '      {SIGNUP_LABEL}\n';
const LEAVE_ANY_TIME = "'You can leave at any time, from the link in any of our emails.'";
const NOTICE_WORDS = '<For each={notice.words}>{(words) => <p>{words}</p>}</For>';
const BUTTON =
  '<button class="button button-night" type="submit">\n        <span class="button-label">Email me new films</span>\n      </button>';
const LABEL_CSS = '.signup-label {\n  display: block;';
const LABEL_END = '    </label>\n    <div class="signup-row">';
const THEME_META = '<meta name="theme-color" content={THEME_COLOR} />';
const PAGE_BODY = '`<body style="margin:0;padding:0;background:${PALETTE.paper};">`,';
const ONE_CLICK = "'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',";

/** A case that says one more sentence after the promise, on the confirmed page. */
const confirmedSays = (name: string, sentence: string): Case => ({
  name,
  file: 'src/ui/mail.tsx',
  find: `\`${CONFIRMED}\``,
  put: `\`${CONFIRMED} ${sentence}\``,
  said: [`dist/subscribe/confirmed.html: unheld: ${sentence}`],
});

/** A case that rewords the sign-up label where the page and the verify drive read it (`src/mail/paths.ts`). */
const labelSays = (name: string, label: string): Case => ({
  name,
  file: 'src/mail/paths.ts',
  find: LABEL,
  put: `export const SIGNUP_LABEL = '${label}';`,
  said: [`dist/index.html: unheld: ${label}`],
});

/** A case whose markup every notice page prints as it is, after its words; the lines are the confirmed page's. */
const noticePrints = (name: string, html: string, said: ReadonlyArray<string>): Case => ({
  name,
  file: 'src/ui/mail.tsx',
  find: NOTICE_WORDS,
  put: `${NOTICE_WORDS}\n      <div innerHTML={String.raw\`${html}\`} />`,
  said: said.map((line) => `dist/subscribe/confirmed.html: ${line}`),
});

/** The census: every trigger of the promise's findings (rounds 2 to 4 of `ftb-copy`, rounds 1 and 2 of its rewrite), and every source the check refuses. */
export const CASES: ReadonlyArray<Case> = [
  {
    name: 'r2-M1 the confirmed page drops "and nothing else"',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you. We will email you when each new film is out.'",
    said: ['dist/subscribe/confirmed.html: unheld: We will email you when each new film is out.'],
  },
  {
    name: 'r2-M1 the confirmed page drops the promise whole',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you.'",
    said: ['dist/subscribe/confirmed.html: states the promise 0 times, not 1'],
  },
  {
    name: 'r3-F1 the confirmed page drops "each new film"',
    file: 'src/ui/mail.tsx',
    find: `\`${CONFIRMED}\``,
    put: "'Thank you. We will email you when a new film is out.'",
    said: ['dist/subscribe/confirmed.html: unheld: We will email you when a new film is out.'],
  },
  {
    name: 'r3-F1 the film letter says "one email per film"',
    file: 'src/mail/letters.ts',
    find: 'which sends ${PROMISE}.`',
    put: 'which sends one email per film.`',
    said: [
      'letter film path/00 text: unheld: You get this because you joined the First the Blade list, which sends one email per film.',
      'letter film path/00 html: unheld: You get this because you joined the First the Blade list, which sends one email per film.',
    ],
  },
  {
    name: 'r4-F1 a cadence with no mail word',
    file: 'src/ui/mail.tsx',
    find: LEAVE_ANY_TIME,
    put: "'We will be in touch every week. A new film reaches you every Friday. A note every week. Look for us here each Friday.'",
    said: [
      'dist/subscribe/confirmed.html: unheld: We will be in touch every week.',
      'dist/subscribe/confirmed.html: unheld: Look for us here each Friday.',
      'dist/subscribe/confirmed.html: unheld: A new film reaches you every Friday.',
      'dist/subscribe/confirmed.html: unheld: A note every week.',
    ],
  },
  labelSays('r4-F1 "Emails: weekly"', 'Emails: weekly'),
  labelSays('r4-F1 "EMAIL WEEKLY"', 'EMAIL WEEKLY'),
  labelSays('r4-F1 "Email · weekly"', 'Email · weekly'),
  {
    name: 'r4-F1 a cadence split by a JSX expression',
    file: 'src/ui/mail.tsx',
    find: LABEL_JSX,
    put: '      Email {"weekly"}\n',
    said: ['dist/index.html: unheld: Email weekly'],
  },
  {
    name: 'r4-F1 a cadence on a thumbnail',
    file: 'kit/draw.ts',
    find: "lines: ['You did it.']",
    put: "lines: ['We email you weekly.']",
    said: ['kit/out/thumb-court.png: unheld: We email you weekly.'],
  },
  {
    ...confirmedSays(
      'rw-r3-F6 a refused sentence, held by the entry it prints',
      "We'll write weekly.",
    ),
    held: true,
  },
  {
    name: 'rw-r3-F6 a refused sentence on a kind HELD does not name, held by the entry it prints',
    file: 'kit/draw.ts',
    find: "lines: ['You did it.']",
    put: "lines: ['We email you weekly.']",
    said: ['kit/out/thumb-court.png: unheld: We email you weekly.'],
    held: true,
  },
  {
    name: 'r4-F2 the form binds a PROMISE of its own',
    file: 'src/ui/mail.tsx',
    find: "import { PROMISE } from '../mail/promise.ts';",
    put: "const PROMISE = 'a note every week';",
    said: [
      'dist/index.html: unheld: We send you a note every week.',
      'dist/subscribe/confirmed.html: unheld: We will send you a note every week.',
    ],
  },
  {
    name: 'r4-F2 the privacy page binds a PROMISE of its own',
    file: 'src/views.tsx',
    find: "import { PROMISE } from './mail/promise.ts';",
    put: "const PROMISE = 'news from us now and then';",
    said: ['dist/privacy.html: unheld: We use it to send you news from us now and then.'],
  },
  confirmedSays('rw-r1-F1 "biweekly"', 'Expect a new film from us biweekly.'),
  confirmedSays('rw-r1-F1 "on weekends"', 'A new film lands in your box on weekends.'),
  confirmedSays('rw-r1-F1 "quarterly"', 'Look for us quarterly.'),
  confirmedSays('rw-r1-F1 "semimonthly"', 'And a roundup from us semimonthly.'),
  confirmedSays('rw-r1-F1 "bimonthly"', 'Plus a bimonthly roundup.'),
  confirmedSays('rw-r1-F1 "tonight and tomorrow"', 'Expect us tonight and tomorrow.'),
  confirmedSays('rw-r1-F1 "nightly"', 'Expect a film from us nightly.'),
  confirmedSays('rw-r1-F1 "twice a month"', 'You will get a new film from us twice a month.'),
  confirmedSays(
    'rw-r1-F1 "at Easter and Christmas"',
    'Expect a roundup from us at Easter and Christmas.',
  ),
  confirmedSays('rw-r1-F1 "seasonal"', 'And our seasonal roundup.'),
  confirmedSays(
    'rw-r1-F4 "for an hour" said on the confirmed page',
    'We will not send another one for an hour.',
  ),
  {
    name: 'rw-r1-F2 the sign-up label splits "weekly" with <u>',
    file: 'src/ui/mail.tsx',
    find: LABEL_JSX,
    put: '      Or get them <u>wee</u>kly\n',
    said: ['dist/index.html: unheld: Or get them weekly'],
  },
  noticePrints('rw-r1-F2 <u>wee</u>kly', '<p>Find us here <u>wee</u>kly.</p>', [
    'unheld: Find us here weekly.',
  ]),
  noticePrints('rw-r1-F2 <a>wee</a>kly', '<p>Find us here <a href=/x>wee</a>kly.</p>', [
    'unheld: Find us here weekly.',
  ]),
  noticePrints('rw-r1-F2 <s></s>every Friday', '<p>Find us here <s></s>every Friday.</p>', [
    'unheld: Find us here every Friday.',
  ]),
  noticePrints('rw-r1-F2 a word split across two boxes', '<p>Find us here wee</p><p>kly.</p>', [
    'layout: Find us here wee|kly.',
  ]),
  noticePrints(
    'rw-r1-F2 a list word merged into an inline element',
    '<p>Our list<span>ening</span> room.</p>',
    ['layout: Our list|ening room.'],
  ),
  {
    name: 'rw-r1-F3 the sign-up button as <input type=submit value>',
    file: 'src/ui/mail.tsx',
    find: BUTTON,
    put: '<input class="button button-night" type="submit" value="Email me weekly" />',
    said: ['dist/index.html: unheld: Email me weekly', 'dist/index.html: gone: Email me new films'],
  },
  noticePrints(
    'rw-r1-F3 <input type=submit value>',
    '<input type="submit" value="Get our weekly digest">',
    ['unheld: Get our weekly digest'],
  ),
  noticePrints(
    'rw-r1-F3 aria-description',
    '<button aria-description="We email you weekly">x</button>',
    ['unheld: We email you weekly'],
  ),
  noticePrints('rw-r1-F3 alt in single quotes', "<img alt='We email you weekly'>", [
    'unheld: We email you weekly',
  ]),
  noticePrints('rw-r1-F3 title', '<abbr title="weekly">wk</abbr>', ['unheld: weekly']),
  noticePrints(
    'rw-r1-F3 CSS content in a <style>',
    "<style>.x::after{content:'Weekly emails'}</style>",
    ['unheld: Weekly emails'],
  ),
  {
    name: 'rw-r1-F3 CSS content in the built stylesheet',
    file: 'src/styles.css',
    find: LABEL_CSS,
    put: `.signup-label::after {\n  content: 'Weekly emails';\n}\n${LABEL_CSS}`,
    said: ['dist/assets/client-*.css: unheld: Weekly emails'],
  },
  noticePrints('rw-r2-F1 a soft hyphen inside "weekly"', '<p>Expect us wee&shy;kly.</p>', [
    'unheld: Expect us weekly.',
  ]),
  noticePrints('rw-r2-F1 a zero-width space inside "weekly"', '<p>Expect us wee&#8203;kly.</p>', [
    'unheld: Expect us weekly.',
  ]),
  noticePrints('rw-r2-F1 a zero-width joiner inside "weekly"', '<p>Expect us wee&zwj;kly.</p>', [
    'unheld: Expect us weekly.',
  ]),
  noticePrints(
    'rw-r2-F1 a full-width "weekly"',
    '<p>Expect us &#xff57;&#xff45;&#xff45;&#xff4b;&#xff4c;&#xff59;.</p>',
    ['unheld: Expect us weekly.'],
  ),
  noticePrints('rw-r2-F1 a Cyrillic letter in "weekly"', '<p>Expect us w&#x435;&#x435;kly.</p>', [
    'unread: character U+0435 in "Expect us w\u0435\u0435kly."',
  ]),
  {
    name: 'rw-r2-F2 generated content after the sign-up button',
    file: 'src/styles.css',
    find: LABEL_CSS,
    put: `.button-label::after {\n  content: ' and our news';\n}\n${LABEL_CSS}`,
    said: ['dist/assets/client-*.css: unread: content: … and our news…'],
  },
  noticePrints(
    'rw-r2-F2 generated content that ends a word',
    '<style>.w::after{content:"kly"}</style><p>Expect us <span class="w">wee</span>.</p>',
    ['unread: content: "kly"'],
  ),
  noticePrints(
    'rw-r2-F2 generated content in two strings',
    "<style>.w::after{content:'wee' 'kly.'}</style>",
    ["unread: content: 'wee' 'kly.'"],
  ),
  {
    name: 'rw-r2-F3 an inline <div> after the sign-up label',
    file: 'src/ui/mail.tsx',
    find: LABEL_END,
    put: '    </label>\n    <div style={{ display: \'inline\' }}> and our news too</div>\n    <div class="signup-row">',
    said: ['dist/index.html: layout: …|Or get them by email | and our news too|…'],
  },
  noticePrints(
    'rw-r2-F3 two boxes shown inline',
    '<p>Get them by email</p><p> and our garden too.</p>',
    ['layout: Get them by email | and our garden too.'],
  ),
  {
    name: 'rw-r2-F4 the letters are from "First the Blade Weekly"',
    file: 'src/mail/mailer.ts',
    find: "name: 'First the Blade', email",
    put: "name: 'First the Blade Weekly', email",
    said: ['letter sender: unheld: First the Blade Weekly'],
  },
  {
    name: 'rw-r2-F4 the letters are from weekly@',
    file: 'src/mail/mailer.ts',
    find: "email: 'films@firsttheblade.com'",
    put: "email: 'weekly@firsttheblade.com'",
    said: ['letter sender: unheld: weekly@firsttheblade.com'],
  },
  {
    name: 'rw-r2-F5 <meta name="application-name">',
    file: 'src/document.tsx',
    find: THEME_META,
    put: `${THEME_META}\n        <meta name="application-name" content="First the Blade Weekly" />`,
    said: ['dist/index.html: unread: meta application-name'],
  },
  confirmedSays('rw-r2-F6 "our news and offers"', 'Plus our news and offers.'),
  {
    name: 'rw-r2-F7 a source changed after the build',
    file: 'src/ui/mail.tsx',
    find: LEAVE_ANY_TIME,
    put: "'We email you weekly.'",
    after: true,
    said: ['stale: dist/ was built from other sources; run bun run build'],
  },
  {
    name: 'rw-r2-F7 a built file changed after the build',
    file: 'dist/llms.txt',
    find: '# First the Blade\n',
    put: '# First the Blade\n\nWe email you weekly.\n',
    after: true,
    said: ['stale: dist/llms.txt changed after its build'],
  },
  noticePrints(
    'rw-r2-F8 a download file name',
    '<a href="/x.pdf" download="weekly-digest.pdf">Get it</a>',
    ['unheld: weekly-digest.pdf'],
  ),
  {
    name: 'letters a cadence in a subject',
    file: 'src/mail/letters.ts',
    find: 'const subject = `Confirm your email for ${CHANNEL.name}`;',
    put: 'const subject = `Your weekly films from ${CHANNEL.name}`;',
    said: ['letter confirm text: unheld: Your weekly films from First the Blade'],
  },
  {
    name: 'letters a hidden preheader',
    file: 'src/mail/letters.ts',
    find: PAGE_BODY,
    put: `${PAGE_BODY}\n    '<div style="display:none">Your weekly digest</div>',`,
    said: [
      'letter confirm html: unheld: Your weekly digest',
      'letter film path/00 html: unheld: Your weekly digest',
    ],
  },
  {
    name: 'fail-closed a letter header the check does not know',
    file: 'src/mail/letters.ts',
    find: ONE_CLICK,
    put: `${ONE_CLICK}\n      'X-Note': 'One film a week',`,
    said: ['letter film path/00 text: unread: letter header X-Note'],
  },
  noticePrints(
    'fail-closed an element the check does not read',
    '<iframe src="/x.html"></iframe>',
    ['unread: element iframe'],
  ),
  noticePrints('fail-closed a custom element', '<film-note>x</film-note>', [
    'unread: element film-note',
  ]),
  noticePrints(
    'fail-closed an attribute the check does not read',
    '<span data-note="We email you weekly">x</span>',
    ['unread: attribute data-note on span'],
  ),
  noticePrints('fail-closed an inline script', "<script>document.write('Weekly')</script>", [
    'unread: inline script',
  ]),
  noticePrints(
    'fail-closed a stylesheet from elsewhere',
    '<link rel="stylesheet" href="https://example.com/x.css">',
    ['unread: stylesheet https://example.com/x.css'],
  ),
  noticePrints(
    'fail-closed generated content from a counter',
    '<style>.w::before{content:counter(n, lower-alpha)}</style>',
    ['unread: content: counter(n, lower-alpha)'],
  ),
  noticePrints(
    'fail-closed a stylesheet string with a letter',
    '<style>.w{--note:"Expect us"}</style>',
    ['unread: CSS string "Expect us"'],
  ),
  noticePrints('fail-closed an @import', '<style>@import url(https://example.com/x.css);</style>', [
    'unread: @import',
  ]),
  noticePrints(
    'fail-closed a mail link that fills in a subject',
    '<a href="mailto:hello@firsttheblade.com?subject=Weekly">Write</a>',
    ['unread: link words mailto:hello@firsttheblade.com?subject=Weekly'],
  ),
  {
    name: 'fail-closed a picture the check does not know',
    file: 'public/weekly.png',
    find: '',
    put: 'We email you weekly.',
    said: ['unread: dist/weekly.png'],
  },
  noticePrints('fail-closed a meta tag with no name', '<meta http-equiv="refresh" content="0">', [
    'unread: meta',
  ]),
  {
    name: 'rw-r3-F4 an escaped content: and attr() in a stylesheet no minifier reads',
    file: 'public/escape.css',
    find: '',
    put: String.raw`.x::after{c\6f ntent:\61ttr(data-count)}`,
    said: ['dist/escape.css: unread: CSS escape'],
  },
  noticePrints(
    'rw-r3-F5 a link card picture from elsewhere',
    '<meta property="og:image" content="https://example.com/weekly-news.jpg">',
    ['unread: link card picture https://example.com/weekly-news.jpg'],
  ),
];
