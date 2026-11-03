import * as Alchemy from 'alchemy';
import * as Cloudflare from '@alchemy.run/cloudflare';
import { Stage } from 'alchemy/Stage';
import { Config, Effect, Redacted } from 'effect';

import { CONTACT, DOMAIN } from '../site.ts';

const contact = Effect.gen(function* () {
  const inbox = yield* Config.Redacted('MAIL_FORWARD_TO');
  const routing = yield* Cloudflare.Email.Routing('MailRouting', { zone: DOMAIN });
  const owner = yield* Cloudflare.Email.Address('OwnerInbox', { email: Redacted.value(inbox) });
  const verified = yield* Config.Boolean('MAIL_FORWARD_VERIFIED').pipe(Config.withDefault(false));
  if (!verified) return;
  yield* Cloudflare.Email.Rule('Contact', {
    zone: { zoneId: routing.zoneId, name: DOMAIN },
    name: 'Contact',
    matchers: [{ type: 'literal', field: 'to', value: CONTACT }],
    actions: [{ type: 'forward', value: [owner.email] }],
  });
});

export const MailDomain = Effect.gen(function* () {
  const zone = yield* Cloudflare.Zone.Zone('Zone', { name: DOMAIN }).pipe(
    Alchemy.AdoptPolicy.adopt(true),
  );
  const sending = yield* Cloudflare.Email.SendingSubdomain('SendingDomain', {
    zoneId: zone.zoneId,
    name: DOMAIN,
    previewEnabled: false,
  }).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());
  if ((yield* Stage) === 'prod') yield* contact;
  return { sending: sending.enabled };
});
