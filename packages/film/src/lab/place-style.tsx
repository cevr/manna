/** `css`, while the place that draws it shows. */
export const PlaceStyle = (props: { readonly css: string }) => (
  <style data-place-style innerHTML={props.css} />
);
