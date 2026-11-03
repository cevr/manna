/** `#rrggbb`. */
export type Hex = string;

/** A colour as the concept paints it: its lit tone and its one shade. */
export interface Paint {
  readonly base: Hex;
  readonly shade: Hex;
}

/** The paints a member names: each part draws in one of them. */
export type PaintName = 'skin' | 'hair' | 'tunic' | 'mantle' | 'sash' | 'sandal';

/** A point or a direction in head units. */
export type Vec3 = readonly [number, number, number];

/**
 * One cross-section of a loft, from the bottom up: its height, half-width (x),
 * half-depth (z), the centre's z and its squareness (2 an ellipse, higher a
 * rounder square).
 */
export type Section = readonly [
  y: number,
  halfWidth: number,
  halfDepth: number,
  centreZ: number,
  power: number,
];

/**
 * Where a part's shade falls: on the sphere or the upright cylinder round
 * `centre` (the part's own space), so the shade reads as one painted shape
 * whatever bumps the surface carries; `surface` keeps the mesh's own normals.
 */
export interface ShadeProxy {
  readonly kind: 'sphere' | 'cylinder' | 'surface';
  readonly centre: Vec3;
}

/** A half-space `dot(p - point, normal) > 0` in the body's space. */
export interface Plane {
  readonly point: Vec3;
  readonly normal: Vec3;
}

/** A drawn ink oval on the face: its centre and half-sizes on the face plane. */
export interface Oval {
  readonly centre: readonly [number, number];
  readonly radii: readonly [number, number];
}

/** A drawn ink arc on the face: its circle, the arc's span (radians, 0 = +x) and its stroke width. */
export interface Arc {
  readonly centre: readonly [number, number];
  readonly radius: number;
  readonly from: number;
  readonly to: number;
  readonly width: number;
}

/**
 * The face's three marks, drawn on a plane through the head's centre and
 * carried onto the head along a direction that leans from the head's front
 * toward the camera by `lean`, so a turned face keeps its marks' drawn shapes.
 */
export interface Face {
  readonly eyes: readonly [Oval, Oval];
  readonly brows: readonly [Arc, Arc];
  readonly mouth: Arc;
  readonly lean: number;
}

/** One sleeve with its hand: the bones' rest pivots and the tube's radius from shoulder to cuff. */
export interface Arm {
  readonly shoulder: Vec3;
  readonly upper: number;
  readonly fore: number;
  /** The arm's hang at rest: rotation (radians) about z, then x, at the shoulder. */
  readonly hang: readonly [abduct: number, swing: number];
  /** The sleeve's radius at the shoulder, the elbow and the cuff. */
  readonly radii: readonly [number, number, number];
  readonly hand: number;
  readonly paint: PaintName;
}

/** The curl cap: a shell over the skull, cut at a hairline, carrying small round curls. */
export interface Hair {
  readonly sections: ReadonlyArray<Section>;
  /** The hairline's height (head space) at the front, the sides and the back. */
  readonly line: readonly [front: number, side: number, back: number];
  readonly curls: { readonly count: number; readonly radius: number; readonly lift: number };
}

/** The sash: a band round the waist, a knot at the front and two ends to the knees. */
export interface Sash {
  readonly y: number;
  readonly height: number;
  readonly swell: number;
  readonly knot: { readonly radius: number; readonly offset: Vec3 };
  readonly ends: ReadonlyArray<{
    readonly top: Vec3;
    readonly bottom: Vec3;
    readonly width: number;
  }>;
}

/**
 * A cast member as a code-built toon figure: every number the builder reads,
 * in head units (1 = the head's height from the top of the hair to the chin),
 * with y up from the soles, x to his left and z toward the viewer at the front
 * view. A second member is a second value of `MemberSpec`, never new code.
 */
export interface MemberSpec {
  readonly name: string;
  readonly paints: Record<PaintName, Paint>;
  readonly ink: { readonly colour: Hex; readonly outline: number; readonly inner: number };
  readonly paper: Hex;
  readonly shadow: { readonly colour: Hex; readonly radii: readonly [number, number] };
  readonly light: { readonly direction: Vec3; readonly threshold: number; readonly soft: number };
  readonly head: {
    readonly base: Vec3;
    readonly sections: ReadonlyArray<Section>;
    readonly proxy: ShadeProxy;
    readonly face: Face;
    readonly ears: {
      readonly y: number;
      readonly x: number;
      readonly z: number;
      readonly radii: Vec3;
    };
  };
  readonly hair: Hair;
  readonly neck: ReadonlyArray<Section>;
  readonly body: { readonly sections: ReadonlyArray<Section>; readonly proxy: ShadeProxy };
  readonly mantle: { readonly edge: Plane; readonly hem: Plane };
  readonly sash: Sash;
  readonly arms: { readonly right: Arm; readonly left: Arm };
  readonly feet: {
    readonly x: number;
    readonly radii: Vec3;
    readonly z: number;
    readonly sole: number;
    readonly strap: readonly [number, number];
  };
}

/** A pose: each arm's shoulder rotation (radians about x, then z), elbow bend and wrist bend. */
export interface ArmPose {
  readonly raise: number;
  readonly abduct: number;
  readonly elbow: number;
  readonly wrist: number;
  /** The elbow's hinge as a rotation (radians) of the bend's plane about the upper arm. */
  readonly twist: number;
}

export interface Pose {
  readonly right: ArmPose;
  readonly left: ArmPose;
}

export const REST_ARM: ArmPose = { raise: 0, abduct: 0, elbow: 0, wrist: 0, twist: 0 };
export const REST: Pose = { right: REST_ARM, left: REST_ARM };
