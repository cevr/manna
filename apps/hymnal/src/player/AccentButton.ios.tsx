/**
 * The player's button on iOS: a native `UIButton` whose title is drawn in
 * the button role on the ground, no fill under it.
 */

import { Button } from 'react-native';

import { useButton } from '~/color';

import type { AccentButtonProps } from './AccentButton';

export function AccentButton({ title, label, onPress }: AccentButtonProps) {
  const tint = useButton();
  return <Button title={title} accessibilityLabel={label} color={tint} onPress={onPress} />;
}
