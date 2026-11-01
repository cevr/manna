// The files a page's HTML loads, read by Bun's HTML parser (`HTMLRewriter`):
// each script's `src` and each stylesheet's `href`, as the HTML spells them.
// A script with no `src` runs code the HTML itself holds, whose imports no
// closure follows, so it fails the read.

import { Effect, Option, Schema } from 'effect';

/** A page runs a script its HTML holds inline, so its closure cannot be whole. */
class PageInlineScript extends Schema.TaggedError<PageInlineScript>()('PageInlineScript', {
  page: Schema.String,
}) {
  override get message() {
    return `${this.page} runs an inline script, which no closure follows`;
  }
}

/** The specifiers `html` loads: its scripts' `src` and its stylesheets' `href`, in order. */
export const pageSpecifiers = (page: string, html: string) =>
  Effect.gen(function* () {
    const specifiers: Array<string> = [];
    let inline = false;
    const rewriter = new HTMLRewriter()
      .on('script', {
        element: (el) => {
          Option.match(Option.fromNullishOr(el.getAttribute('src')), {
            onNone: () => {
              inline = true;
            },
            onSome: (src) => {
              specifiers.push(src);
            },
          });
        },
      })
      .on('link[rel="stylesheet"][href]', {
        element: (el) => {
          specifiers.push(el.getAttribute('href') ?? '');
        },
      });
    yield* Effect.promise(() => rewriter.transform(new Response(html)).text());
    if (inline) return yield* PageInlineScript.make({ page });
    return specifiers;
  });
