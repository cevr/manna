/**
 * Where the screening site is served from. The stack (`../alchemy.run.ts`)
 * reads it; the pages name no origin (every link is a path), so one publish
 * reads the same on any stage.
 *
 * The switch is `SERVED_FROM`. `'custom-domain'` binds `films.cvr.im` (the
 * `cvr.im` zone is in this Cloudflare account, as `egw.cvr.im` is) to the
 * Worker and switches its `workers.dev` host off; `'workers.dev'` serves
 * `prod` from its `workers.dev` host alone.
 */

export type ServedFrom = 'workers.dev' | 'custom-domain';

export const SERVED_FROM: ServedFrom = 'custom-domain';

/** The hostname the owner sends. */
export const DOMAIN = 'films.cvr.im';

/** The Worker's script name on `prod`, which names its `workers.dev` host. */
export const WORKER_NAME = 'screening';

/** The desk's script name on `prod` (`./worker/Desk.ts`), on its `workers.dev` host alone. */
export const DESK_NAME = 'screening-desk';

/** The prod bucket's name. */
export const PROD_BUCKET = 'screening';

/** A bucket name for `stage`: the prod one, else one per stage (R2 takes `a-z 0-9 -`). */
export const bucketName = (stage: string): string => {
  if (stage === 'prod') return PROD_BUCKET;
  return `${PROD_BUCKET}-${stage.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')}`.slice(0, 63);
};
