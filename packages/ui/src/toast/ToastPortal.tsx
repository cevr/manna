import type { JSX } from '@solidjs/web';

import { FloatingPortal, type FloatingPortalProps } from '../floating-ui-solid/FloatingPortal.tsx';

interface ToastPortalProps extends FloatingPortalProps {}

export function ToastPortal(props: ToastPortalProps): JSX.Element {
  return <FloatingPortal {...props} />;
}
