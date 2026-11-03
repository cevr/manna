import { Location } from '@manna/url-state';
import { type JSX, hydrate, render } from '@solidjs/web';
import { Deferred, Effect, Fiber, Option } from 'effect';
import { type BrowserServices, type Host, hostOf } from '../browser/host.ts';
import { BrowserHost } from '../browser/host-browser.ts';
import type { Hub } from '../command/hub.ts';
import { PAGE_CUT, PAGE_MOUNTED, PAGE_ROOT, PAGE_STYLE } from '../core/page-render.ts';
import { showFailure } from '../player/dom.ts';
import { registerFace } from '../player/face.ts';

interface MountedPage {
  readonly bodyClass: string;
  readonly rootClass: string;
  readonly style: string;
  readonly app: () => JSX.Element;
}

type Mounted = 'hydrated' | 'rendered';

interface MountedAs {
  readonly how: Mounted;
  readonly dispose: () => void;
}

const mountPage = (page: MountedPage): MountedAs => {
  document.body.classList.add(page.bodyClass);
  const served = Option.fromNullishOr(document.querySelector(`[${PAGE_ROOT}]`));
  const cut = Option.fromNullishOr(document.querySelector(`[${PAGE_CUT}]`));
  if (Option.isSome(cut)) for (const node of [...Option.toArray(served), cut.value]) node.remove();
  const whole = Option.filter(served, () => Option.isNone(cut));
  const mounted = Option.match(whole, {
    onSome: (served): MountedAs => ({ how: 'hydrated', dispose: hydrate(page.app, served) }),
    onNone: (): MountedAs => ({ how: 'rendered', dispose: rendered(page) }),
  });
  document.body.setAttribute(PAGE_MOUNTED, mounted.how);
  return mounted;
};

const rendered = (page: MountedPage): (() => void) => {
  if (Option.isNone(Option.fromNullishOr(document.querySelector(`[${PAGE_STYLE}]`)))) {
    const style = document.createElement('style');
    style.setAttribute(PAGE_STYLE, '');
    style.textContent = page.style;
    document.head.append(style);
  }
  const root = document.createElement('div');
  root.className = page.rootClass;
  document.body.append(root);
  return render(page.app, root);
};

interface PageEnd {
  readonly fail: (why: string) => Effect.Effect<void>;
  readonly mounted: (page: MountedAs, listening: Fiber.Fiber<unknown>) => Effect.Effect<void>;
}

const makePageEnd: Effect.Effect<PageEnd> = Effect.map(
  Deferred.make<Effect.Effect<void>>(),
  (stop): PageEnd => ({
    fail: (why) =>
      Effect.andThen(
        Effect.flatten(Deferred.await(stop)),
        Effect.sync(() => showFailure(why)),
      ),
    mounted: (page, listening) =>
      Effect.asVoid(
        Deferred.succeed(
          stop,
          Effect.andThen(Effect.sync(page.dispose), Fiber.interrupt(listening)),
        ),
      ),
  }),
);

interface StudioPage {
  readonly page: Omit<MountedPage, 'app'>;
  readonly event: string;
  readonly on: (
    host: Host,
    fail: (why: string) => Effect.Effect<void>,
  ) => Effect.Effect<
    { readonly hub: Hub; readonly app: () => JSX.Element },
    never,
    BrowserServices
  >;
}

export const mountStudio = (studio: StudioPage): void => {
  const host = hostOf(BrowserHost.layer);
  Effect.runSyncWith(host)(
    Effect.gen(function* () {
      registerFace(document.fonts);
      const ending = yield* makePageEnd;
      const { hub, app } = yield* studio.on(host, ending.fail);
      const listening = yield* Effect.forkDetach(hub.listen);
      const mounted = mountPage({ ...studio.page, app });
      yield* ending.mounted(mounted, listening);
      const { href } = yield* Location.use((bar) => bar.current);
      yield* Effect.logInfo(`${studio.event} href=${href} how=${mounted.how}`);
    }),
  );
};
