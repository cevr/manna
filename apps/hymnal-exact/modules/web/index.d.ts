/** The hymnal's app module on the page (`index.js`), as the workspace's typecheck and the Bun tests read it. */

export declare function connect(host: {
  readonly changed: (topic: string) => void;
  readonly agent: boolean;
  readonly now: () => number;
}): void;

/** A request's and an answer's fields: an op's name and numbers, an answer's counts and words. */
type Fields = Readonly<Record<string, string | number | boolean>>;

export declare function later(request: Fields): Promise<Fields>;
