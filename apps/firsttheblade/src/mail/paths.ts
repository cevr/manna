export const MAIL_ROUTES = {
  subscribe: '/subscribe',
  confirm: '/subscribe/confirm',
  unsubscribe: '/unsubscribe',
  send: '/mail/send',
} as const;

export const MAIL_PAGES = {
  check: '/subscribe/check',
  confirm: '/subscribe/confirm',
  confirmed: '/subscribe/confirmed',
  expired: '/subscribe/expired',
  address: '/subscribe/address',
  busy: '/subscribe/busy',
  leave: '/unsubscribe',
  left: '/unsubscribe/done',
  badLink: '/unsubscribe/invalid',
} as const;

export const SIGNUP_FIELDS = {
  email: 'email',
  honeypot: 'website',
} as const;

export const CONFIRM_FORM_ID = 'confirm';
