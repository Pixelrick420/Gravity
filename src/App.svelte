<script lang="ts">
  import type { FromWorker, ToWorker } from './lib/messages';
  import { simParams } from './lib/simParams.svelte';
  import SimCanvas from './lib/SimCanvas.svelte';
  import Controls from './lib/Controls.svelte';
  import ErrorOverlay from './lib/ErrorOverlay.svelte';

  const worker = new Worker(new URL('./lib/sim.worker.ts', import.meta.url), {
    type: 'module',
  });

  let fps = $state(0);
  let error = $state<string | null>(null);
  let canvasReady = $state(false);

  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const msg = ev.data;
    if (msg.type === 'stats') {
      fps = msg.fps;
    } else if (msg.type === 'ready') {
      canvasReady = true;
    } else if (msg.type === 'error') {
      error = msg.message;
    }
  };

  function dismissError() {
    worker.postMessage({
      type: 'reset',
      count: Math.round(simParams.count),
      seed: Math.round(simParams.seed),
      distribution: simParams.distribution,
    } satisfies ToWorker);
    simParams.paused = false;
    error = null;
  }
</script>

<svelte:head>
  <title>Gravity</title>
</svelte:head>

<main class="flex h-screen w-screen overflow-hidden bg-void font-sans text-ink">
  <div class="relative min-w-0 flex-1">
    <SimCanvas {worker} />
    {#if !canvasReady}
      <div class="pointer-events-none absolute inset-0 grid place-items-center text-sm tracking-[0.2em] text-faint">
        initializing wasm…
      </div>
    {/if}
    <div class="pointer-events-none absolute top-2.5 left-3 text-xs tabular-nums text-muted">
      {fps} fps · {Math.round(simParams.count)} particles
    </div>
  </div>
  <Controls {worker} />
</main>

{#if error}
  <ErrorOverlay message={error} ondismiss={dismissError} />
{/if}
