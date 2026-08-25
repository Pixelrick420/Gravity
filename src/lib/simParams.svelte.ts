import { DEFAULT_PARAMS, speedFromSlider, speedToSlider } from './constants';

/** Reactive DEFAULT_PARAMS mirror, shared by main-thread components.
 * `speed` holds internal sim units; `speedUi` is its 0–100 slider view. */
export class SimParams {
  count = $state(DEFAULT_PARAMS.count);
  seed = $state(DEFAULT_PARAMS.seed);
  distribution = $state(DEFAULT_PARAMS.distribution);
  dt = $state(DEFAULT_PARAMS.dt);
  speed = $state(DEFAULT_PARAMS.speed);
  particleSize = $state(DEFAULT_PARAMS.particleSize);
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
