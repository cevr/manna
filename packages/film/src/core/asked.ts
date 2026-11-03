/** One ask: show its answer when it is still the newest, and whether it was overtaken. */
interface Ask {
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
