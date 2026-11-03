export type ServedFrom = 'workers.dev' | 'custom-domain';

export const SERVED_FROM: ServedFrom = 'custom-domain';

export const DOMAIN = 'films.cvr.im';

export const WORKER_NAME = 'screening';

export const DESK_NAME = 'screening-desk';

export const PROD_BUCKET = 'screening';

export const bucketName = (stage: string): string => {
  if (stage === 'prod') return PROD_BUCKET;
  return `${PROD_BUCKET}-${stage.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')}`.slice(0, 63);
};
