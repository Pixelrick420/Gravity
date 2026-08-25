<script lang="ts">
  import { simParams } from './simParams.svelte';
  import { SPEED_SLIDER_MAX, SPEED_SLIDER_MIN } from './constants';
  import type { ParamsPatch, ToWorker } from './messages';
  import { Play, Pause } from '@lucide/svelte';

  let { worker }: { worker: Worker } = $props();

const post = (msg: ToWorker) => worker.postMessage(msg);

$effect(() => {
  const patch: ParamsPatch = {
    speed: simParams.speed,
    particleSize: simParams.particleSize,
    paused: simParams.paused,
    showGrid: simParams.showGrid,
    showTrails: simParams.showTrails,
  };
  post({ type: 'params', patch });
});

interface SliderSpec {
  key: 'count' | 'particleSize' | 'speedUi';
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}

const fmt = (decimals: number) => (v: number) => v.toFixed(decimals);

const sliders: SliderSpec[] = [
  { key: 'count', label: 'Particles', min: 100, max: 10000, step: 100, format: (v) => String(Math.round(v)) },
  { key: 'particleSize', label: 'Particle size', min: 1, max: 10, step: 0.5, format: fmt(1) },
  { key: 'speedUi', label: 'Speed', min: SPEED_SLIDER_MIN, max: SPEED_SLIDER_MAX, step: 1, format: (v) => String(Math.round(v)) },
];

const distributions: Array<{ value: string; label: string }> = [
  { value: 'uniformDisc', label: 'Uniform disc' },
  { value: 'plummer', label: 'Star cluster' },
  { value: 'spiral', label: 'Spiral galaxy' },
  { value: 'twoClusters', label: 'Two clusters' },
  { value: 'ring', label: 'Ring' },
  { value: 'collision', label: 'Galaxy crash' },
];

function doReset(e: Event) {
  e.preventDefault();
  post({
    type: 'reset',
    count: Math.round(simParams.count),
    seed: Math.round(simParams.seed),
    distribution: simParams.distribution,
  });
  simParams.paused = false;
}
</script>

<aside class="absolute inset-x-0 bottom-0 z-20 flex max-h-[45dvh] w-full flex-col gap-2 overflow-y-auto border-t border-edge bg-surface/90 p-4 text-sm text-ink shadow-xl backdrop-blur-sm sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-72 sm:border-t-0 sm:border-l">
  <h1 class="m-0 text-xl font-semibold tracking-[0.35em]">GRAVITY</h1>
  <p class="mb-2 mt-0 text-xs text-muted">FMM N-body sandbox</p>

  <button type="button" class="btn" onclick={doReset}>Reset simulation</button>

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

  {#each sliders as spec (spec.key)}
    <label class="panel-row">
      <span>{spec.label}</span>
      <input class="min-w-0 w-full accent-accent" type="range" min={spec.min} max={spec.max} step={spec.step} bind:value={simParams[spec.key]} />
      <output>{(spec.format ?? String)(simParams[spec.key])}</output>
    </label>
  {/each}

  <hr class="my-1 border-edge" />

  <label class="flex cursor-pointer items-center justify-between">
    <span>Grid lines</span>
    <input class="size-4 accent-accent" type="checkbox" bind:checked={simParams.showGrid} />
  </label>
  <label class="flex cursor-pointer items-center justify-between">
    <span>Trails</span>
    <input class="size-4 accent-accent" type="checkbox" bind:checked={simParams.showTrails} />
  </label>

  <hr class="my-1 border-edge" />

  <button type="button" class="btn inline-flex items-center justify-center gap-2" onclick={() => (simParams.paused = !simParams.paused)}>
    {#if simParams.paused}
      <Play size={14} strokeWidth={2.5} /> Resume
    {:else}
      <Pause size={14} strokeWidth={2.5} /> Pause
    {/if}
  </button>
</aside>
