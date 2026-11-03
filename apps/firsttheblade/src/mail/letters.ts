import { Option } from 'effect';

import { CHANNEL } from '../site.ts';
import { UNITS } from '../content.ts';
import { PALETTE } from '../palette.ts';
import type { Address } from './address.ts';
import type { Film } from './films.ts';
import type { Letter } from './mailer.ts';
import { PROMISE } from './promise.ts';

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const FONT = "Georgia, 'Times New Roman', serif";

const para = (text: string, style = '') =>
  `<p style="margin:0 0 16px;${style}">${escape(text)}</p>`;

const link = (href: string, words: string) =>
  `<a href="${escape(href)}" style="color:${PALETTE.accent};">${escape(words)}</a>`;

const button = (href: string, words: string) =>
  `<p style="margin:24px 0;"><a href="${escape(href)}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:${PALETTE.ink};color:${PALETTE.paper};text-decoration:none;font-weight:600;">${escape(words)}</a></p>`;

const page = (title: string, body: string) =>
  [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${PALETTE.paper};">`,
    `<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:${FONT};font-size:17px;line-height:1.55;color:${PALETTE.ink};">`,
    body,
    '</div></body></html>',
  ].join('');

export const POSTAL_ADDRESS: Option.Option<string> = Option.none();

const postalHtml = (postal: Option.Option<string>) =>
  Option.toArray(postal)
    .map((line) => `<br>${escape(line)}`)
    .join('');

const signOff = (origin: string, postal: Option.Option<string>) => [
  CHANNEL.name,
  origin.replace(/^https?:\/\//, ''),
  ...Option.toArray(postal),
];

export const confirmLink = (origin: string, token: string) =>
  `${origin}/subscribe/confirm?token=${encodeURIComponent(token)}`;

export const unsubscribeLink = (origin: string, token: string) =>
  `${origin}/unsubscribe?token=${encodeURIComponent(token)}`;

export const confirmLetter = (
  to: Address,
  origin: string,
  token: string,
  postal = POSTAL_ADDRESS,
): Letter => {
  const href = confirmLink(origin, token);
  const subject = `Confirm your email for ${CHANNEL.name}`;
  const asked = `Someone, we hope it was you, asked ${CHANNEL.name} for ${PROMISE}.`;
  const ask = `${asked} To confirm, open this link:`;
  const after =
    'The link works for seven days. If this was not you, you do not need to do anything. We will not send any films to this address unless the link is opened.';
  const text = ['Hello,', '', ask, '', href, '', after, '', ...signOff(origin, postal), ''].join(
    '\n',
  );
  const html = page(
    subject,
    [
      para('Hello,'),
      para(asked),
      button(href, 'Confirm my email'),
      para(after),
      `<p style="margin:24px 0 0;color:${PALETTE.soft};">${escape(CHANNEL.name)}<br>${link(origin, signOff(origin, postal)[1] ?? origin)}${postalHtml(postal)}</p>`,
    ].join(''),
  );
  return { to, subject, text, html, headers: {} };
};

const watchUrl = (film: Film) => `https://www.youtube.com/watch?v=${film.episode.youtubeId}`;

export const filmLetter = (
  to: Address,
  origin: string,
  film: Film,
  token: string,
  postal = POSTAL_ADDRESS,
): Letter => {
  const { series, episode } = film;
  const unit = UNITS[series.form].one;
  const leave = unsubscribeLink(origin, token);
  const seriesUrl = `${origin}/series/${series.slug}`;
  const subject = `A new ${unit}: ${episode.title}`;
  const lead = `A new ${unit} is out in ${series.name}:`;
  const heading = `${episode.no} · ${episode.title}`;
  const why = `You get this because you joined the ${CHANNEL.name} list, which sends ${PROMISE}.`;
  const text = [
    lead,
    '',
    heading,
    '',
    episode.summary,
    '',
    'Watch it on YouTube:',
    watchUrl(film),
    '',
    `The series: ${seriesUrl}`,
    '',
    ...signOff(origin, postal),
    '',
    `${why} To leave the list: ${leave}`,
    '',
  ].join('\n');
  const html = page(
    subject,
    [
      para(lead, `color:${PALETTE.soft};`),
      `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:600;">${escape(heading)}</h1>`,
      para(episode.summary),
      button(watchUrl(film), 'Watch it on YouTube'),
      `<p style="margin:0 0 16px;">The series: ${link(seriesUrl, series.name)}</p>`,
      `<p style="margin:32px 0 0;font-size:14px;color:${PALETTE.soft};">${escape(why)} ${link(leave, 'Leave the list')}${postalHtml(postal)}</p>`,
    ].join(''),
  );
  return {
    to,
    subject,
    text,
    html,
    headers: {
      'List-Unsubscribe': `<${leave}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
};
