<script lang="ts">
    import { act, api, enc } from './api';
    import { can } from './session.svelte';

    let { name, running, onclose }: { name: string; running: boolean; onclose: (changed: boolean) => void } = $props();

    interface File { path: string; action: string; note: string | null }
    interface Preview { name: string; from: string; to: string; exact: boolean; notes: string; url: string; files: File[] }

    let preview = $state<Preview | null>(null);
    let error = $state('');
    let busy = $state(false);
    let done = $state<{ to: string; restarted: boolean } | null>(null);

    $effect(() => {
        api<Preview>(`/api/updates/${enc(name)}`)
            .then((p) => (preview = p))
            .catch((e) => (error = e.message));
    });

    const kinds: Record<string, { label: string; color: string; order: number }> = {
        conflict: { label: 'Conflict', color: 'amber', order: 0 },
        merge: { label: 'Merged', color: 'teal', order: 1 },
        keep: { label: 'Kept', color: '', order: 2 },
        update: { label: 'Updated', color: 'green', order: 3 },
        add: { label: 'Added', color: 'green', order: 4 },
        remove: { label: 'Removed', color: 'red', order: 5 },
    };

    const files = $derived((preview?.files ?? []).slice().sort((a, b) => kinds[a.action]!.order - kinds[b.action]!.order || a.path.localeCompare(b.path)));
    const count = (action: string) => files.filter((f) => f.action === action).length;
    const writes = $derived(files.filter((f) => f.action !== 'keep').length);

    async function update() {
        busy = true;
        const r = await act<{ to: string; restarted: boolean; text: string }>(`/api/updates/${enc(name)}/apply`);
        busy = false;
        if (r) done = r;
    }

    async function restart() {
        busy = true;
        await act(`/api/resources/${enc(name)}/restart`);
        onclose(true);
    }

    function keydown(e: KeyboardEvent) {
        if (e.key === 'Escape' && !busy) onclose(!!done);
    }
</script>

<svelte:window onkeydown={keydown} />

<div class="backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && !busy && onclose(!!done)}>
    <div class="card box">
        <div class="head">
            <div>
                <h2 class="mono">{name}</h2>
                {#if preview}
                    <div class="ver"><span class="muted">{preview.from}</span><span class="arrow">→</span><strong>{preview.to}</strong>
                        <a href={preview.url} target="_blank" rel="noreferrer" class="small">Release page</a></div>
                {/if}
            </div>
            <button class="btn ghost" onclick={() => onclose(!!done)} disabled={busy} aria-label="Close">✕</button>
        </div>

        {#if error}
            <p class="err">{error}</p>
        {:else if !preview}
            <div class="loading muted"><span class="spin"></span>Downloading both releases from GitHub and comparing…</div>
        {:else if done}
            <div class="ok">
                <strong>Updated to {done.to}.</strong>
                <span class="muted">{done.restarted ? 'It was restarted and is running the new version.' : 'The files are written. Restart it to load the new version.'}
                    The old files are backed up, and Undo on the Resources page puts them back.</span>
            </div>
        {:else}
            {#if preview.notes}<pre class="notes">{preview.notes}</pre>{/if}

            {#if !preview.exact}
                <p class="warn">Release {preview.from} isn't on GitHub, so your changes can't be told apart from the update's. Config files and locales stay as they are, everything else is replaced.</p>
            {/if}

            <div class="sum">
                {#each Object.entries(kinds) as [k, v]}
                    {#if count(k)}<span class="badge {v.color}">{count(k)} {v.label.toLowerCase()}</span>{/if}
                {/each}
            </div>

            <div class="files">
                {#each files as f}
                    <div class="file">
                        <span class="badge {kinds[f.action]?.color}">{kinds[f.action]?.label}</span>
                        <span class="mono path">{f.path}</span>
                        {#if f.note}<span class="small faint note">{f.note}</span>{/if}
                    </div>
                {/each}
            </div>

            {#if count('conflict')}
                <p class="small muted">For a conflict your file stays as it is, and the release's version is written next to it as <span class="mono">.new</span> to compare by hand.</p>
            {/if}
        {/if}

        <div class="row actions">
            {#if done}
                <button class="btn" onclick={() => onclose(true)} disabled={busy}>Close</button>
                {#if !done.restarted && running && can('resource restart')}<button class="btn primary" onclick={restart} disabled={busy}>Restart now</button>{/if}
            {:else}
                <button class="btn" onclick={() => onclose(false)} disabled={busy}>Cancel</button>
                {#if preview}
                    <button class="btn primary" onclick={update} disabled={busy || !writes}>{busy ? 'Updating…' : `Update ${writes} file${writes === 1 ? '' : 's'}`}</button>
                {/if}
            {/if}
        </div>
    </div>
</div>

<style>
    .backdrop { position: fixed; inset: 0; z-index: 50; background: rgb(5 4 12 / 0.7); display: grid; place-items: center; padding: 16px; }
    .box { width: min(640px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 60px rgb(0 0 0 / 0.5); }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    h2 { margin: 0; font-size: 18px; }
    .ver { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
    .ver a { margin-left: 6px; }
    .arrow { color: var(--faint); }
    .notes { margin: 0; padding: 10px 12px; background: var(--panel-2); border-radius: 8px; white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.5; color: var(--muted); max-height: 140px; overflow: auto; }
    .warn { margin: 0; padding: 10px 12px; border-radius: 8px; color: var(--amber); background: rgb(245 165 36 / 0.08); border: 1px solid rgb(245 165 36 / 0.3); font-size: 13px; }
    .err { margin: 0; color: #ff8d90; }
    .sum { display: flex; flex-wrap: wrap; gap: 6px; }
    .files { overflow: auto; border: 1px solid var(--line); border-radius: 8px; min-height: 60px; }
    .file { display: grid; grid-template-columns: 82px 1fr; gap: 2px 10px; align-items: center; padding: 7px 12px; border-bottom: 1px solid var(--line); }
    .file:last-child { border-bottom: 0; }
    .file .badge { justify-content: center; }
    .path { font-size: 13px; overflow-wrap: anywhere; }
    .note { grid-column: 2; }
    .loading { display: flex; align-items: center; gap: 10px; padding: 24px 0; }
    .spin { width: 16px; height: 16px; border: 2px solid var(--line); border-top-color: var(--brand); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .ok { display: flex; flex-direction: column; gap: 6px; padding: 12px; border-radius: 8px; background: rgb(61 214 140 / 0.08); border: 1px solid rgb(61 214 140 / 0.3); }
    .ok strong { color: var(--green); }
    .actions { justify-content: flex-end; }
</style>
