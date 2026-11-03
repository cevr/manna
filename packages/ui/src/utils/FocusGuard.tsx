import type { JSX } from '@solidjs/web';
import { createMemo, omit } from 'solid-js';

import { platform } from './platform.ts';
import { visuallyHidden } from './visuallyHidden.ts';

interface FocusGuardProps {
  ref?: ((el: HTMLSpanElement) => void) | undefined;
  'data-type'?: string | undefined;
  onFocus?: ((event: FocusEvent) => void) | undefined;
  hidden?: boolean | undefined;
}

export function FocusGuard(props: FocusGuardProps): JSX.Element {
  const role = platform.os.apple && platform.engine.webkit ? 'button' : undefined;
  return (
    <span
      ref={props.ref}
      hidden={props.hidden || undefined}
      data-type={props['data-type']}
      onFocusIn={(event) => props.onFocus?.(event)}
      style={visuallyHidden}
      aria-hidden={role ? undefined : 'true'}
      tabindex={0}
      role={role}
      data-base-ui-focus-guard=""
    />
  );
}

interface InternalBackdropProps extends JSX.HTMLAttributes<HTMLDivElement> {
  cutout?: Element | null | undefined;
}

export function InternalBackdrop(props: InternalBackdropProps): JSX.Element {
  const rest = omit(props, 'cutout');
  const clipPath = createMemo(() => {
    const cutout = props.cutout;
    if (!cutout) {
      return undefined;
    }
    const rect = cutout.getBoundingClientRect();
    return `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 0%,${rect.left}px ${rect.top}px,${rect.left}px ${rect.bottom}px,${rect.right}px ${rect.bottom}px,${rect.right}px ${rect.top}px,${rect.left}px ${rect.top}px)`;
  });
  return (
    <div
      role="presentation"
      data-base-ui-inert=""
      {...rest}
      style={{
        position: 'fixed',
        inset: '0',
        'user-select': 'none',
        '-webkit-user-select': 'none',
        'clip-path': clipPath(),
      }}
    />
  );
}
