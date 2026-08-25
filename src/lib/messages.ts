export type Distribution =
  | 'uniformDisc'
  | 'plummer'
  | 'spiral'
  | 'twoClusters'
  | 'ring'
  | 'collision';

export interface SimParamsSnapshot {
  count: number;
  seed: number;
  distribution: Distribution;
  dt: number;
  speed: number;
  particleSize: number;
  paused: boolean;
  showGrid: boolean;
  showTrails: boolean;
}

export type ParamsPatch = Partial<
  Pick<SimParamsSnapshot, 'speed' | 'particleSize' | 'paused' | 'showGrid' | 'showTrails'>
>;

export type ToWorker =
  | { type: 'init'; canvas: OffscreenCanvas; width: number; height: number; dpr: number }
  | { type: 'params'; patch: ParamsPatch }
  | { type: 'reset'; count: number; seed: number; distribution: Distribution; particleSize: number }
  | { type: 'resize'; width: number; height: number; dpr: number };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'stats'; fps: number }
  | { type: 'error'; message: string };
