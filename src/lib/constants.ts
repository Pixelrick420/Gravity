import type { Distribution } from './messages';

export const FLOATS_PER_PARTICLE = 5;
export const BYTES_PER_PARTICLE = FLOATS_PER_PARTICLE * 4;

export const CAMERA_FIT = 0.5;
export const WORLD_CENTER = { x: 0, y: 0 };
export const CLEAR_COLOR: readonly [number, number, number, number] = [0.02, 0.024, 0.04, 1];

export const FIRST_FRAME_MS = 16.7;
export const FRAME_DT_CLAMP_MS = 50;
export const MAX_SUBSTEPS = 16;
export const FPS_EMA_DECAY = 0.9;
export const STATS_INTERVAL_MS = 500;

export const INSTANCE_BUFFER_MIN_CAPACITY = 1024;
export const INSTANCE_BUFFER_GROWTH = 2;

export const GRID_SPACING = 0.05;
export const GRID_MAX_CELLS = 60;
export const GRID_COLOR_DIM: readonly [number, number, number, number] = [0.45, 0.6, 0.85, 0.03];
export const GRID_COLOR_BRIGHT: readonly [number, number, number, number] = [0.65, 0.82, 1.0, 0.45];
/** Every Nth lattice line counts as a major line. */
export const GRID_MAJOR_EVERY = 5;
/** Start fraction for major lines on the dim-to-bright scale. */
export const GRID_MAJOR_INTENSITY = 0.3;
/** Tanh asymptote for grid displacement in world units. */
export const GRID_BEND_MAX = 0.21;
/** Potential scale. Calibrated via speed_stats bin (median phi ~1194 -> 0.08 bend). */
export const GRID_BEND_SCALE = 3.36e-4;
export const GRID_FIELD_EPS2 = 0.01;
export const GRID_REFRESH_DIVISOR = 2000;
export const GRID_REFRESH_MAX_INTERVAL = 6;
/** Trail decay per TRAIL_FADE_SIM_MS_PER_FRAME of simulated time. */
export const TRAIL_FADE_ALPHA = 0.08;

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

/** Shared defaults for the store and the worker. */
export const DEFAULT_PARAMS = {
  count: 595,
  seed: 7,
  distribution: 'uniformDisc' as Distribution,
  dt: 0.001,
  speed: speedFromSlider(17),
  particleSize: 1.45,
  paused: false,
  showGrid: true,
  showTrails: false,
};

/** Sim-ms advanced per rendered frame at the default pace. */
export const TRAIL_FADE_SIM_MS_PER_FRAME = DEFAULT_PARAMS.speed * FIRST_FRAME_MS;

/** Decay to apply after `simDeltaMs` of simulated time between renders. */
export function trailFadeAlpha(simDeltaMs: number): number {
  return 1 - Math.pow(1 - TRAIL_FADE_ALPHA, Math.max(0, simDeltaMs) / TRAIL_FADE_SIM_MS_PER_FRAME);
}
