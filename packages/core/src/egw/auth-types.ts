import { Schema } from 'effect';

export class AccessToken extends Schema.Class<AccessToken>('lib/EGW/Auth/AccessToken')({
  accessToken: Schema.Redacted(Schema.NonEmptyString),
  refreshToken: Schema.optional(Schema.Redacted(Schema.NonEmptyString)),
  expiresAt: Schema.Int,
  scope: Schema.String,
}) {
  static fromJson = Schema.decodeEffect(Schema.fromJsonString(this));
  static toJson = Schema.encodeEffect(Schema.fromJsonString(this));

  isExpired(now: number): boolean {
    return this.expiresAt <= now;
  }
}
