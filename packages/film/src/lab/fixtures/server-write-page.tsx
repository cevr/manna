import { createSignal } from 'solid-js';
import { pageRender } from '../page-server.tsx';

/** A page whose render sets its own signal: the server write the guard hears. */
export const writingRender = pageRender({
  bodyClass: 'probe',
  rootClass: 'probe-root',
  style: '',
  app: () => {
    const [count, setCount] = createSignal(0);
    setCount(1);
    return <p>{count()}</p>;
  },
});

/** The same page, its state read and never set. */
export const readingRender = pageRender({
  bodyClass: 'probe',
  rootClass: 'probe-root',
  style: '',
  app: () => {
    const [count] = createSignal(1);
    return <p>{count()}</p>;
  },
});
