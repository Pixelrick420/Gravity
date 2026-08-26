<script lang="ts">
  import { onMount } from 'svelte';
  import type { FromWorker, ToWorker } from './lib/messages';
  import { simParams } from './lib/simParams.svelte';
  import SimCanvas from './lib/SimCanvas.svelte';
  import Controls from './lib/Controls.svelte';
  import ErrorOverlay from './lib/ErrorOverlay.svelte';
  import { Menu, X } from '@lucide/svelte';
  import { ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR, WORLD_HALF } from './lib/constants';

  const worker = new Worker(new URL('./lib/sim.worker.ts', import.meta.url), {
    type: 'module',
  });

  let fps = $state(0);
  let error = $state<string | null>(null);
  let canvasReady = $state(false);
  let panelOpen = $state(false);

  let camCenterX = $state(0);
  let camCenterY = $state(0);
  let zoom = $state(1);

  let cogX = $state(0);
  let cogY = $state(0);
  let cogTargetX = 0;
  let cogTargetY = 0;

  let lastFrameT = 0;
  function smoothCog(t: number) {
    requestAnimationFrame(smoothCog);
    if (lastFrameT === 0) { lastFrameT = t; return; }
    const dt = Math.min(t - lastFrameT, 50);
    lastFrameT = t;
    const decay = 1 - Math.pow(0.001, dt / 1000);
    cogX += (cogTargetX - cogX) * decay;
    cogY += (cogTargetY - cogY) * decay;
  }
  requestAnimationFrame(smoothCog);



  const post = (msg: ToWorker) => worker.postMessage(msg);

  function postCamera() {
    camCenterX = camCenterX - 2 * WORLD_HALF * Math.round(camCenterX / (2 * WORLD_HALF));
    camCenterY = camCenterY - 2 * WORLD_HALF * Math.round(camCenterY / (2 * WORLD_HALF));
    post({ type: 'camera', camCenterX, camCenterY, zoom });
  }

  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const msg = ev.data;
    if (msg.type === 'stats') {
      fps = msg.fps;
      cogTargetX = msg.cogX;
      cogTargetY = msg.cogY;
    } else if (msg.type === 'ready') {
      canvasReady = true;
      postCamera();
      post({ type: 'params', patch: simParams.realTimePatch() });
      post({
        type: 'reset',
        count: Math.round(simParams.count),
        seed: Math.round(simParams.seed),
        distribution: simParams.distribution,
        particleMass: simParams.particleMass,
      });
      if (simParams.showCenterOfGravity) {
        simParams.showCenterOfGravity = false;
        setTimeout(() => (simParams.showCenterOfGravity = true), 50);
      }
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

  let dragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  function handleMouseDown(e: MouseEvent) {
    if (e.button === 2) {
      dragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      e.preventDefault();
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const baseZoom = Math.min(canvas.width, canvas.height) * 0.5;
    const worldScale = 1 / (baseZoom * zoom);
    camCenterX -= dx * worldScale;
    camCenterY -= dy * worldScale;
    postCamera();
  }

  function handleMouseUp(e: MouseEvent) {
    if (e.button === 2) dragging = false;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const my = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    const baseZoom = Math.min(canvas.width, canvas.height) * 0.5;
    const worldScale = 1 / (baseZoom * zoom);
    const worldMX = camCenterX + mx * (canvas.width / 2) * worldScale;
    const worldMY = camCenterY + my * (canvas.height / 2) * worldScale;
    const factor = e.deltaY > 0 ? 1 - ZOOM_FACTOR : 1 + ZOOM_FACTOR;
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
    const newWorldScale = 1 / (baseZoom * zoom);
    camCenterX = worldMX - mx * (canvas.width / 2) * newWorldScale;
    camCenterY = worldMY - my * (canvas.height / 2) * newWorldScale;
    postCamera();
  }

  let lastTouchDist = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchCount = 0;

  function handleTouchStart(e: TouchEvent) {
    if ((e.target as HTMLElement)?.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    touchCount = e.touches.length;
    if (touchCount === 1) {
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
    } else if (touchCount === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      lastTouchDist = Math.hypot(dx, dy);
      lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    if (e.touches.length === 1 && touchCount === 1) {
      const dx = e.touches[0].clientX - lastTouchX;
      const dy = e.touches[0].clientY - lastTouchY;
      lastTouchX = e.touches[0].clientX;
      lastTouchY = e.touches[0].clientY;
      const baseZoom = Math.min(canvas.width, canvas.height) * 0.5;
      const worldScale = 1 / (baseZoom * zoom);
      camCenterX -= dx * worldScale;
      camCenterY -= dy * worldScale;
      postCamera();
    } else if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      if (lastTouchDist > 0) {
        const rect = canvas.getBoundingClientRect();
        const mx = ((midX - rect.left) / rect.width) * 2 - 1;
        const my = ((midY - rect.top) / rect.height) * 2 - 1;
        const baseZoom = Math.min(canvas.width, canvas.height) * 0.5;
        const worldScale = 1 / (baseZoom * zoom);
        const worldMX = camCenterX + mx * (canvas.width / 2) * worldScale;
        const worldMY = camCenterY + my * (canvas.height / 2) * worldScale;
        const factor = dist / lastTouchDist;
        zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
        const newWorldScale = 1 / (baseZoom * zoom);
        camCenterX = worldMX - mx * (canvas.width / 2) * newWorldScale;
        camCenterY = worldMY - my * (canvas.height / 2) * newWorldScale;
      }
      const panDx = midX - lastTouchX;
      const panDy = midY - lastTouchY;
      if (Math.abs(panDx) > 0.5 || Math.abs(panDy) > 0.5) {
        const baseZoom = Math.min(canvas.width, canvas.height) * 0.5;
        const worldScale = 1 / (baseZoom * zoom);
        camCenterX -= panDx * worldScale;
        camCenterY -= panDy * worldScale;
      }
      lastTouchDist = dist;
      lastTouchX = midX;
      lastTouchY = midY;
      postCamera();
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    touchCount = e.touches.length;
    if (touchCount < 2) lastTouchDist = 0;
  }

  let container: HTMLDivElement;
  const touchOpts: AddEventListenerOptions = { passive: false };

  onMount(() => {
    container.addEventListener('touchstart', handleTouchStart, touchOpts);
    container.addEventListener('touchmove', handleTouchMove, touchOpts);
    container.addEventListener('touchend', handleTouchEnd, touchOpts);
    container.addEventListener('wheel', handleWheel, { passive: false });
  });

  function recenter() {
    camCenterX = cogX;
    camCenterY = cogY;
    zoom = 1;
    postCamera();
  }

  let cogScreen = $derived.by(() => {
    if (!simParams.showCenterOfGravity) return null;
    const canvas = document.querySelector('canvas');
    if (!canvas || canvas.width === 0) return null;
    const baseZoom = Math.min(canvas.width, canvas.height) * 0.5;
    const worldScale = 1 / (baseZoom * zoom);
    const sx = (canvas.width / 2 + (cogX - camCenterX) / worldScale) / window.devicePixelRatio;
    const sy = (canvas.height / 2 + (cogY - camCenterY) / worldScale) / window.devicePixelRatio;
    return { sx, sy };
  });
</script>

<svelte:window onkeydown={handleKeydown} onmouseup={handleMouseUp} />

<svelte:head>
  <title>Gravity</title>
</svelte:head>

<main class="relative h-dvh w-full overflow-hidden bg-void font-sans text-ink">
  <div
    bind:this={container}
    class="absolute inset-0"
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    oncontextmenu={(e) => e.preventDefault()}
    role="presentation"
  >
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
    {#if cogScreen}
      <div
        title="Center of gravity"
        class="pointer-events-none absolute z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-400/70 shadow-[0_0_4px_1px_rgba(45,212,191,0.3)]"
        style="left:{cogScreen.sx}px;top:{cogScreen.sy}px"
      ></div>
    {/if}
    <button
      type="button"
      class="pointer-events-auto absolute bottom-3 left-3 z-30 cursor-pointer rounded-md border border-edge bg-surface/90 px-2.5 py-1 text-xs text-ink transition-colors hover:bg-surface-hover"
      onclick={recenter}
    >
      Recenter
    </button>
  </div>
  {#if panelOpen}
    <Controls {worker} />
  {/if}
</main>

{#if error}
  <ErrorOverlay message={error} ondismiss={dismissError} />
{/if}
