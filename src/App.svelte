<script lang="ts">
  import type { FromWorker, ToWorker } from './lib/messages';
  import { simParams } from './lib/simParams.svelte';
  import SimCanvas from './lib/SimCanvas.svelte';
  import Controls from './lib/Controls.svelte';
  import ErrorOverlay from './lib/ErrorOverlay.svelte';
  import { Menu, X } from '@lucide/svelte';

  const worker = new Worker(new URL('./lib/sim.worker.ts', import.meta.url), {
    type: 'module',
  });

  let fps = $state(0);
  let error = $state<string | null>(null);
  let canvasReady = $state(false);
  let panelOpen = $state(false);

  const post = (msg: ToWorker) => worker.postMessage(msg);

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
    post({
      type: 'reset',
      count: Math.round(simParams.count),
      seed: Math.round(simParams.seed),
      distribution: simParams.distribution,
      particleMass: simParams.particleMass,
    } satisfies ToWorker);
    simParams.paused = false;
    error = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.code === 'Space' && e.target === document.body) {
      e.preventDefault();
      simParams.paused = !simParams.paused;
      post({ type: 'params', patch: { paused: simParams.paused } });
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>Gravity</title>
</svelte:head>

<main class="relative h-dvh w-full overflow-hidden bg-void font-sans text-ink">
  <div class="absolute inset-0">
    <SimCanvas {worker} />
    {#if !canvasReady}
      <div class="pointer-events-none absolute inset-0 grid place-items-center text-sm tracking-[0.2em] text-faint">
        initializing wasm…
      </div>
    {/if}
    <div class="pointer-events-none absolute top-2.5 left-3 text-xs tabular-nums text-muted">
      {fps} fps · {Math.round(simParams.count)} particles{#if simParams.paused} · <span class="text-amber">PAUSED</span>{/if}
    </div>
    <button
      type="button"
      aria-label={panelOpen ? 'Hide controls' : 'Show controls'}
      class="absolute top-2.5 right-3 z-30 grid size-9 cursor-pointer place-items-center rounded-md border border-edge bg-surface/90 text-ink transition-colors hover:bg-surface-hover"
      onclick={() => (panelOpen = !panelOpen)}
    >
      {#if panelOpen}
        <X size={16} strokeWidth={2.5} />
      {:else}
        <Menu size={16} strokeWidth={2.5} />
      {/if}
    </button>
  </div>
  {#if panelOpen}
    <Controls {worker} />
  {/if}
</main>

{#if error}
  <ErrorOverlay message={error} ondismiss={dismissError} />
{/if}
