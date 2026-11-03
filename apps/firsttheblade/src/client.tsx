import { render } from '@solidjs/web';
import { Effect } from 'effect';

import { MENU_SLOT_ID } from './ui/header.tsx';
import { CONFIRM_FORM_ID } from './mail/paths.ts';
import { LESS_MOTION, raysTurn } from './motion/query.ts';
import { PhoneMenu } from './ui/phone-menu.tsx';
import './styles.css';

const slot = document.getElementById(MENU_SLOT_ID);
if (slot instanceof HTMLElement) {
  slot.replaceChildren();
  render(() => <PhoneMenu />, slot);
}

const loadConfirm = () => import('./confirm.ts');

const confirmForm = document.getElementById(CONFIRM_FORM_ID);
if (confirmForm instanceof HTMLFormElement) {
  void loadConfirm().then(({ confirmInPlace }) => Effect.runFork(confirmInPlace(confirmForm)));
}

const loadMotion = () => import('./motion/scene.ts');

const less = matchMedia(LESS_MOTION);
if (!less.matches && document.querySelector('img.field-art, img.night-art')) {
  const turning = raysTurn((query) => matchMedia(query).matches);
  void loadMotion().then(({ moveTheStills }) => Effect.runFork(moveTheStills(less, turning)));
}
