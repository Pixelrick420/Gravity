import { DEFAULT_PARAMS } from './constants';

/** Reactive DEFAULT_PARAMS mirror, shared by main-thread components. */
export class SimParams {
  count = $state(DEFAULT_PARAMS.count);
  seed = $state(DEFAULT_PARAMS.seed);
  distribution = $state(DEFAULT_PARAMS.distribution);
  dt = $state(DEFAULT_PARAMS.dt);
  speed = $state(DEFAULT_PARAMS.speed);
  particleSize = $state(DEFAULT_PARAMS.particleSize);
  paused = $state(DEFAULT_PARAMS.paused);
}

export const simParams = new SimParams();
