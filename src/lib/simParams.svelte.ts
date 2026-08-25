import { DEFAULT_PARAMS, speedFromSlider, speedToSlider } from './constants';

/** Reactive mirror of DEFAULT_PARAMS. speed is internal; speedUi is 0-100. */
export class SimParams {
  count = $state(DEFAULT_PARAMS.count);
  seed = $state(DEFAULT_PARAMS.seed);
  distribution = $state(DEFAULT_PARAMS.distribution);
  dt = $state(DEFAULT_PARAMS.dt);
  speed = $state(DEFAULT_PARAMS.speed);
  particleMass = $state(DEFAULT_PARAMS.particleMass);
  paused = $state(DEFAULT_PARAMS.paused);
  showGrid = $state(DEFAULT_PARAMS.showGrid);
  showTrails = $state(DEFAULT_PARAMS.showTrails);

  get speedUi(): number {
    return speedToSlider(this.speed);
  }

  set speedUi(v: number) {
    this.speed = speedFromSlider(v);
  }
}

export const simParams = new SimParams();
