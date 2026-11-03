interface Ask {
  readonly answer: (show: () => void) => boolean;
  readonly overtaken: () => boolean;
  readonly newest: () => boolean;
}

interface Asks {
  readonly ask: () => Ask;
}

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
