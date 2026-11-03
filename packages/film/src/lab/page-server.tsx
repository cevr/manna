import { type JSX, generateHydrationScript, renderToStream } from '@solidjs/web';
import { Effect, Exit, Layer, Scope } from 'effect';
import { onCleanup } from 'solid-js';
import {
  PAGE_ROOT,
  PAGE_STYLE,
  type PageAsked,
  type PageRender,
  type PageRequest,
} from '../core/page-render.ts';
import type { Host } from '../browser/host.ts';
import { ServerHost } from '../browser/host-server.ts';
import { FACE_HEAD, faceHold } from '../player/face.ts';

export const ServerHosted = (props: {
  readonly asked: PageAsked;
  readonly app: (host: Host) => JSX.Element;
}) => {
  const scope = Scope.makeUnsafe();
  onCleanup(() => {
    Effect.runFork(Scope.close(scope, Exit.void));
  });
  return props.app(
    Effect.runSync(Layer.buildWithScope(ServerHost.layer(props.asked.url, props.asked.mac), scope)),
  );
};

interface ServedPage {
  readonly bodyClass: string;
  readonly rootClass: string;
  readonly style: string;
  readonly app: (request: PageRequest) => JSX.Element;
}

export const pageRender = (page: ServedPage): PageRender => ({
  bodyClass: page.bodyClass,
  render: (request, sink) => {
    const heads: Array<string> = [];
    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      sink.head(
        `${FACE_HEAD}${faceHold(`[${PAGE_ROOT}]`).head}${generateHydrationScript()}<style ${PAGE_STYLE}>${page.style}</style>${heads.join('')}`,
      );
      sink.write(`<div class="${page.rootClass}" ${PAGE_ROOT}>`);
    };
    renderToStream(() => page.app(request), {
      signal: request.signal,
      onHead: (html) => {
        heads.push(html);
      },
      onError: (error, context) => {
        if (context.handling === 'failed') sink.fail(String(error));
      },
    }).pipe({
      write: (html) => {
        open();
        sink.write(html);
      },
      end: () => {
        open();
        sink.write('</div>');
        sink.end();
      },
    });
  },
});
