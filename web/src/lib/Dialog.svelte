<script lang="ts">
    import { close, dialog } from './dialog.svelte';

    function submit(e: SubmitEvent) {
        e.preventDefault();
        close(true);
    }

    function keydown(e: KeyboardEvent) {
        if (dialog.open && e.key === 'Escape') close(false);
    }
</script>

<svelte:window onkeydown={keydown} />

{#if dialog.open}
    <div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && close(false)}>
        <form class="card" onsubmit={submit}>
            <h2>{dialog.title}</h2>
            {#if dialog.text}<p class="muted">{dialog.text}</p>{/if}
            {#each dialog.fields as f, i}
                <label>
                    <span>{f.label}</span>
                    {#if f.type === 'textarea'}
                        <textarea bind:value={dialog.values[f.name]} placeholder={f.placeholder} required={f.required}></textarea>
                    {:else if f.type === 'select'}
                        <select bind:value={dialog.values[f.name]}>
                            {#each f.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
                        </select>
                    {:else}
                        <!-- svelte-ignore a11y_autofocus -->
                        <input
                            type={f.type === 'number' ? 'number' : 'text'}
                            bind:value={dialog.values[f.name]}
                            placeholder={f.placeholder}
                            required={f.required}
                            autofocus={i === 0}
                        />
                    {/if}
                </label>
            {/each}
            <div class="row actions">
                <button type="button" class="btn" onclick={() => close(false)}>Cancel</button>
                <button type="submit" class="btn" class:primary={!dialog.danger} class:danger={dialog.danger}>{dialog.confirm}</button>
            </div>
        </form>
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        background: rgb(5 4 12 / 0.7);
        display: grid;
        place-items: center;
        padding: 16px;
    }
    form { width: min(440px, 100%); display: flex; flex-direction: column; gap: 12px; box-shadow: 0 20px 60px rgb(0 0 0 / 0.5); }
    p { margin: 0; }
    label { display: flex; flex-direction: column; gap: 5px; }
    label span { font-size: 12.5px; color: var(--muted); }
    .actions { justify-content: flex-end; margin-top: 4px; }
</style>
