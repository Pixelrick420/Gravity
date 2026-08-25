import { CAMERA_FIT } from './constants';

export function zoomOf(widthPx: number, heightPx: number): number {
  return CAMERA_FIT * Math.min(widthPx, heightPx);
}
