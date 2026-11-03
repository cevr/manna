import { Schema } from 'effect';

export class NoSession extends Schema.TaggedError<NoSession>()('NoSession', {
  file: Schema.String,
}) {
  override get message() {
    return `no drive is booted (no ${this.file}); run sim boot first`;
  }
}

export class SimulatorDown extends Schema.TaggedError<SimulatorDown>()('SimulatorDown', {
  name: Schema.String,
  state: Schema.String,
}) {
  override get message() {
    return `simulator ${this.name} is ${this.state}, not Booted; run sim boot`;
  }
}

export class ReadinessTimedOut extends Schema.TaggedError<ReadinessTimedOut>()(
  'ReadinessTimedOut',
  { what: Schema.String, seconds: Schema.Finite },
) {
  override get message() {
    return `${this.what} was not ready after ${this.seconds} s`;
  }
}

export class TargetMissing extends Schema.TaggedError<TargetMissing>()('TargetMissing', {
  target: Schema.String,
  platform: Schema.String,
  driver: Schema.String,
}) {
  override get message() {
    return `no element ${this.target} on the ${this.platform} screen (${this.driver})`;
  }
}

export class ToolMissing extends Schema.TaggedError<ToolMissing>()('ToolMissing', {
  tool: Schema.String,
}) {
  override get message() {
    return `${this.tool} is not installed`;
  }
}

export class ToolFailed extends Schema.TaggedError<ToolFailed>()('ToolFailed', {
  tool: Schema.String,
  args: Schema.Array(Schema.String),
  exitCode: Schema.Finite,
  output: Schema.String,
}) {
  override get message() {
    return `${this.tool} ${this.args.join(' ')} exited ${this.exitCode}: ${this.output}`;
  }
}

export class NotOnPlatform extends Schema.TaggedError<NotOnPlatform>()('NotOnPlatform', {
  command: Schema.String,
  platform: Schema.String,
}) {
  override get message() {
    return `sim ${this.command} does not run on ${this.platform}`;
  }
}

export class HostFailed extends Schema.TaggedError<HostFailed>()('HostFailed', {
  reason: Schema.String,
}) {
  override get message() {
    return this.reason;
  }
}

export class BadArguments extends Schema.TaggedError<BadArguments>()('BadArguments', {
  command: Schema.String,
  problems: Schema.Array(Schema.String),
}) {
  override get message() {
    return `${this.command}: ${this.problems.join('; ')} (run ${this.command} --help)`;
  }
}

export class Unhealthy extends Schema.TaggedError<Unhealthy>()('Unhealthy', {
  check: Schema.String,
  reason: Schema.String,
}) {
  override get message() {
    return `${this.check}: ${this.reason}`;
  }
}

export class WarmCheckout extends Schema.TaggedError<WarmCheckout>()('WarmCheckout', {
  checkout: Schema.String,
}) {
  override get message() {
    return `${this.checkout} is a warm checkout, which no drive may build or write in; use a worktree`;
  }
}

export class BadJourney extends Schema.TaggedError<BadJourney>()('BadJourney', {
  file: Schema.String,
  issue: Schema.String,
}) {
  override get message() {
    return `${this.file}: ${this.issue}`;
  }
}

export class TargetShown extends Schema.TaggedError<TargetShown>()('TargetShown', {
  target: Schema.String,
}) {
  override get message() {
    return `${this.target} still shows`;
  }
}

export const SimError = Schema.Union([
  WarmCheckout,
  BadJourney,
  TargetShown,
  NoSession,
  SimulatorDown,
  ReadinessTimedOut,
  TargetMissing,
  ToolMissing,
  ToolFailed,
  NotOnPlatform,
  HostFailed,
  BadArguments,
  Unhealthy,
]);
export type SimError = typeof SimError.Type;
