<script lang="ts">
  let { message, ondismiss }: { message: string; ondismiss: () => void } = $props();
</script>

<div class="fixed inset-0 z-10 grid place-items-center bg-black/70" role="alertdialog">
  <div class="max-w-[420px] rounded-xl border border-danger/40 bg-surface p-6 shadow-2xl">
    <h2 class="m-0 mb-2 text-base font-semibold text-danger">Simulation halted</h2>
    <p class="m-0 mb-4 text-sm break-words text-ink">{message}</p>
    <button class="btn" onclick={ondismiss}>Reset and continue</button>
  </div>
</div>
