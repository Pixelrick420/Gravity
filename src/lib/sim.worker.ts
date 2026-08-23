import init, { Simulation } from '../../simulation-engine/pkg/simulation_engine.js';
import wasmUrl from '../../simulation-engine/pkg/simulation_engine_bg.wasm?url';
import type { InitOutput } from '../../simulation-engine/pkg/simulation_engine.js';
import { Renderer } from './renderer';
import {
  DEFAULT_PARAMS,
  FIRST_FRAME_MS,
  FLOATS_PER_PARTICLE,
  FPS_EMA_DECAY,
  FRAME_DT_CLAMP_MS,
  MAX_SUBSTEPS,
  STATS_INTERVAL_MS,
} from './constants';
import { zoomOf } from './world';
import type { FromWorker, ParamsPatch, ToWorker } from './messages';

const post = (msg: FromWorker) => self.postMessage(msg);

const state = {
  sim: null as Simulation | null,
  wasm: null as InitOutput | null,
  renderer: null as Renderer | null,
  view: null as Float32Array | null,
  ptr: 0,
  len: -1,
  params: { ...DEFAULT_PARAMS },
  halted: false,
};

function syncView(): Float32Array {
  const sim = state.sim!;
  const count = sim.count();
  const len = count * FLOATS_PER_PARTICLE;
  if (!state.view || len !== state.len || sim.particles_ptr() !== state.ptr) {
    state.ptr = sim.particles_ptr();
    state.len = len;
    state.view = new Float32Array(state.wasm!.memory.buffer, state.ptr, len);
  }
  return state.view;
}

function applyPatch(patch: ParamsPatch) {
  Object.assign(state.params, patch);
}

let lastT = 0;
let fpsEma = 60;
let lastStatsPost = 0;
/** Leftover sim-time budget, in ms, carried between frames. */
let substepAccMs = 0;

function frame(t: number) {
  if (!state.renderer || !state.sim || !state.wasm) return;
  requestAnimationFrame(frame);

  const frameDtMs = lastT === 0 ? FIRST_FRAME_MS : Math.min(t - lastT, FRAME_DT_CLAMP_MS);
  lastT = t;
  fpsEma = fpsEma * FPS_EMA_DECAY + (1000 / Math.max(frameDtMs, 1)) * (1 - FPS_EMA_DECAY);

  try {
    // Speed scales the sim-time budget, never the per-step dt. `alpha` is
    // the leftover fraction of a step; rendering between the last two states
    // at that fraction makes motion smooth at any speed, even with zero
    // steps this frame.
    if (!state.params.paused && !state.halted) substepAccMs += frameDtMs * state.params.speed;
    const stepMs = state.params.dt * 1000;
    const budget = Math.floor(substepAccMs / stepMs);
    substepAccMs -= budget * stepMs;
    if (substepAccMs > MAX_SUBSTEPS * stepMs) substepAccMs = MAX_SUBSTEPS * stepMs;

    let substeps = Math.min(MAX_SUBSTEPS, budget);
    while (substeps-- > 0) {
      state.sim.step(state.params.dt);
    }
    const alpha = substepAccMs / stepMs;
    state.sim.render(alpha);
  } catch (err) {
    if (!state.halted) {
      state.halted = true;
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const count = state.sim.count();
  state.renderer.ensureCapacity(count);
  state.renderer.draw(
    syncView(),
    count,
    zoomOf(state.renderer.canvas.width, state.renderer.canvas.height),
    state.params.particleSize,
  );

  if (t - lastStatsPost > STATS_INTERVAL_MS) {
    lastStatsPost = t;
    post({ type: 'stats', fps: Math.round(fpsEma) });
  }
}

function reportError(err: unknown) {
  state.halted = true;
  post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init': {
      try {
        state.wasm = await init(wasmUrl);
        state.sim = new Simulation(state.params.count, state.params.seed, state.params.distribution);
        state.len = -1;
        state.renderer = new Renderer(msg.canvas);
        state.renderer.resize(msg.width, msg.height);
        requestAnimationFrame(frame);
        post({ type: 'ready' });
      } catch (err) {
        reportError(err);
      }
      break;
    }
    case 'params':
      applyPatch(msg.patch);
      break;
    case 'reset': {
      state.halted = false;
      state.len = -1;
      try {
        state.sim?.reset(msg.count, msg.seed, msg.distribution);
        state.params.count = msg.count;
        state.params.seed = msg.seed;
        state.params.distribution = msg.distribution;
      } catch (err) {
        reportError(err);
      }
      break;
    }
    case 'resize':
      state.renderer?.resize(msg.width, msg.height);
      break;
  }
};
