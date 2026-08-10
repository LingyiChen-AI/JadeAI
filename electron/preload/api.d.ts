import type { JadeBridge } from './index';

declare global {
  interface Window {
    /** Present only inside the Electron shell; undefined under plain `next dev`. */
    jade?: JadeBridge;
  }
}
