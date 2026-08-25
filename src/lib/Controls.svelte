<script lang="ts">
  import { simParams } from './simParams.svelte';
  import { PARTICLE_MASS_MIN, PARTICLE_MASS_MAX, SPEED_SLIDER_MAX, SPEED_SLIDER_MIN } from './constants';
  import type { ParamsPatch, ToWorker } from './messages';

  let { worker }: { worker: Worker } = $props();

  const post = (msg: ToWorker) => worker.postMessage(msg);

  let lastApplied = $state({
    count: Math.round(simParams.count),
    seed: Math.round(simParams.seed),
    distribution: simParams.distribution,
    particleMass: simParams.particleMass,
  });

  const hasPending = $derived(
    lastApplied.count !== Math.round(simParams.count) ||
    lastApplied.seed !== Math.round(simParams.seed) ||
    lastApplied.distribution !== simParams.distribution ||
    lastApplied.particleMass !== simParams.particleMass,
  );

  $effect(() => {
    const patch: ParamsPatch = {
      showGrid: simParams.showGrid,
      showTrails: simParams.showTrails,
      showCenterOfGravity: simParams.showCenterOfGravity,
      speed: simParams.speed,
    };
    post({ type: 'params', patch });
  });

  const fmt = (decimals: number) => (v: number) => v.toFixed(decimals);

  const distributions: Array<{ value: string; label: string }> = [
    { value: 'uniformDisc', label: 'Uniform disc' },
    { value: 'plummer', label: 'Star cluster' },
    { value: 'spiral', label: 'Spiral galaxy' },
    { value: 'twoClusters', label: 'Two clusters' },
    { value: 'ring', label: 'Ring' },
    { value: 'collision', label: 'Galaxy crash' },
  ];

  function doApply(e: Event) {
    e.preventDefault();
    lastApplied = {
      count: Math.round(simParams.count),
      seed: Math.round(simParams.seed),
      distribution: simParams.distribution,
      particleMass: simParams.particleMass,
    };
    post({
      type: 'reset',
      count: lastApplied.count,
      seed: lastApplied.seed,
      distribution: lastApplied.distribution,
      particleMass: lastApplied.particleMass,
    });
    simParams.paused = false;
  }
</script>

<aside class="absolute inset-x-0 bottom-0 z-20 flex max-h-[45dvh] w-full flex-col gap-2 overflow-y-auto border-t border-edge bg-surface/90 p-4 text-sm text-ink shadow-xl backdrop-blur-sm sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-72 sm:border-t-0 sm:border-l">
  <h1 class="m-0 text-xl font-semibold tracking-[0.35em]">GRAVITY</h1>
  <p class="mb-2 mt-0 text-xs text-muted">FMM N-body sandbox</p>

  <button
    type="button"
    class="btn transition-colors {hasPending ? 'border-accent bg-accent/10 text-accent' : ''}"
    onclick={doApply}
  >
    {hasPending ? 'Apply' : 'Reset'}
  </button>

  <hr class="my-1 border-edge" />

  <label class="panel-row">
    <span>Distribution</span>
    <select class="col-span-2 rounded border border-edge bg-surface px-1 py-0.5 text-ink" bind:value={simParams.distribution}>
      {#each distributions as dist (dist.value)}
        <option value={dist.value}>{dist.label}</option>
      {/each}
    </select>
  </label>

  <hr class="my-1 border-edge" />

  <label class="panel-row">
    <span>Particles</span>
    <input class="min-w-0 w-full accent-accent" type="range" min={2} max={2000} step={1} bind:value={simParams.count} />
    <output>{String(Math.round(simParams.count))}</output>
  </label>
  <label class="panel-row">
    <span>Particle mass</span>
    <input class="min-w-0 w-full accent-accent" type="range" min={PARTICLE_MASS_MIN} max={PARTICLE_MASS_MAX} step={0.5} bind:value={simParams.particleMass} />
    <output>{fmt(1)(simParams.particleMass)}</output>
  </label>

  <hr class="my-1 border-edge" />

  <label class="panel-row">
    <span>Speed</span>
    <input class="min-w-0 w-full accent-accent" type="range" min={SPEED_SLIDER_MIN} max={SPEED_SLIDER_MAX} step={1} bind:value={simParams.speedUi} />
    <output>{String(Math.round(simParams.speedUi))}</output>
  </label>

  <hr class="my-1 border-edge" />

  <label class="flex cursor-pointer items-center justify-between">
    <span>Grid lines</span>
    <input class="size-4 accent-accent" type="checkbox" bind:checked={simParams.showGrid} />
  </label>
  <label class="flex cursor-pointer items-center justify-between">
    <span>Trails</span>
    <input class="size-4 accent-accent" type="checkbox" bind:checked={simParams.showTrails} />
  </label>
  <label class="flex cursor-pointer items-center justify-between">
    <span>Center of gravity</span>
    <input class="size-4 accent-accent" type="checkbox" bind:checked={simParams.showCenterOfGravity} />
  </label>
</aside>
