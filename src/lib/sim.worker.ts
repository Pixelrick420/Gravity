import init, { Simulation } from '../../simulation-engine/pkg/simulation_engine.js';
import wasmUrl from '../../simulation-engine/pkg/simulation_engine_bg.wasm?url';
import type { InitOutput } from '../../simulation-engine/pkg/simulation_engine.js';
import { GridField } from './gridField';
import { Renderer } from './renderer';
import {
  DEFAULT_PARAMS,
  FIRST_FRAME_MS,
  FLOATS_PER_PARTICLE,
  FPS_EMA_DECAY,
  FRAME_DT_CLAMP_MS,
  GRID_REFRESH_DIVISOR,
  GRID_REFRESH_MAX_INTERVAL,
  MAX_SUBSTEPS,
  STATS_INTERVAL_MS,
  TOTAL_MASS_SCALE,
  WORLD_HALF,
} from './constants';
import { zoomOf } from './world';
import type { TrailSegments } from './renderer';
import type { FromWorker, ParamsPatch, ToWorker } from './messages';

const post = (msg: FromWorker) => self.postMessage(msg);

const state = {
  sim: null as Simulation | null,
  wasm: null as InitOutput | null,
  renderer: null as Renderer | null,
  view: null as Float32Array | null,
  ptr: 0,
  len: -1,
  params: { ...DEFAULT_PARAMS, seed: Math.floor(Math.random() * 1_000_000) },
  halted: false,
  simDeltaMs: 0,
  camCenterX: 0,
  camCenterY: 0,
  zoom: 1,
};

const gridField = new GridField();
let fieldAge = Number.MAX_SAFE_INTEGER;
let wasPaused = false;

const trailSegs: TrailSegments = { verts: new Float32Array(0), count: 0 };
let prevPos = new Float32Array(0);
let prevValid = false;

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

function scaleParticleMasses(sim: Simulation, mass: number) {
  const count = sim.count();
  const len = count * FLOATS_PER_PARTICLE;
  const view = new Float32Array(state.wasm!.memory.buffer, sim.particles_ptr(), len);
  const scale = Math.pow(mass, TOTAL_MASS_SCALE);
  let massSum = 0;
  for (let i = 0; i < count; i++) massSum += view[i * FLOATS_PER_PARTICLE + 4];
  if (massSum > 0) {
    const target = 1000 * scale;
    const norm = target / massSum;
    for (let i = 0; i < count; i++) view[i * FLOATS_PER_PARTICLE + 4] *= norm;
  }
}

let lastT = 0;
let fpsEma = 60;
let lastStatsPost = 0;
let substepAccMs = 0;
let prevRenderAlpha = 0;

function frame(t: number) {
  if (!state.renderer || !state.sim || !state.wasm) return;
  requestAnimationFrame(frame);

  const frameDtMs = lastT === 0 ? FIRST_FRAME_MS : Math.min(t - lastT, FRAME_DT_CLAMP_MS);
  lastT = t;
  fpsEma = fpsEma * FPS_EMA_DECAY + (1000 / Math.max(frameDtMs, 1)) * (1 - FPS_EMA_DECAY);

  try {
    if (!state.params.paused && !state.halted) substepAccMs += frameDtMs * state.params.speed;
    const stepMs = state.params.dt * 1000;
    const budget = Math.floor(substepAccMs / stepMs);
    substepAccMs -= budget * stepMs;
    if (substepAccMs > MAX_SUBSTEPS * stepMs) substepAccMs = MAX_SUBSTEPS * stepMs;

    const executed = Math.min(MAX_SUBSTEPS, budget);

    for (let s = 0; s < executed; s++) {
      state.sim.step(state.params.dt);
    }

    const view2 = syncView();
    const count2 = state.sim.count();
    for (let i = 0; i < count2; i++) {
      const o = i * FLOATS_PER_PARTICLE;
      let x = view2[o];
      let y = view2[o + 1];
      if (x > WORLD_HALF) x -= 2 * WORLD_HALF;
      else if (x < -WORLD_HALF) x += 2 * WORLD_HALF;
      if (y > WORLD_HALF) y -= 2 * WORLD_HALF;
      else if (y < -WORLD_HALF) y += 2 * WORLD_HALF;
      view2[o] = x;
      view2[o + 1] = y;
    }

    const alpha = substepAccMs / stepMs;
    state.sim.render(alpha);

    let simDeltaMs = executed * stepMs + (alpha - prevRenderAlpha) * stepMs;
    prevRenderAlpha = alpha;
    if (simDeltaMs < 0) simDeltaMs = 0;
    state.simDeltaMs = simDeltaMs * Math.sqrt(state.params.speed / 0.011);
  } catch (err) {
    if (!state.halted) {
      state.halted = true;
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const count = state.sim.count();
  const view = syncView();
  const baseZoom = zoomOf(state.renderer.canvas.width, state.renderer.canvas.height);
  const zoom = baseZoom * state.zoom;

  const halfW = state.renderer.canvas.width / (2 * zoom);
  const halfH = state.renderer.canvas.height / (2 * zoom);
  const interval = Math.min(GRID_REFRESH_MAX_INTERVAL, Math.ceil(count / GRID_REFRESH_DIVISOR));
  const pausedEdge = state.params.paused && !wasPaused;
  wasPaused = state.params.paused;

  if (pausedEdge || (!state.params.paused && fieldAge >= interval)) {
    gridField.update(view, count, halfW, halfH, state.camCenterX, state.camCenterY);
    fieldAge = 0;
  } else {
    fieldAge++;
  }

  state.renderer.ensureCapacity(count);

  const pairFloats = count * 2;
  if (prevPos.length !== pairFloats) {
    prevPos = new Float32Array(pairFloats);
    prevValid = false;
  }
  let segs: TrailSegments | null = null;
  if (state.params.showTrails && prevValid) {
    const segFloats = count * 6;
    if (trailSegs.verts.length < segFloats) {
      trailSegs.verts = new Float32Array(segFloats);
    }
    const out = trailSegs.verts;
    for (let i = 0; i < count; i++) {
      const o = i * FLOATS_PER_PARTICLE;
      const s = i * 6;
      out[s] = prevPos[i * 2];
      out[s + 1] = prevPos[i * 2 + 1];
      out[s + 2] = view[o];
      out[s + 3] = view[o + 1];
      out[s + 4] = view[o + 2];
      out[s + 5] = view[o + 3];
    }
    trailSegs.count = count;
    segs = trailSegs;
  }
  for (let i = 0; i < count; i++) {
    prevPos[i * 2] = view[i * FLOATS_PER_PARTICLE];
    prevPos[i * 2 + 1] = view[i * FLOATS_PER_PARTICLE + 1];
  }
  prevValid = true;

  state.renderer.draw(view, count, {
    zoomPxPerUnit: zoom,
    sizePx: state.params.particleSize * state.zoom,
    showGrid: state.params.showGrid,
    showTrails: state.params.showTrails,
    simDeltaMs: state.simDeltaMs,
    grid: gridField.geometry,
    trailSegs: segs,
    camCenterX: state.camCenterX,
    camCenterY: state.camCenterY,
    worldSize: WORLD_HALF * 2,
  });

  if (t - lastStatsPost > STATS_INTERVAL_MS) {
    lastStatsPost = t;
    let cogX = 0;
    let cogY = 0;
    let comX = 0;
    let comY = 0;
    let totalMass = 0;
    for (let i = 0; i < count; i++) {
      const o = i * FLOATS_PER_PARTICLE;
      const m = view[o + 4];
      cogX += view[o] * m;
      cogY += view[o + 1] * m;
      comX += view[o];
      comY += view[o + 1];
      totalMass += m;
    }
    if (totalMass > 0) {
      cogX /= totalMass;
      cogY /= totalMass;
    }
    if (count > 0) {
      comX /= count;
      comY /= count;
    }
    post({ type: 'stats', fps: Math.round(fpsEma), cogX, cogY, comX, comY });
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
        state.wasm = await init({ module_or_path: wasmUrl });
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
    case 'camera':
      state.camCenterX = msg.camCenterX;
      state.camCenterY = msg.camCenterY;
      state.zoom = msg.zoom;
      break;
    case 'reset': {
      state.halted = false;
      state.len = -1;
      fieldAge = Number.MAX_SAFE_INTEGER;
      prevValid = false;
      try {
        state.sim?.reset(msg.count, msg.seed, msg.distribution);
        state.params.count = msg.count;
        state.params.seed = msg.seed;
        state.params.distribution = msg.distribution;
        state.params.particleMass = msg.particleMass;
        scaleParticleMasses(state.sim!, msg.particleMass);
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
