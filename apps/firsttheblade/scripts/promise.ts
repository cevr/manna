import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Data, Effect, FileSystem, Match, Option, Path, Schema } from 'effect';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';

import { kitPictures } from '../kit/draw.ts';
import { SERIES } from '../src/content.ts';
import { Address } from '../src/mail/address.ts';
import type { Film } from '../src/mail/films.ts';
import { confirmLetter, filmLetter } from '../src/mail/letters.ts';
import { FROM } from '../src/mail/mailer.ts';
import { builtFiles, readStamp, sourcesHash, STAMP } from './built.ts';

const PROMISE = 'one email when each new film is out, and nothing else';

const PROMISE_SENTENCES: ReadonlyArray<string> = [
  `We send you ${PROMISE}.`,
  `We will send you ${PROMISE}.`,
  `We use it to send you ${PROMISE}.`,
  `Someone, we hope it was you, asked First the Blade for ${PROMISE}.`,
  `You get this because you joined the First the Blade list, which sends ${PROMISE}.`,
];

const NET = new RegExp(
  String.raw`\b(?:${[
    String.raw`e-?mail\w*|mail\w*|inbox\w*|newsletters?|letters?|notes?|messages?|digest\w*`,
    String.raw`roundups?|recaps?|bulletins?|dispatch\w*|editions?|issues?`,
    String.raw`send\w*|sent|writ(?:e|es|ing|ten)|wrote|hear(?:s|d|ing)?|touch|notif\w*|updates?|reach(?:es)? you`,
    String.raw`news\w*|offers?|promo\w*|announce\w*|deals?|coupons?|discount\w*|sales?|specials?|extras?`,
    String.raw`bonus\w*|freebies?|gifts?|alerts?|reminders?|invit\w*|tips?|surveys?|podcasts?|products?|merch\w*|recipes?`,
    String.raw`lists?|join\w*|subscri\w*|sign(?:ed|s|ing)?[- ]?ups?|members?\w*`,
    String.raw`\w*(?:week|daily|dailies|day|month|year|night|quarter|fortnight|annual|season|hour|minute)\w*`,
    String.raw`\w*(?:morning|evening|noon|tomorrow|morrow|summer|winter|autumn|time|period|frequen|occasion|regular|schedul|routine|cadence)\w*`,
    String.raw`every\w*|each|per|often\w*|again|once|twice|thrice|whenever|now and then`,
    String.raw`seldom|rarely|always|never|soon\w*|later|christmas|easter`,
  ].join('|')})\b`,
  'i',
);

const joined = (...runs: ReadonlyArray<string>) => runs.join('|');
const spaced = (...joins: ReadonlyArray<string>) => joins.join(' | ');

const HEADER = [
  spaced('Skip to content', 'First the Blade'),
  ...['Main', 'Series', 'About', 'Subscribe on YouTube', 'Menu'],
];
const opening = (tab: string, ...runs: ReadonlyArray<string>) => joined(tab, ...HEADER, ...runs);
const titled = (title: string) => `${title} · First the Blade`;
const noticeOpening = (title: string, ...runs: ReadonlyArray<string>) =>
  spaced(joined(titled(title), ...HEADER), joined(title, ...runs));
const NIGHT_VERSE =
  '“And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.”';

const PAGE: ReadonlyArray<string> = ['Subscribe on YouTube'];

const intoDusk = (action: string) => joined(action, NIGHT_VERSE);

const SIGNUP: ReadonlyArray<string> = [
  'Email me new films',
  'Or get them by email',
  'See each new film',
  'Subscribe to the channel on YouTube: @firsttheblade',
  'Your email address',
  NIGHT_VERSE,
  joined(
    spaced('Mark 4:27', 'First the Blade'),
    ...['See each new film', 'Subscribe to the channel on YouTube: @firsttheblade'],
    ...['Subscribe on YouTube', 'Or get them by email', 'Your email address', 'Email me new films'],
    ...['Leave this empty', `We send you ${PROMISE}.`],
  ),
];

const HELD = new Map<string, ReadonlyArray<string>>(
  Object.entries({
    'dist/404.html': [
      ...PAGE,
      NIGHT_VERSE,
      noticeOpening('Page not found', 'There is no page here.'),
      intoDusk('Go to the home page'),
    ],
    'dist/about.html': [
      ...PAGE,
      ...SIGNUP,
      'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
      'Every verse is quoted from the King James Version.',
      'So each series starts at the beginning and builds from there.',
      opening(
        titled('About'),
        'About the channel',
        'What it is',
        'First the Blade is a new YouTube channel of short films and talks about the Bible.',
      ),
      joined('No talks out yet', NIGHT_VERSE),
      joined(
        'The name',
        'The name comes from a parable Jesus told:',
        'And he said, So is the kingdom of God, as if a man should cast seed into the ground;',
        'And should sleep, and rise night and day, and the seed should spring and grow up, he knoweth not how.',
      ),
    ],
    'dist/assets/client.css': ['Newsreader', 'Times New Roman'],
    'dist/index.html': [
      ...PAGE,
      ...SIGNUP,
      'Every verse is quoted from the King James Version.',
      opening(
        'First the Blade',
        'First the Blade',
        '“For the earth bringeth forth fruit of herself; first the blade, then the ear, after that the full corn in the ear.”',
      ),
      joined('More about the channel', NIGHT_VERSE),
    ],
    'dist/llms.txt': [
      'Privacy · First the Blade: What the First the Blade email list keeps about you, and how to leave it.',
    ],
    'dist/privacy.html': [
      ...PAGE,
      ...SIGNUP,
      'After you leave, we keep your address only to mark it as left, so that no film is sent to it.',
      'Every email has a link at the bottom to leave the list.',
      'If you have a question about the list or your address, email us.',
      'If you join the email list, we keep your email address, whether you have confirmed it, when you signed up, confirmed or left, and which films we have emailed you.',
      'If you sign up and never confirm, we delete your address, and everything we kept with it, thirty days later.',
      'It is stored on Cloudflare, which also sends the emails for us.',
      'Most mail apps also show an unsubscribe button.',
      'Press either one and we will not email you again.',
      'The emails have no tracking, so we do not know if you open them or which links you click.',
      'To stop abuse, the sign-up form counts how many tries come from one connection each minute.',
      'We do not sell, rent or share the list.',
      'What the First the Blade email list keeps about you, and how to leave it.',
      'Write to us',
      opening(
        titled('Privacy'),
        'Privacy',
        'What we keep',
        'If you join the email list, we keep your email address, whether you have confirmed it, when you signed up, confirmed or left, and which films we have emailed you.',
      ),
      joined('Why', `We use it to send you ${PROMISE}.`),
      joined('How to leave', 'Every email has a link at the bottom to leave the list.'),
      joined('Write to us', 'If you have a question about the list or your address, email us.'),
      joined('hello@firsttheblade.com', NIGHT_VERSE),
    ],
    'dist/series/dwell-in-the-land.html': [
      ...PAGE,
      ...SIGNUP,
      opening(
        titled('Dwell in the Land'),
        'Dwell in the Land',
        'Country living · Storybook films',
        'About the series',
        '“Trust in the LORD, and do good; so shalt thou dwell in the land, and verily thou shalt be fed.”',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/series/health-and-cure.html': [
      ...PAGE,
      ...SIGNUP,
      'Each talk takes one remedy, or one question, and ends with what you can do about it at home.',
      opening(
        titled('Health and Cure'),
        'Health and Cure',
        'Health · Talks',
        'About the series',
        '“Behold, I will bring it health and cure, and I will cure them, and will reveal unto them the abundance of peace and truth.”',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/series/taught-of-the-lord.html': [
      ...PAGE,
      ...SIGNUP,
      opening(
        titled('Taught of the Lord'),
        'Taught of the Lord',
        'Christian education · Talks',
        'About the series',
        '“And all thy children shall be taught of the LORD; and great shall be the peace of thy children.”',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/series/the-path-of-the-just.html': [
      ...PAGE,
      ...SIGNUP,
      'Each film builds on the ones before it, and every one comes back to the cross.',
      'The Bible teaches some things first and saves others for later, when we are ready for them.',
      'These films go in that order, one short film at a time.',
      '“But the path of the just is as the shining light, that shineth more and more unto the perfect day.”',
      opening(
        titled('The Path of the Just'),
        'The Path of the Just',
        'Theology · Storybook films',
        'About the series',
        '“But the path of the just is as the shining light, that shineth more and more unto the perfect day.”',
      ),
      joined(
        'Proverbs 4:18',
        'The Bible teaches some things first and saves others for later, when we are ready for them.',
      ),
      joined('No talks out yet', NIGHT_VERSE),
    ],
    'dist/subscribe/address.html': [
      ...PAGE,
      'Check your email address',
      'Check your email address · First the Blade',
      'Please check it and try again.',
      'Sign up again',
      'That does not look like an email address.',
      NIGHT_VERSE,
      noticeOpening('Check your email address', 'That does not look like an email address.'),
      intoDusk('Sign up again'),
    ],
    'dist/subscribe/busy.html': [
      ...PAGE,
      'Sign up again',
      'Too many sign-ups came from your connection just now.',
      'Wait a minute, then try again.',
      NIGHT_VERSE,
      noticeOpening('Too many tries', 'Too many sign-ups came from your connection just now.'),
      intoDusk('Sign up again'),
    ],
    'dist/subscribe/check.html': [
      ...PAGE,
      'Check your inbox',
      'Check your inbox · First the Blade',
      'If nothing comes in a few minutes, check your spam folder.',
      'If this address is not on the list yet, we are sending it an email now.',
      'Open the link inside to join.',
      'We will not send another one for an hour.',
      NIGHT_VERSE,
      noticeOpening(
        'Check your inbox',
        'If this address is not on the list yet, we are sending it an email now.',
      ),
      intoDusk('Go to the home page'),
    ],
    'dist/subscribe/confirm.html': [
      ...PAGE,
      'Confirm my email',
      'Confirm your email',
      'Confirm your email · First the Blade',
      'Confirming your email',
      'Press the button to join.',
      NIGHT_VERSE,
      spaced(
        joined(titled('Confirm your email'), ...HEADER),
        'Confirming your email',
        joined('Confirm your email', 'Press the button to join.'),
      ),
      intoDusk('Confirm my email'),
    ],
    'dist/subscribe/confirmed.html': [
      ...PAGE,
      'You are on the list',
      'You are on the list · First the Blade',
      'You can leave at any time, from the link in any of our emails.',
      NIGHT_VERSE,
      noticeOpening('You are on the list', 'Thank you.'),
      intoDusk('Go to the home page'),
    ],
    'dist/subscribe/expired.html': [
      ...PAGE,
      'A confirm link works for seven days, and only the newest one works.',
      'Sign up again',
      'Sign up again and we will send you a new link.',
      NIGHT_VERSE,
      noticeOpening(
        'This link has run out',
        'A confirm link works for seven days, and only the newest one works.',
      ),
      intoDusk('Sign up again'),
    ],
    'dist/unsubscribe.html': [
      ...PAGE,
      'Leave the list',
      'Leave the list · First the Blade',
      'Leave the list?',
      'Press the button and we will stop emailing you.',
      NIGHT_VERSE,
      spaced(joined(titled('Leave the list'), ...HEADER), 'Leave the list?'),
      intoDusk('Leave the list'),
    ],
    'dist/unsubscribe/done.html': [
      ...PAGE,
      'If you change your mind, you can sign up again at the bottom of any page.',
      'We will not email you again.',
      'You have left the list',
      'You have left the list · First the Blade',
      NIGHT_VERSE,
      noticeOpening('You have left the list', 'We will not email you again.'),
      intoDusk('Go to the home page'),
    ],
    'dist/unsubscribe/invalid.html': [
      ...PAGE,
      'To leave the list, use the link at the bottom of any of our emails, or your mail app’s unsubscribe button.',
      NIGHT_VERSE,
      noticeOpening('This link does not work', 'Part of it may have been lost when it was copied.'),
      intoDusk('Go to the home page'),
    ],
    'letter confirm html': [
      'Confirm my email',
      'Confirm your email for First the Blade',
      'The link works for seven days.',
      'Times New Roman',
      'We will not send any films to this address unless the link is opened.',
      joined('Confirm my email', 'The link works for seven days.'),
      joined(
        'Confirm your email for First the Blade',
        'Hello,',
        `Someone, we hope it was you, asked First the Blade for ${PROMISE}.`,
      ),
    ],
    'letter confirm text': [
      'Confirm your email for First the Blade',
      'The link works for seven days.',
      'We will not send any films to this address unless the link is opened.',
      'https://firsttheblade.com/subscribe/confirm?token=c.token',
    ],
    'letter film html': [
      'Leave the list',
      'Times New Roman',
      ...SERIES.map((series) =>
        joined(
          'Watch it on YouTube',
          `The series: ${series.name}`,
          `You get this because you joined the First the Blade list, which sends ${PROMISE}.`,
        ),
      ),
    ],
    'letter film text': ['To leave the list: https://firsttheblade.com/unsubscribe?token=u.token'],
    'kit/channel.md': [
      'Add the link only once the site is live, because YouTube shows a dead link on the channel page.',
      'Contact email',
      'Create these in series order, each one Public.',
      'Each film builds on the ones before it, so start with 01.',
      'Every verse is quoted from the King James Version.',
      'First register firsttheblade.com and forward that address to your inbox.',
      'Paste everything from the verse down to "each new film." It is 911 characters long, and YouTube allows 1,000.',
      'Subscribe to see each new film.',
    ],
  }),
);

const STATED = new Map(
  Object.entries({
    'dist/index.html': 1,
    'dist/about.html': 1,
    'dist/series/the-path-of-the-just.html': 1,
    'dist/series/dwell-in-the-land.html': 1,
    'dist/series/taught-of-the-lord.html': 1,
    'dist/series/health-and-cure.html': 1,
    'dist/privacy.html': 2,
    'dist/subscribe/confirm.html': 1,
    'dist/subscribe/confirmed.html': 1,
    'letter confirm text': 1,
    'letter confirm html': 1,
    'letter film text': 1,
    'letter film html': 1,
  }),
);

const fold = (text: string) =>
  text.normalize('NFKC').replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, '');

const SEEN_CHARACTERS = new Set(['“', '”', '‘', '’', '—', '–', '·', '•', '©', '\u00a0']);

const characterProblems = (sentence: string): ReadonlyArray<string> =>
  [
    ...new Set(
      [...sentence].filter((char) => !/[\x20-\x7e]/.test(char) && !SEEN_CHARACTERS.has(char)),
    ),
  ].map(
    (char) =>
      `unread: character U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')} in "${sentence}"`,
  );

interface Join {
  readonly shown: string;
  readonly sentence: string;
}

interface Words {
  readonly blocks: ReadonlyArray<string>;
  readonly joins: ReadonlyArray<Join>;
  readonly problems: ReadonlyArray<string>;
}

interface Artefact {
  readonly name: string;
  readonly kind: string;
  readonly sentences: ReadonlyArray<string>;
  readonly joins: ReadonlyArray<Join>;
  readonly problems: ReadonlyArray<string>;
}

const JSON_STRING = /"(?:[^"\\]|\\.)*"/g;
const decodeJsonString = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.String));

const jsonWords = (json: string): Words => ({
  blocks: [...json.matchAll(JSON_STRING)].flatMap((m) => Option.toArray(decodeJsonString(m[0]))),
  joins: [],
  problems: [],
});

const CSS_TOKENS =
  /\/\*[\s\S]*?\*\/|\burl\(\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\s*\)|"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'|\battr\(\s*([\w-]+)|(@import|@counter-style)\b/gi;

const CSS_CONTENT =
  /(?<=(?:^|[{;])\s*)content\s*:\s*((?:"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'|[^;}"'])*)/gi;

const CSS_STRINGS = new Set(['Newsreader', 'Times New Roman', 'opsz', 'woff2']);

const GENERATED = new Set<string>([]);

const cssUnescape = (text: string) =>
  text.replace(/\\([\da-f]{1,6}\s?|[\s\S])/gi, (_all, escaped: string) =>
    Match.value(escaped).pipe(
      Match.when(
        (code) => /^[\da-f]/i.test(code),
        (code) => String.fromCodePoint(Number.parseInt(code.trim(), 16)),
      ),
      Match.when('\n', () => ''),
      Match.orElse((char) => char),
    ),
  );

const drawsNoLetter = (value: string) =>
  [...value.matchAll(/"((?:[^"\\]|\\[\s\S])*)"|'((?:[^'\\]|\\[\s\S])*)'/g)].every(
    (m) => !/\p{L}/u.test(fold(cssUnescape(m[1] ?? m[2] ?? ''))),
  ) &&
  /^(?:none|normal|)$/i.test(
    value
      .replace(/"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*'/g, '')
      .replace(/!important/i, '')
      .trim(),
  );

const cssWords = (css: string): Words => {
  const tokens = [...css.matchAll(CSS_TOKENS)];
  const strings = tokens.flatMap((m) =>
    Option.toArray(Option.map(Option.fromNullishOr(m[1] ?? m[2]), (s) => fold(cssUnescape(s)))),
  );
  const escaped = /\\/.test(css.replace(CSS_TOKENS, ''));
  const content = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(CSS_CONTENT)].map((m) =>
    (m[1] ?? '').trim(),
  );
  return {
    blocks: strings,
    joins: [],
    problems: [
      ...tokens.flatMap((m) =>
        Option.toArray(Option.map(Option.fromNullishOr(m[3]), (name) => `unread: attr(${name})`)),
      ),
      ...tokens.flatMap((m) =>
        Option.toArray(
          Option.map(Option.fromNullishOr(m[4]), (rule) => `unread: ${rule.toLowerCase()}`),
        ),
      ),
      ...strings
        .filter((s) => /\p{L}/u.test(s) && !CSS_STRINGS.has(s))
        .map((s) => `unread: CSS string "${s}"`),
      ...content
        .filter((value) => !drawsNoLetter(value) && !GENERATED.has(value))
        .map((value) => `unread: content: ${value}`),
      ...['unread: CSS escape'].filter(() => escaped),
    ],
  };
};

const BREAK = '\ue000';
const SPACED_BREAK = '\ue001';

const joinsOf = (marked: string): ReadonlyArray<Join> =>
  marked
    .split(/(?<=[.?!]["”’')\]]*)[\s\ue000\ue001]+/)
    .filter((sentence) => /[\ue000\ue001]/.test(sentence))
    .map((sentence) => ({
      shown: tidy(sentence.replaceAll(SPACED_BREAK, ' | ').replaceAll(BREAK, '|')),
      sentence: tidy(sentence.replaceAll(SPACED_BREAK, ' ').replaceAll(BREAK, '')),
    }));

const tidy = (sentence: string) =>
  sentence
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:?!])/g, '$1')
    .trim();

const textWords = (text: string): Words => ({
  blocks: text.split('\n').map((line) =>
    line
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*\*|`/g, '')
      .replace(/^\s*(?:#+|-|\d+\.)\s+/, '')
      .replace(/\|/g, '\n'),
  ),
  joins: [],
  problems: [],
});

const BLOCKS = new Set([
  ...['html', 'head', 'title', 'body', 'address', 'blockquote', 'center', 'dialog', 'div'],
  ...['figure', 'figcaption', 'footer', 'form', 'header', 'hr', 'legend', 'listing', 'main'],
  ...['p', 'plaintext', 'pre', 'search', 'xmp', 'article', 'aside', 'hgroup', 'nav'],
  ...['section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dir', 'dd', 'dl', 'dt', 'menu', 'ol'],
  ...['ul', 'li', 'table', 'caption', 'colgroup', 'col', 'thead', 'tbody', 'tfoot', 'tr'],
  ...['td', 'th', 'fieldset', 'details', 'summary', 'optgroup', 'option', 'br', 'video'],
]);

const HTML_ELEMENTS = new Set([
  ...[...BLOCKS].filter((tag) => tag !== 'video'),
  ...['meta', 'link', 'style', 'script', 'noscript', 'template', 'base'],
  ...['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark'],
  ...['q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'],
  ...['del', 'ins', 'ruby', 'rt', 'rp', 'picture', 'source', 'img', 'button', 'datalist'],
  ...['input', 'label', 'meter', 'output', 'progress', 'select', 'textarea'],
]);
const SVG_ELEMENTS = new Set([
  ...['svg', 'g', 'defs', 'clippath', 'mask', 'path', 'circle', 'ellipse', 'line', 'rect'],
  ...['polygon', 'polyline', 'lineargradient', 'radialgradient', 'stop', 'symbol'],
  ...['title', 'desc', 'text', 'tspan', 'textpath', 'a'],
]);
const XML_ELEMENTS = new Set(['html', 'head', 'body', 'urlset', 'url', 'loc', 'lastmod']);
const SVG_INLINE = new Set(['tspan', 'textpath', 'a']);
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

const SEEN_ATTRIBUTES = new Set([
  ...['alt', 'title', 'placeholder', 'value', 'label', 'abbr', 'download'],
  ...['aria-label', 'aria-description', 'aria-roledescription', 'aria-placeholder'],
  ...['aria-valuetext', 'aria-braillelabel', 'aria-brailleroledescription'],
]);
const UNSEEN_ATTRIBUTES = new Set([
  ...['action', 'as', 'autocomplete', 'charset', 'class', 'crossorigin', 'fetchpriority', 'for'],
  ...['height', 'href', 'id', 'inputmode', 'lang', 'loading', 'maxlength', 'method', 'name'],
  ...['rel', 'required', 'role', 'sizes', 'src', 'srcset', 'tabindex', 'type', 'width', 'xmlns'],
  ...['aria-busy', 'aria-current', 'aria-hidden', 'aria-labelledby', 'aria-describedby'],
  ...['data-count', 'data-logo', 'style'],
  ...['viewbox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
  ...['clip-path', 'opacity', 'fill-rule', 'cx', 'cy', 'r'],
  ...['pathlength', 'stroke-dasharray', 'stroke-dashoffset'],
]);

const SEEN_META = new Set([
  ...['description', 'og:site_name', 'og:title', 'og:description', 'og:image:alt'],
  ...['twitter:title', 'twitter:description', 'twitter:image:alt'],
]);
const UNSEEN_META = new Set([
  ...['viewport', 'robots', 'theme-color', 'og:type', 'og:url', 'og:image', 'og:image:width'],
  ...['og:image:height', 'og:locale', 'twitter:card', 'twitter:image'],
]);

const LINK_CARD_PICTURES = new Set(['og:image', 'twitter:image']);
const LINK_CARD = /^https:\/\/firsttheblade\.com\/(og\/[\w-]+\.jpg)$/;
const isDrawnLinkCard = (url: string) =>
  Option.exists(Option.fromNullishOr(LINK_CARD.exec(url)?.[1]), (file) =>
    WORDLESS.has(`dist/${file}`),
  );

type Piece = { readonly text: string } | { readonly breaks: boolean; readonly opens: boolean };
interface Gap {
  readonly at: number;
}

const isText = (node: DefaultTreeAdapterTypes.Node): node is DefaultTreeAdapterTypes.TextNode =>
  node.nodeName === '#text';
const isTemplate = (
  node: DefaultTreeAdapterTypes.Element,
): node is DefaultTreeAdapterTypes.Template => node.nodeName === 'template' && 'content' in node;

const SENTENCE_EDGE = /\n|(?<=[.?!])\s+/;
const REACH = 600;

const layoutProblems = (text: string, gaps: ReadonlyArray<Gap>): ReadonlyArray<string> =>
  gaps.flatMap(({ at }) => {
    const before =
      text
        .slice(Math.max(0, at - REACH), at)
        .split(SENTENCE_EDGE)
        .at(-1) ?? '';
    const after = text.slice(at, at + REACH).split(SENTENCE_EDGE)[0] ?? '';
    if (before.trim() === '' || after.trim() === '') return [];
    const missed = (NET.test(before) || NET.test(after)) && !NET.test(before + after);
    return [`layout: ${before.trim()}|${after.trim()}`].filter(() => missed);
  });

interface Edge {
  readonly breaks: boolean;
  readonly spaced: boolean;
}

interface Reading {
  text: string;
  marked: string;
  readonly gaps: Array<Gap>;
}

const addRun = (reading: Reading, edge: Edge, words: string) => {
  const space = edge.spaced || /\s$/.test(reading.text) || /^\s/.test(words);
  if (edge.breaks) {
    reading.text = `${reading.text.trimEnd()}\n${words.trimStart()}`;
    reading.marked = `${reading.marked.trimEnd()}${[BREAK, SPACED_BREAK][Number(space)] ?? BREAK}${words.trimStart()}`;
    return;
  }
  if (!space) reading.gaps.push({ at: reading.text.length });
  const join = [' '].filter(() => edge.spaced && !/\s$/.test(reading.text) && !/^\s/.test(words));
  reading.text += `${join.join('')}${words}`;
  reading.marked += `${join.join('')}${words}`;
};

const readingOf = (pieces: ReadonlyArray<Piece>): Reading => {
  const reading: Reading = { text: '', marked: '', gaps: [] };
  let edge: Option.Option<Edge> = Option.none();
  let closed = false;
  pieces.forEach((piece) => {
    if ('breaks' in piece) {
      const sideBySide = closed && piece.opens;
      closed = !piece.opens;
      const before = Option.getOrElse(edge, () => ({ breaks: false, spaced: false }));
      edge = Option.some({
        breaks: sideBySide || before.breaks || piece.breaks,
        spaced: before.spaced,
      });
      return;
    }
    closed = false;
    const words = fold(piece.text).replace(/\s+/g, ' ');
    if (words === '') return;
    if (words.trim() === '' && Option.isSome(edge)) {
      edge = Option.some({ ...edge.value, spaced: true });
      return;
    }
    if (reading.text === '' || Option.isNone(edge)) {
      reading.text += words;
      reading.marked += words;
    } else {
      addRun(reading, edge.value, words);
    }
    edge = Option.none();
  });
  return reading;
};

interface Markup {
  readonly elements: ReadonlySet<string>;
  readonly breakAll: boolean;
}

const markupWords =
  ({ elements, breakAll }: Markup) =>
  (html: string): Words => {
    const pieces: Array<Piece> = [];
    const blocks: Array<string> = [];
    const problems: Array<string> = [];
    const take = (words: Words) => {
      blocks.push(...words.blocks);
      problems.push(...words.problems);
    };
    const visit = (node: DefaultTreeAdapterTypes.Node): void => {
      if (isText(node)) {
        pieces.push({ text: node.value });
        return;
      }
      if (!('tagName' in node)) {
        if ('childNodes' in node) node.childNodes.forEach(visit);
        return;
      }
      const tag = node.tagName.toLowerCase();
      const html = node.namespaceURI === HTML_NS;
      const known =
        (html && elements.has(tag)) || (node.namespaceURI === SVG_NS && SVG_ELEMENTS.has(tag));
      if (!known) problems.push(`unread: element ${tag}`);
      const attribute = (name: string) =>
        Option.fromNullishOr(node.attrs.find((attr) => attr.name === name)?.value);
      if (tag === 'meta') {
        const named = Option.orElse(attribute('name'), () => attribute('property'));
        Option.match(named, {
          onNone: () => {
            if (node.attrs.some((attr) => attr.name !== 'charset')) problems.push('unread: meta');
          },
          onSome: (name) => {
            if (SEEN_META.has(name)) blocks.push(...Option.toArray(attribute('content')));
            else if (!UNSEEN_META.has(name)) problems.push(`unread: meta ${name}`);
            if (LINK_CARD_PICTURES.has(name)) {
              const picture = Option.getOrElse(attribute('content'), () => '');
              if (!isDrawnLinkCard(picture)) problems.push(`unread: link card picture ${picture}`);
            }
          },
        });
        return;
      }
      const hidden =
        tag === 'input' &&
        Option.exists(attribute('type'), (type) => type.toLowerCase() === 'hidden');
      const seen: Array<string> = [];
      node.attrs.forEach(({ name, value }) => {
        const lower = name.toLowerCase();
        if (SEEN_ATTRIBUTES.has(lower)) {
          if (!(hidden && lower === 'value')) seen.push(value);
        } else if (!UNSEEN_ATTRIBUTES.has(lower)) {
          problems.push(`unread: attribute ${lower} on ${tag}`);
        }
        if (lower === 'style') take(cssWords(value));
        if (lower === 'href' && /^(?:mailto|sms):[^?]*\?/i.test(value)) {
          problems.push(`unread: link words ${value}`);
        }
      });
      if (
        tag === 'link' &&
        Option.exists(attribute('rel'), (rel) => /stylesheet|import/i.test(rel)) &&
        Option.exists(attribute('href'), (href) => /^(?:[a-z]+:)?\/\//i.test(href))
      ) {
        problems.push(`unread: stylesheet ${Option.getOrElse(attribute('href'), () => '')}`);
      }
      const inner = node.childNodes.filter(isText).map((child) => child.value);
      if (tag === 'script') {
        if (Option.exists(attribute('type'), (type) => type.includes('ld+json'))) {
          take(jsonWords(inner.join('')));
        } else if (inner.join('').trim() !== '') {
          problems.push('unread: inline script');
        }
        return;
      }
      if (tag === 'style') {
        take(cssWords(inner.join('')));
        return;
      }
      const breaks = breakAll || (html && BLOCKS.has(tag)) || (!html && !SVG_INLINE.has(tag));
      pieces.push({ breaks, opens: true });
      seen.forEach((text) => {
        pieces.push({ breaks: true, opens: true }, { text }, { breaks: true, opens: false });
      });
      Option.match(Option.liftPredicate(node, isTemplate), {
        onNone: () => node.childNodes,
        onSome: (template) => template.content.childNodes,
      }).forEach(visit);
      pieces.push({ breaks, opens: false });
    };
    visit(parse(html, { scriptingEnabled: false }));
    const reading = readingOf(pieces);
    return {
      blocks: [reading.text, ...blocks],
      joins: joinsOf(reading.marked),
      problems: [...layoutProblems(reading.text, reading.gaps), ...problems],
    };
  };

const htmlWords = markupWords({ elements: HTML_ELEMENTS, breakAll: false });

const sentencesOf = (blocks: ReadonlyArray<string>): ReadonlyArray<string> =>
  blocks
    .flatMap((block) => fold(block).split('\n'))
    .map(tidy)
    .flatMap((block) => block.split(/(?<=[.?!])\s+(?=\S)/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

const artefactOf = (name: string, kind: string, words: Words): Artefact => {
  const sentences = sentencesOf(words.blocks);
  return {
    name,
    kind,
    sentences,
    joins: words.joins,
    problems: [...new Set([...words.problems, ...sentences.flatMap(characterProblems)])],
  };
};

type Reader = (text: string) => Words;

const DIST_READERS = new Map<string, Reader>([
  ['.html', htmlWords],
  ['.svg', htmlWords],
  ['.xml', markupWords({ elements: XML_ELEMENTS, breakAll: true })],
  ['.css', cssWords],
  ['.txt', textWords],
  ['.webmanifest', jsonWords],
]);

const WORDLESS = new Set([
  ...['dist/og/home.jpg', 'dist/og/land.jpg', 'dist/og/path.jpg', 'dist/og/remedies.jpg'],
  ...['dist/og/taught.jpg', 'dist/apple-touch-icon.png', 'dist/favicon.ico'],
  ...['dist/icon-192.png', 'dist/icon-512.png'],
  ...['dist/assets/field-768.webp', 'dist/assets/field-1536.webp', 'dist/assets/field-3072.webp'],
  ...['dist/assets/night-768.webp', 'dist/assets/night-1536.webp'],
  'dist/assets/field-wind.png',
  ...['dist/assets/Newsreader-normal-latin.woff2', 'dist/assets/Newsreader-normal-latin-ext.woff2'],
  ...['dist/assets/Newsreader-italic-latin.woff2', 'dist/assets/Newsreader-italic-latin-ext.woff2'],
  ...['dist/assets/client.js', 'dist/assets/confirm.js', 'dist/assets/scene.js'],
  ...['dist/assets/Effect.js', 'dist/assets/Data.js'],
]);

const distKind = (file: string) => file.replace(/^(dist\/assets\/.*)-[\w-]{8}(?=\.\w+$)/, '$1');

interface Read {
  readonly artefacts: ReadonlyArray<Artefact>;
  readonly unread: ReadonlyArray<string>;
}

const distArtefacts = Effect.fn('Promise.dist')(function* (dist: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = (yield* fs.readDirectory(dist, { recursive: true })).sort();
  const read = yield* Effect.forEach(entries, (entry) =>
    Effect.gen(function* () {
      const full = path.join(dist, entry);
      const file = `dist/${entry}`;
      if ((yield* fs.stat(full)).type !== 'File') return { artefacts: [], unread: [] };
      if (WORDLESS.has(distKind(file))) return { artefacts: [], unread: [] };
      const reader = Option.fromNullishOr(DIST_READERS.get(path.extname(entry)));
      if (Option.isNone(reader)) return { artefacts: [], unread: [file] };
      const text = yield* fs.readFileString(full);
      return {
        artefacts: [artefactOf(file, distKind(file), reader.value(text))],
        unread: [],
      };
    }),
  );
  return {
    artefacts: read.flatMap(({ artefacts }) => artefacts),
    unread: read.flatMap(({ unread }) => unread),
  } satisfies Read;
});

const ORIGIN = 'https://firsttheblade.com';
const TO = Address.make('reader@example.com');

const FIXTURE_FILMS: ReadonlyArray<Film> = SERIES.map((series) => ({
  ref: `${series.id}/00`,
  series,
  episode: {
    no: '00',
    title: 'A film to come',
    youtubeId: 'film-to-come',
    published: '2026-11-01',
    summary: 'A summary of a film to come.',
  },
}));

const LETTER_HEADERS = new Set(['List-Unsubscribe', 'List-Unsubscribe-Post']);

const letterArtefacts = (): ReadonlyArray<Artefact> => {
  const films: ReadonlyArray<Film> = [
    ...FIXTURE_FILMS,
    ...SERIES.flatMap((series) =>
      series.episodes.map((episode) => ({ ref: `${series.id}/${episode.no}`, series, episode })),
    ),
  ];
  const letters = [
    {
      name: 'letter confirm',
      kind: 'letter confirm',
      letter: confirmLetter(TO, ORIGIN, 'c.token'),
    },
    ...films.map((film) => ({
      name: `letter film ${film.ref}`,
      kind: 'letter film',
      letter: filmLetter(TO, ORIGIN, film, 'u.token'),
    })),
  ];
  return [
    artefactOf('letter sender', 'letter sender', {
      blocks: [FROM.name, FROM.email],
      joins: [],
      problems: [],
    }),
    ...letters.flatMap(({ name, kind, letter }) => {
      const text = textWords(letter.text);
      const headers = Object.keys(letter.headers)
        .filter((header) => !LETTER_HEADERS.has(header))
        .map((header) => `unread: letter header ${header}`);
      return [
        artefactOf(`${name} text`, `${kind} text`, {
          ...text,
          blocks: [letter.subject, ...text.blocks],
          problems: [...text.problems, ...headers],
        }),
        artefactOf(`${name} html`, `${kind} html`, htmlWords(letter.html)),
      ];
    }),
  ];
};

const PASTED = /^## The text to paste\n([\s\S]*?)(?=^## )/m;

const kitArtefacts = Effect.fn('Promise.kit')(function* (app: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const channel = yield* fs.readFileString(path.join(app, 'kit', 'channel.md'));
  const pasted = Option.fromNullishOr(PASTED.exec(channel)?.[1]);
  const pictures = (yield* kitPictures).map((picture) =>
    artefactOf(path.relative(app, picture.out), 'kit picture', htmlWords(picture.html)),
  );
  return Option.match(pasted, {
    onNone: () => ({
      artefacts: pictures,
      unread: ['kit/channel.md (its section "## The text to paste" is gone)'],
    }),
    onSome: (words) => ({
      artefacts: [artefactOf('kit/channel.md', 'kit/channel.md', textWords(words)), ...pictures],
      unread: [],
    }),
  }) satisfies Read;
});

interface Refused {
  readonly name: string;
  readonly kind: string;
  readonly why: 'unheld' | 'layout';
  readonly shown: string;
}

const nettedOf = (artefacts: ReadonlyArray<Artefact>) =>
  artefacts.map((artefact) => ({
    ...artefact,
    netted: artefact.sentences.filter((sentence) => NET.test(sentence)),
    joined: [
      ...new Map(
        artefact.joins
          .filter((join) => NET.test(join.sentence) || NET.test(join.shown))
          .map((join) => [join.shown, join] as const),
      ).values(),
    ],
  }));

const refusedOf = (artefacts: ReadonlyArray<Artefact>): ReadonlyArray<Refused> => {
  const netted = nettedOf(artefacts);
  return [
    ...netted.flatMap(({ name, kind, netted: found }) =>
      found
        .filter(
          (sentence) =>
            !PROMISE_SENTENCES.includes(sentence) && !(HELD.get(kind) ?? []).includes(sentence),
        )
        .map((shown) => ({ name, kind, why: 'unheld' as const, shown })),
    ),
    ...netted.flatMap(({ name, kind, joined }) =>
      joined
        .filter(
          ({ shown, sentence }) =>
            !PROMISE_SENTENCES.includes(sentence) && !(HELD.get(kind) ?? []).includes(shown),
        )
        .map(({ shown }) => ({ name, kind, why: 'layout' as const, shown })),
    ),
  ];
};

const SPELLED = /[\x20-\x7e“”‘’—–·•©]/;

const literalOf = (text: string) => {
  const quote = Match.value(text.split("'").length > text.split('"').length).pipe(
    Match.when(true, () => '"'),
    Match.orElse(() => "'"),
  );
  const body = [...text]
    .map((char) =>
      Match.value(char).pipe(
        Match.when('\\', () => '\\\\'),
        Match.when(quote, () => `\\${quote}`),
        Match.when(
          (other) => SPELLED.test(other),
          (other) => other,
        ),
        Match.orElse((other) =>
          Match.value((other.codePointAt(0) ?? 0).toString(16)).pipe(
            Match.when(
              (code) => code.length <= 4,
              (code) => `\\u${code.padStart(4, '0')}`,
            ),
            Match.orElse((code) => `\\u{${code}}`),
          ),
        ),
      ),
    )
    .join('');
  return `${quote}${body}${quote}`;
};

const SELF = 'apps/firsttheblade/scripts/promise.ts';
const WIDTH = 100;

const entriesOf = (refused: ReadonlyArray<Refused>): ReadonlyArray<string> =>
  [...new Set(refused.map(({ kind }) => kind))].flatMap((kind) => {
    const held = [
      ...new Set(refused.filter((found) => found.kind === kind).map(({ shown }) => shown)),
    ].map(literalOf);
    const them = Match.value(held.length).pipe(
      Match.when(1, () => 'it'),
      Match.orElse(() => 'them'),
    );
    if (HELD.has(kind)) {
      return [
        `promise to hold ${them}, paste into HELD under ${literalOf(kind)} in ${SELF}:`,
        ...held.map((line) => `      ${line},`),
      ];
    }
    const inline = `    ${literalOf(kind)}: [${held.join(', ')}],`;
    return [
      `promise to hold ${them}, paste into HELD in ${SELF}:`,
      ...Match.value(inline).pipe(
        Match.when(
          (line) => line.length <= WIDTH,
          (line) => [line],
        ),
        Match.orElse(() => [
          `    ${literalOf(kind)}: [`,
          ...held.map((line) => `      ${line},`),
          '    ],',
        ]),
      ),
    ];
  });

const problemsOf = ({ artefacts, unread }: Read): ReadonlyArray<string> => {
  const netted = nettedOf(artefacts);
  const saidOn = (kind: string) =>
    new Set(
      netted
        .filter((artefact) => artefact.kind === kind)
        .flatMap(({ netted: found, joined }) => [...found, ...joined.map((join) => join.shown)]),
    );
  return [
    ...new Set([
      ...unread.map((file) => `unread: ${file}`),
      ...artefacts.flatMap(({ name, problems }) =>
        problems.map((problem) => `${name}: ${problem}`),
      ),
      ...refusedOf(artefacts).map(({ name, why, shown }) => `${name}: ${why}: ${shown}`),
      ...netted.flatMap(({ name, kind, netted: found }) => {
        const stated = found.filter((sentence) => PROMISE_SENTENCES.includes(sentence)).length;
        const pinned = STATED.get(kind) ?? 0;
        return [`${name}: states the promise ${stated} times, not ${pinned}`].filter(
          () => stated !== pinned,
        );
      }),
      ...[...new Set([...STATED.keys(), ...HELD.keys()])]
        .filter((kind) => !artefacts.some((artefact) => artefact.kind === kind))
        .map((kind) => `${kind}: no such artefact`),
      ...[...HELD].flatMap(([kind, held]) => {
        const said = saidOn(kind);
        return held
          .filter((sentence) => !said.has(sentence))
          .map((sentence) => `${kind}: gone: ${sentence}`);
      }),
      ...PROMISE_SENTENCES.filter(
        (sentence) => !netted.some(({ netted: found }) => found.includes(sentence)),
      ).map((sentence) => `gone: ${sentence}`),
    ]),
  ];
};

const staleProblems = Effect.fn('Promise.stale')(function* (app: string) {
  const stamp = yield* readStamp(app);
  if (Option.isNone(stamp)) return [`stale: ${STAMP} is missing; run bun run build`];
  const wrote = stamp.value.files;
  const files = yield* builtFiles(app);
  const sources = yield* sourcesHash(app);
  return [
    ...['stale: dist/ was built from other sources; run bun run build'].filter(
      () => sources !== stamp.value.sources,
    ),
    ...Object.entries(files).flatMap(([file, hash]) =>
      Option.match(Option.fromNullishOr(wrote[file]), {
        onNone: () => [`stale: dist/${file} was not written by its build`],
        onSome: (written) =>
          [`stale: dist/${file} changed after its build`].filter(() => written !== hash),
      }),
    ),
    ...Object.keys(wrote)
      .filter((file) => !(file in files))
      .map((file) => `stale: dist/${file} is gone`),
  ];
});

class PromiseBroken extends Data.TaggedError('PromiseBroken')<{ readonly problems: number }> {
  override get message() {
    return `the email list's promise check found ${this.problems} problem(s)`;
  }
}

const check = Effect.gen(function* () {
  const path = yield* Path.Path;
  const app = path.dirname(import.meta.dir);
  const dist = yield* distArtefacts(path.join(app, 'dist'));
  const kit = yield* kitArtefacts(app);
  const read: Read = {
    artefacts: [...dist.artefacts, ...letterArtefacts(), ...kit.artefacts],
    unread: [...dist.unread, ...kit.unread],
  };
  const problems = [...(yield* staleProblems(app)), ...problemsOf(read)];
  yield* Effect.forEach(problems, (problem) => Console.log(`promise ${problem}`));
  yield* Effect.forEach(entriesOf(refusedOf(read.artefacts)), (line) => Console.log(line));
  yield* Effect.logInfo('promise.checked').pipe(
    Effect.annotateLogs({ artefacts: read.artefacts.length, problems: problems.length }),
  );
  if (problems.length > 0) return yield* new PromiseBroken({ problems: problems.length });
});

check.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
