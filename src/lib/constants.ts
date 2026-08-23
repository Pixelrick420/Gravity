import type { Distribution } from './messages';

/** Render buffer layout: [x, y, vx, vy, m], interleaved, one per particle. */
export const FLOATS_PER_PARTICLE = 5;
export const BYTES_PER_PARTICLE = FLOATS_PER_PARTICLE * 4;

/** Fraction of the smaller viewport side spanned by the world. */
export const CAMERA_FIT = 0.5;
/** World point shown at the canvas center (pan target). */
export const WORLD_CENTER = { x: 0, y: 0 };
/** Backdrop color for the additive particle glow. */
export const CLEAR_COLOR: readonly [number, number, number, number] = [0.02, 0.024, 0.04, 1];

export const FIRST_FRAME_MS = 16.7;
export const FRAME_DT_CLAMP_MS = 50;
/** Max physics steps per rendered frame. */
export const MAX_SUBSTEPS = 16;
export const FPS_EMA_DECAY = 0.9;
export const STATS_INTERVAL_MS = 500;

export const INSTANCE_BUFFER_MIN_CAPACITY = 1024;
export const INSTANCE_BUFFER_GROWTH = 2;

/** Non-reactive defaults shared by the store and the worker.
 * Each default sits 5% of the way up its slider's range. */
export const DEFAULT_PARAMS = {
  count: 595,
  seed: 7,
  distribution: 'uniformDisc' as Distribution,
  /** Physics step size in sim seconds; small = high integration resolution. */
  dt: 0.001,
  /** Fraction of real time simulated. 1 = full pace, lower = slow motion. */
  speed: 0.011,
  /** Base particle radius in px; heavy particles scale up from this. */
  particleSize: 1.45,
  paused: false,
};
