import wheat from '../art/wheat.svg?raw';

export const Wordmark = () => (
  <span class="wordmark" data-logo="">
    First <i>the</i> Blade
  </span>
);

export const Wheat = () => <span class="wheat" innerHTML={wheat} />;

export const Lockup = () => (
  <a class="lockup" href="/">
    <Wheat />
    <Wordmark />
  </a>
);

export const StackedLockup = () => (
  <div class="lockup lockup-stack">
    <Wheat />
    <Wordmark />
  </div>
);
