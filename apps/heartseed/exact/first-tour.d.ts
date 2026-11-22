/** The tour's states: none, the replayed welcome, the replayed second screen, and home's tips; see `src/first/tour.ts`. */
export type Tour = 'off' | 'welcome' | 'grows' | 'tips';

/** A tap the tour hears. */
export type TourTap = 'Continue' | 'How' | 'Begin' | 'Skip' | 'See' | 'GotIt' | 'Leave';

/** The tour after one tap. */
export declare const tourStep: (tour: Tour, tap: TourTap) => Tour;
