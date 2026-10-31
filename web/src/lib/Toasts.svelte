<script lang="ts">
    import { toasts } from './toast.svelte';
</script>

<div class="toasts" aria-live="polite">
    {#each toasts as t (t.id)}
        <div class="toast" class:error={t.kind === 'error'}>{t.text}</div>
    {/each}
</div>

<style>
    .toasts { position: fixed; right: 16px; bottom: 16px; z-index: 60; display: flex; flex-direction: column; gap: 8px; max-width: min(380px, calc(100vw - 32px)); }
    .toast {
        background: var(--panel-2);
        border: 1px solid var(--line);
        border-left: 3px solid var(--green);
        border-radius: 8px;
        padding: 10px 14px;
        box-shadow: 0 10px 30px rgb(0 0 0 / 0.4);
    }
    .toast.error { border-left-color: var(--red); }
</style>
