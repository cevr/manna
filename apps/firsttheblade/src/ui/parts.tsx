import { For } from '@solidjs/web';
import type { JSX } from '@solidjs/web';

import { MARK_4_27, type Series, UNITS, type Verse } from '../content.ts';
import { CHANNEL, PROFILES } from '../site.ts';
import { EMBLEM_DRAWINGS, FIELD, NIGHT } from './art.ts';
import { StackedLockup } from './brand.tsx';
import { PRIVACY_PATH } from '../pages.ts';
import { SignUp } from './mail.tsx';
import { FOOTER_NAV_ID, NAV, SUBSCRIBE } from './nav.ts';

export const seriesHref = (series: Series) => `/series/${series.slug}`;

export const unitOf = (series: Series) => UNITS[series.form].many;

export const statusOf = (series: Series) => {
  const units = UNITS[series.form];
  const count = series.episodes.length;
  if (count === 0) return `No ${units.many} out yet`;
  if (count === 1) return `1 ${units.one} out`;
  return `${count} ${units.many} out`;
};

interface FieldProps {
  readonly children: JSX.Element;
}

interface FieldArtProps {
  readonly sizes: string;
}

const FieldArt = (props: FieldArtProps) => (
  <img
    class="field-art"
    src={FIELD.src}
    srcset={FIELD.srcset}
    sizes={props.sizes}
    alt=""
    width="1536"
    height="1024"
    fetchpriority="high"
  />
);

const FieldPaint = (props: FieldArtProps) => (
  <div class="field-paint">
    <FieldArt sizes={props.sizes} />
  </div>
);

export const HomeField = (props: FieldProps) => (
  <div class="field field-home">
    <FieldPaint sizes="(min-width: 77rem) 100vw, 77rem" />
    {props.children}
  </div>
);

export const PageField = (props: FieldProps) => (
  <div class="field field-page">
    <FieldPaint sizes="(min-width: 42rem) 100vw, 42rem" />
    {props.children}
  </div>
);

interface QuoteProps {
  readonly verse: Verse;
}

export const Quote = (props: QuoteProps) => (
  <figure class="verse">
    <blockquote>
      <p>“{props.verse.text}”</p>
    </blockquote>
    <figcaption class="ref">{props.verse.ref}</figcaption>
  </figure>
);

interface SeriesCardProps {
  readonly series: Series;
}

export const SeriesCard = (props: SeriesCardProps) => {
  const s = props.series;
  return (
    <li class="card">
      <span class="tile">
        <span
          class={`emblem emblem-${s.id}`}
          aria-hidden="true"
          innerHTML={EMBLEM_DRAWINGS[s.id]}
        />
      </span>
      <div class="card-words">
        <p class="label">
          <span class="nowrap">{s.subject}</span> · <span class="nowrap">{s.form}</span>
        </p>
        <h3>
          <a href={seriesHref(s)}>{s.name}</a>
        </h3>
        <p class="line">{s.line}</p>
      </div>
      <p class="status">{statusOf(s)}</p>
    </li>
  );
};

interface CardsProps {
  readonly series: ReadonlyArray<Series>;
}

export const Cards = (props: CardsProps) => (
  <ul class="cards">
    <For each={props.series}>{(s) => <SeriesCard series={s} />}</For>
  </ul>
);

export const Dusk = () => (
  <div class="dusk">
    <Quote verse={MARK_4_27} />
  </div>
);

export const NightClose = () => (
  <section class="night" aria-labelledby="night-title">
    <div class="night-paint">
      <img
        class="night-art"
        src={NIGHT.src}
        srcset={NIGHT.srcset}
        sizes="(min-width: 65rem) 100vw, 65rem"
        alt=""
        width="1536"
        height="1024"
        loading="lazy"
      />
      <div class="night-veil" />
    </div>
    <div class="night-words">
      <StackedLockup />
      <h2 id="night-title">See each new film</h2>
      <p>
        Subscribe to the channel on YouTube: <span class="nowrap">{CHANNEL.handle}</span>
      </p>
      <a class="button button-night" href={SUBSCRIBE.href}>
        <span class="button-label">{SUBSCRIBE.label}</span>
      </a>
      <SignUp />
    </div>
  </section>
);

export const Footer = () => (
  <footer class="site-footer">
    <nav aria-label="Site" id={FOOTER_NAV_ID}>
      <ul class="footer-links">
        <li>
          <a href="/">Home</a>
        </li>
        <For each={NAV}>
          {(link) => (
            <li>
              <a href={link.href}>{link.label}</a>
            </li>
          )}
        </For>
        <For each={PROFILES}>
          {(profile) => (
            <li>
              <a href={profile.url}>{profile.name}</a>
            </li>
          )}
        </For>
        <li>
          <a href={PRIVACY_PATH}>Privacy</a>
        </li>
      </ul>
    </nav>
    <p class="footer-fine">
      <span>
        Scripture quotations from the <span class="nowrap">King James Version</span>
      </span>
      <span class="nowrap">© 2026</span>
    </p>
  </footer>
);
