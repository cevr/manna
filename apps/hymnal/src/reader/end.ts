/**
 * The space a list keeps after its last row, so the row ends clear of what
 * lies under the list: the home indicator, or the bar docked under the stack
 * while it shows. It comes from the bottom inset the list meets
 * (`useStackBottom`): the device's inset with no bar, none over the bar.
 */

/** The room between the last row and the bottom inset, in points. */
export const END_ROOM = 32;

/** The end space for a bottom safe-area inset of `bottom` points. */
export const endSpace = (bottom: number) => Math.max(0, bottom) + END_ROOM;

/**
 * The end space a list keeps over the bottom inset it meets
 * (`stackBottom`), or over the bar's `#` where it stands higher
 * (`findRoom`): the one space the list's last row, its rail's end and its
 * clamped start all keep.
 */
export const listEndSpace = (stackBottom: number, findRoom: number) =>
  endSpace(Math.max(stackBottom, findRoom));
