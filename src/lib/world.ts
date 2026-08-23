import { CAMERA_FIT } from './constants';

/** Px of world span per px of screen along the fit axis. */
export function zoomOf(widthPx: number, heightPx: number): number {
  return CAMERA_FIT * Math.min(widthPx, heightPx);
}
