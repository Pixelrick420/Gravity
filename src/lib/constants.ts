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

/** World-unit spacing between grid lines before adaptive widening kicks in. */
export const GRID_SPACING = 0.05;
/** Cap on grid cells per axis, keeping the CPU field affordable on wide windows. */
export const GRID_MAX_CELLS = 60;
/** Grid line color in flat space, and near gravity wells (mixed by field intensity). */
export const GRID_COLOR_DIM: readonly [number, number, number, number] = [0.45, 0.6, 0.85, 0.03];
export const GRID_COLOR_BRIGHT: readonly [number, number, number, number] = [0.65, 0.82, 1.0, 0.45];
/** Every Nth lattice line counts as a major line. */
export const GRID_MAJOR_EVERY = 5;
/** Mix fraction toward the bright color a major line starts at in flat space. */
export const GRID_MAJOR_INTENSITY = 0.3;
/** tanh asymptote of grid displacement in world units; only extreme wells approach it. */
export const GRID_BEND_MAX = 0.21;
/**
 * Calibrated (speed_stats bin): potential scale so the pooled median lattice
 * potential (~1194) bends a typical vertex ~0.08 units; p95 -> ~0.16.
 */
export const GRID_BEND_SCALE = 3.36e-4;
/** Softening for field sampling; wider than the physics softening for smooth wells. */
export const GRID_FIELD_EPS2 = 0.01;
/** Recompute the displaced grid every ceil(count / this) frames, clamped to the max. */
export const GRID_REFRESH_DIVISOR = 2000;
export const GRID_REFRESH_MAX_INTERVAL = 6;
/** Trail decay per TRAIL_FADE_SIM_MS_PER_FRAME of *simulated* time, so a
 * trail's world-space length stays fixed regardless of playback speed. */
export const TRAIL_FADE_ALPHA = 0.08;

/** Speed slider shows 0–100 while internally spanning SPEED_MIN..SPEED_MAX. */
export const SPEED_SLIDER_MIN = 0;
export const SPEED_SLIDER_MAX = 100;
export const SPEED_MIN = 0.001;
export const SPEED_MAX = 0.06;

export function speedFromSlider(v: number): number {
  return SPEED_MIN + (v / SPEED_SLIDER_MAX) * (SPEED_MAX - SPEED_MIN);
}

export function speedToSlider(speed: number): number {
  return Math.round(((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * SPEED_SLIDER_MAX);
}

/** Non-reactive defaults shared by the store and the worker.
 * Each default sits 5% of the way up its slider's range, except speed:
 * its value preserves the pre-rescale default pace (slider ~17/100). */
export const DEFAULT_PARAMS = {
  count: 595,
  seed: 7,
  distribution: 'uniformDisc' as Distribution,
  /** Physics step size in sim seconds; small = high integration resolution. */
  dt: 0.001,
  /** Fraction of real time simulated; see speedFromSlider/speedToSlider. */
  speed: speedFromSlider(17),
  /** Base particle radius in px; heavy particles scale up from this. */
  particleSize: 1.45,
  paused: false,
  showGrid: true,
  showTrails: false,
};

/** Sim-ms advanced per rendered frame at the default pace — the decay
 * window TRAIL_FADE_ALPHA is calibrated against. */
export const TRAIL_FADE_SIM_MS_PER_FRAME = DEFAULT_PARAMS.speed * FIRST_FRAME_MS;

/** Decay to apply after `simDeltaMs` of simulated time elapsed between renders. */
export function trailFadeAlpha(simDeltaMs: number): number {
  return 1 - Math.pow(1 - TRAIL_FADE_ALPHA, Math.max(0, simDeltaMs) / TRAIL_FADE_SIM_MS_PER_FRAME);
}
