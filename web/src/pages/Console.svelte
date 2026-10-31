<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { act, api } from '../lib/api';
    import { clock } from '../lib/format';
    import { listen, type Line } from '../lib/live.svelte';

    let lines = $state<Line[]>([]);
    let command = $state('');
    let filter = $state('');
    let follow = $state(true);
    let box: HTMLDivElement;
    const past: string[] = [];
    let back = -1;

    async function bottom() {
        await tick();
        if (follow && box) box.scrollTop = box.scrollHeight;
    }

    onMount(() => {
        api<Line[]>('/api/console').then((l) => ((lines = l), bottom())).catch(() => {});
        return listen('console', (l: Line) => {
            lines.push(l);
            if (lines.length > 1500) lines.splice(0, lines.length - 1000);
            bottom();
        });
    });

    const shown = $derived(filter ? lines.filter((l) => l.text.toLowerCase().includes(filter.toLowerCase())) : lines);

    async function run(e: SubmitEvent) {
        e.preventDefault();
        const c = command.trim();
        if (!c) return;
        past.unshift(c);
        back = -1;
        command = '';
        follow = true;
        await act('/api/console', { command: c });
    }

    function keys(e: KeyboardEvent) {
        if (e.key === 'ArrowUp' && back < past.length - 1) command = past[++back]!;
        else if (e.key === 'ArrowDown') command = back > 0 ? past[--back]! : ((back = -1), '');
        else return;
        e.preventDefault();
    }

    const scrolled = () => (follow = box.scrollHeight - box.scrollTop - box.clientHeight < 40);
</script>

<div class="page-head">
    <h1>Console</h1>
    <input class="filter" placeholder="Filter" bind:value={filter} />
</div>

<div class="card term">
    <div class="out mono" bind:this={box} onscroll={scrolled}>
        {#each shown as l}
            <div class="line"><span class="t">{clock(l.at)}</span><span class="c">{l.channel}</span><span class="x">{l.text}</span></div>
        {:else}
            <div class="faint">Console output from now on shows up here.</div>
        {/each}
    </div>
    <form onsubmit={run}>
        <span class="prompt mono">&gt;</span>
        <input class="mono" placeholder="Run a server command, like status or restart myresource" bind:value={command} onkeydown={keys} />
    </form>
</div>

<style>
    .filter { max-width: 260px; }
    .term { padding: 0; overflow: hidden; display: flex; flex-direction: column; height: calc(100vh - 170px); min-height: 360px; }
    .out { flex: 1; overflow: auto; padding: 12px 14px; background: #08070f; white-space: pre-wrap; word-break: break-word; }
    .line { display: grid; grid-template-columns: 96px 130px 1fr; gap: 10px; padding: 1px 0; }
    .t { color: var(--faint); white-space: nowrap; }
    .c { color: #b88cff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    form { display: flex; align-items: center; border-top: 1px solid var(--line); background: var(--panel); }
    .prompt { padding: 0 4px 0 14px; color: var(--teal); }
    form input { border: 0; border-radius: 0; background: transparent; padding: 12px 10px; }
    @media (max-width: 860px) { .line { grid-template-columns: 1fr; gap: 0; } .c { display: none; } }
</style>
