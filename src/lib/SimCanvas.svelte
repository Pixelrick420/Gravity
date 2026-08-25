<script lang="ts">
  import { onMount } from 'svelte';
  import type { ToWorker } from './messages';

  let { worker }: { worker: Worker } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();

  onMount(() => {
    const el = canvas!;
    const off = el.transferControlToOffscreen();
    const dpr = window.devicePixelRatio || 1;
    worker.postMessage(
      {
        type: 'init',
        canvas: off,
        width: Math.round(el.clientWidth * dpr),
        height: Math.round(el.clientHeight * dpr),
        dpr,
      } satisfies ToWorker,
      [off],
    );

    const ro = new ResizeObserver(() => {
      const cw = Math.round(el.clientWidth * dpr);
      const ch = Math.round(el.clientHeight * dpr);
      if (cw > 0 && ch > 0) {
        worker.postMessage({ type: 'resize', width: cw, height: ch, dpr } satisfies ToWorker);
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      worker.terminate();
    };
  });
</script>

<canvas bind:this={canvas} class="block h-full w-full"></canvas>
