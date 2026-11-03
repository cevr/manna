import { Effect, Option, Schema } from 'effect';

class PageInlineScript extends Schema.TaggedError<PageInlineScript>()('PageInlineScript', {
  page: Schema.String,
}) {
  override get message() {
    return `${this.page} runs an inline script, which no closure follows`;
  }
}

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
