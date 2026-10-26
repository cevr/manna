// The browser tests' ask page for a server render to hydrate: the ask
// page's own entry (`ask-page.ts`: the real `mountAsk`), bundled with
// Solid's development build (`bundles.ts`), so a mismatch between the
// server's markup and the browser's components is said, as a warning the
// test reads.

import { mountAsk } from '../ask/mount.tsx';

mountAsk();
