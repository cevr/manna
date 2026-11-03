export type ServedFrom = 'workers.dev' | 'custom-domain';

export const SERVED_FROM: ServedFrom = 'custom-domain';

export const DOMAIN = 'firsttheblade.com';

export const CONTACT = `hello@${DOMAIN}`;

export const REDIRECTED_DOMAINS = ['firsttheblade.org', 'firsttheblade.net'] as const;

export const WORKER_NAME = 'firsttheblade';

export const WORKERS_DEV_SUBDOMAIN = 'cvr';

const ORIGINS: Record<ServedFrom, string> = {
  'workers.dev': `https://${WORKER_NAME}.${WORKERS_DEV_SUBDOMAIN}.workers.dev`,
  'custom-domain': `https://${DOMAIN}`,
};

export const ORIGIN = ORIGINS[SERVED_FROM];

export const CHANNEL = {
  name: 'First the Blade',
  handle: '@firsttheblade',
  url: 'https://www.youtube.com/@firsttheblade',
  subscribe: 'https://www.youtube.com/@firsttheblade?sub_confirmation=1',
} as const;

export const PROFILES = [
  { name: 'YouTube', url: CHANNEL.url },
  { name: 'Instagram', url: 'https://www.instagram.com/firsttheblade/' },
  { name: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61595704647167' },
] as const;
