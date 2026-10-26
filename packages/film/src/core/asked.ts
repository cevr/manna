// Answers shown in the order they were asked. A page asks the server for
// the same thing several ways (a read, a read again after a source write, a
// say that answers what it leaves), each in its own fresh process, so the
// answers can land in any order. Each ask takes the next number; an answer
// is shown only when nothing asked after it has been shown already, so an
// older read landing late never overwrites a newer say. An answer that was
// overtaken (something was asked after it) may not hold what was asked
// later, nor what was asked later hold it: the page reads again.
//
// This is the one way a page applies an async answer to its state: the
// review's reads and writes, a surface's footage frames
// (`browser/footage.ts`, `paintedIfNewest`). It lives in core so the
// player's surfaces reach it as the lab's pages do. A write's answer reaches a page only as `Landed` (`useWrite` in
// `loaded.tsx` hands nothing else): its value is reachable only through
// `show`, which runs when the ask taken as the write was sent is still the
// newest of that thing's asks. So a new control cannot set state from a
// write's answer out of order: it has no value to set it from.

/** One ask: show its answer when it is still the newest, and whether it was overtaken. */
export interface Ask {
  /** Run `show` unless an answer asked after this one is shown: whether it ran. */
  readonly answer: (show: () => void) => boolean;
  /** Whether something was asked after this. */
  readonly overtaken: () => boolean;
  /** Whether `answer` would run now: no answer asked after this one is shown. */
  readonly newest: () => boolean;
}

/** A page's asks of one thing, numbered as they are made. */
interface Asks {
  readonly ask: () => Ask;
}

/** A fresh count of asks: none asked, none shown. */
export const newestAsked = (): Asks => {
  let asked = 0;
  let shown = 0;
  return {
    ask: () => {
      asked += 1;
      const n = asked;
      return {
        answer: (show) => {
          if (n < shown) return false;
          shown = n;
          show();
          return true;
        },
        overtaken: () => asked > n,
        newest: () => n >= shown,
      };
    },
  };
};
