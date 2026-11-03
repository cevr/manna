import {
  autoUpdate,
  computePosition,
  flip,
  limitShift,
  type Middleware,
  type MiddlewareData,
  offset,
  type Placement,
  shift as floatingShift,
  size,
  type VirtualElement,
} from '@floating-ui/dom';
import { getAlignment, getSide, getSideAxis } from '@floating-ui/utils';
import type { JSX } from '@solidjs/web';
import { type Accessor, createEffect, createMemo, createSignal, untrack } from 'solid-js';

import type { FloatingRootContext } from '../floating-ui-solid/FloatingRootContext.ts';
import { arrow, hide } from '../floating-ui-solid/middleware.ts';
import { ownerDocument, ownerWindow } from '../utils/dom.ts';

/** The side the popup renders on: under its anchor, or over it after a flip. */
export type Side = 'top' | 'bottom';
export type Align = 'start' | 'center' | 'end';

/** The space kept between the popup and the edges it must stay inside. */
const COLLISION_PADDING = 5;

/** The positioner's CSS variables (upstream's `MenuPositionerCssVars`). */
const PositionerCssVars = {
  /** The available width between the anchor and the edge of the boundary. */
  availableWidth: '--available-width',
  /** The available height between the anchor and the edge of the boundary. */
  availableHeight: '--available-height',
  /** The anchor's width. */
  anchorWidth: '--anchor-width',
  /** The anchor's height. */
  anchorHeight: '--anchor-height',
  /** The coordinates the popup is anchored to, for its animations and transitions. */
  transformOrigin: '--transform-origin',
} as const;

interface UseAnchorPositioningParameters {
  floatingRootContext: FloatingRootContext;
  mounted: boolean;
  /** What the popup is positioned against in place of the trigger. */
  anchor: VirtualElement | undefined;
  positionMethod: 'absolute' | 'fixed';
  sideOffset: number;
  align: Align;
  alignOffset: number;
  /**
   * Whether a shift may move the popup over its anchor, within the viewport,
   * rather than flipping it (a context menu kept on screen at the pointer).
   */
  shiftCrossAxis: boolean;
}

interface UseAnchorPositioningReturnValue {
  positionerStyles: Accessor<JSX.CSSProperties>;
  side: Accessor<Side>;
  align: Accessor<Align>;
  anchorHidden: Accessor<boolean>;
}

function roundByDPR(element: Element, value: number) {
  const dpr = ownerWindow(element).devicePixelRatio || 1;
  return Math.round(value * dpr) / dpr;
}

export function useAnchorPositioning(
  params: UseAnchorPositioningParameters,
): UseAnchorPositioningReturnValue {
  const rootContext = params.floatingRootContext;

  const [x, setX] = createSignal(0, { ownedWrite: true });
  const [y, setY] = createSignal(0, { ownedWrite: true });
  const [renderedPlacement, setRenderedPlacement] = createSignal<Placement>('bottom', {
    ownedWrite: true,
  });
  const [middlewareData, setMiddlewareData] = createSignal<MiddlewareData>(
    {},
    {
      ownedWrite: true,
    },
  );
  const [isPositioned, setIsPositioned] = createSignal(false, { ownedWrite: true });
  const [strategy, setStrategy] = createSignal<'absolute' | 'fixed'>('absolute', {
    ownedWrite: true,
  });

  const placement = createMemo<Placement>(() =>
    params.align === 'center' ? 'bottom' : (`bottom-${params.align}` as Placement),
  );

  createEffect(
    () => params.mounted,
    (mounted) => {
      if (!mounted) {
        setIsPositioned(false);
      }
    },
  );

  const buildMiddleware = (): Middleware[] => {
    const shiftCrossAxis = params.shiftCrossAxis;
    const sideOffset = params.sideOffset;
    const alignOffset = params.alignOffset;
    const common = { boundary: 'clippingAncestors', padding: COLLISION_PADDING } as const;

    const flipPadding = COLLISION_PADDING + 1;
    const flipMiddleware = flip({
      ...common,
      padding: { top: flipPadding + 1, right: flipPadding, bottom: flipPadding, left: flipPadding },
      mainAxis: !shiftCrossAxis,
      crossAxis: 'alignment',
      fallbackAxisSideDirection: 'none',
    });
    const shiftMiddleware = floatingShift({
      ...common,
      rootBoundary: shiftCrossAxis ? 'viewport' : undefined,
      mainAxis: true,
      crossAxis: shiftCrossAxis,
      limiter: shiftCrossAxis ? undefined : limitShift(),
    });

    const avoidance =
      untrack(() => params.align) === 'center'
        ? [shiftMiddleware, flipMiddleware]
        : [flipMiddleware, shiftMiddleware];

    return [
      offset({ mainAxis: sideOffset, crossAxis: alignOffset, alignmentAxis: alignOffset }),
      ...avoidance,
      size({
        ...common,
        apply({ elements: { floating }, availableWidth, availableHeight, rects }) {
          if (!untrack(() => params.mounted)) {
            return;
          }
          const floatingStyle = floating.style;
          floatingStyle.setProperty(PositionerCssVars.availableWidth, `${availableWidth}px`);
          floatingStyle.setProperty(PositionerCssVars.availableHeight, `${availableHeight}px`);

          const dpr = ownerWindow(floating).devicePixelRatio || 1;
          const { x, y, width, height } = rects.reference;
          const anchorWidth = (Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr;
          const anchorHeight = (Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr;
          floatingStyle.setProperty(PositionerCssVars.anchorWidth, `${anchorWidth}px`);
          floatingStyle.setProperty(PositionerCssVars.anchorHeight, `${anchorHeight}px`);
        },
      }),
      arrow((state) => ({ element: ownerDocument(state.elements.floating).createElement('div') })),
      {
        name: 'transformOrigin',
        fn(state) {
          const {
            elements: { floating },
            middlewareData,
            placement: rendered,
            platform,
            rects,
            y,
          } = state;
          const renderedSide = getSide(rendered);
          const renderedAlign = getAlignment(rendered);
          const isVertical = getSideAxis(renderedSide) === 'y';

          let crossOrigin: string;
          if (
            renderedAlign &&
            Math.abs(isVertical ? middlewareData.shift?.x || 0 : middlewareData.shift?.y || 0) <= 1
          ) {
            crossOrigin =
              (renderedAlign === 'start') === (isVertical && platform.isRTL?.(floating) === true)
                ? '100%'
                : '0%';
          } else {
            const arrowOffset = isVertical
              ? middlewareData.arrow?.x || 0
              : middlewareData.arrow?.y || 0;
            crossOrigin = `${arrowOffset}px`;
          }

          let sideOrigin =
            renderedSide === 'top' || renderedSide === 'left'
              ? `calc(100% + ${sideOffset}px)`
              : `${-sideOffset}px`;
          if (shiftCrossAxis && isVertical && Math.abs(middlewareData.shift?.y || 0) > sideOffset) {
            sideOrigin = `${rects.reference.y + rects.reference.height / 2 - y}px`;
          }

          floating.style.setProperty(
            PositionerCssVars.transformOrigin,
            isVertical ? `${crossOrigin} ${sideOrigin}` : `${sideOrigin} ${crossOrigin}`,
          );
          return {};
        },
      },
      hide,
    ];
  };

  let generation = 0;
  const update = () => {
    const reference = untrack(rootContext.referenceElement);
    const floating = untrack(rootContext.floatingElement);
    if (!reference || !floating || !untrack(() => params.mounted)) {
      return;
    }
    const current = ++generation;
    computePosition(reference, floating, {
      placement: untrack(placement),
      strategy: untrack(() => params.positionMethod),
      middleware: buildMiddleware(),
    }).then((data) => {
      if (current !== generation || !untrack(() => params.mounted)) {
        return;
      }
      setX(data.x);
      setY(data.y);
      setRenderedPlacement(data.placement);
      setStrategy(data.strategy);
      setMiddlewareData(() => data.middlewareData);
      setIsPositioned(true);
    });
  };

  createEffect(
    () => (params.mounted ? params.anchor : undefined),
    (anchor) => {
      if (anchor !== undefined) {
        rootContext.setPositionReference(anchor);
      }
    },
  );

  createEffect(
    () => [params.mounted, rootContext.referenceElement(), rootContext.floatingElement()] as const,
    ([mounted, reference, floating]) => {
      if (!mounted || !reference || !floating) {
        return undefined;
      }
      return autoUpdate(reference, floating, update);
    },
  );

  createEffect(
    () => [placement(), params.positionMethod, params.sideOffset, params.alignOffset],
    () => update(),
  );

  const positionerStyles = createMemo<JSX.CSSProperties>(() => {
    const positioned = isPositioned();
    const base: Record<string, string | number | undefined> = {
      position: positioned ? strategy() : 'fixed',
      top: '0px',
      left: '0px',
      [PositionerCssVars.availableWidth]: '100vw',
      [PositionerCssVars.availableHeight]: '100vh',
    };
    if (positioned) {
      const floating = untrack(rootContext.floatingElement);
      const rx = floating ? roundByDPR(floating, x()) : x();
      const ry = floating ? roundByDPR(floating, y()) : y();
      base['transform'] = `translate(${rx}px, ${ry}px)`;
      if (floating && (ownerWindow(floating).devicePixelRatio || 1) >= 1.5) {
        base['will-change'] = 'transform';
      }
    } else {
      base['opacity'] = '0';
    }
    return base as JSX.CSSProperties;
  });

  return {
    positionerStyles,
    side: () => getSide(renderedPlacement()) as Side,
    align: () => (getAlignment(renderedPlacement()) || 'center') as Align,
    anchorHidden: () => Boolean(middlewareData().hide?.referenceHidden),
  };
}
