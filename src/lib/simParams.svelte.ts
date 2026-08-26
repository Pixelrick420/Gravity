import { DEFAULT_PARAMS, speedFromSlider, speedToSlider } from './constants';
import type { ParamsPatch } from './messages';

const STORAGE_KEY = 'gravity-params';

const CACHED_KEYS = [
  'count', 'distribution', 'speed', 'particleSize', 'particleMass',
  'showGrid', 'showTrails', 'showCenterOfGravity',
] as const;

function load(): Record<string, unknown> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

function save(simParams: SimParams) {
  const out: Record<string, unknown> = {};
  for (const k of CACHED_KEYS) out[k] = simParams[k];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
}

const cached = load();

export class SimParams {
  count = $state((cached.count as number) ?? DEFAULT_PARAMS.count);
  seed = $state(Math.floor(Math.random() * 1_000_000));
  distribution = $state((cached.distribution as typeof DEFAULT_PARAMS.distribution) ?? DEFAULT_PARAMS.distribution);
  dt = $state(DEFAULT_PARAMS.dt);
  speed = $state((cached.speed as number) ?? DEFAULT_PARAMS.speed);
  particleSize = $state((cached.particleSize as number) ?? DEFAULT_PARAMS.particleSize);
  particleMass = $state((cached.particleMass as number) ?? DEFAULT_PARAMS.particleMass);
  paused = $state(DEFAULT_PARAMS.paused);
  showGrid = $state((cached.showGrid as boolean) ?? DEFAULT_PARAMS.showGrid);
  showTrails = $state((cached.showTrails as boolean) ?? DEFAULT_PARAMS.showTrails);
  showCenterOfGravity = $state((cached.showCenterOfGravity as boolean) ?? DEFAULT_PARAMS.showCenterOfGravity);

  get speedUi(): number {
    return speedToSlider(this.speed);
  }

  set speedUi(v: number) {
    this.speed = speedFromSlider(v);
  }

  realTimePatch(): ParamsPatch {
    return {
      showGrid: this.showGrid,
      showTrails: this.showTrails,
      showCenterOfGravity: this.showCenterOfGravity,
      speed: this.speed,
      particleSize: this.particleSize,
    };
  }

  save() {
    save(this);
  }
}

export const simParams = new SimParams();
