/** The list's waits, as the D1 list (`../mail/list.ts`) and the tokens (`../mail/tokens.ts`) keep them. */
import { Duration } from 'effect';

/** How long after a confirm link another may be sent to the same address. */
export const RESEND_AFTER = Duration.hours(1);

/** How long a confirm link works after it is sent. */
export const CONFIRM_FOR = Duration.days(7);

/**
 * How long a sign-up that is not confirmed is kept. Longer than a confirm
 * link works, so no link that still works names a forgotten subscriber.
 */
export const PENDING_FOR = Duration.days(30);
