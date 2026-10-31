<script lang="ts">
    import { live } from '../lib/live.svelte';
    import { go } from '../lib/router.svelte';
    import { session } from '../lib/session.svelte';

    const [left, bottom, right, top] = session.me!.map.bounds;
    const W = right - left;
    const H = top - bottom;
    const image = session.me!.map.image ? '/map-image' : null;

    // world (x, y) to map space, y pointing down
    const mx = (x: number) => x - left;
    const my = (y: number) => top - y;

    let view = $state({ x: 0, y: 0, w: W, h: H });
    let svg: SVGSVGElement;
    let drag: { x: number; y: number; vx: number; vy: number } | null = null;
    let selected = $state<number | null>(null);
    let q = $state('');

    // map units per screen pixel, so dots and text stay the same size at any zoom
    let cw = $state(800), ch = $state(600);
    const px = $derived(Math.max(view.w / cw, view.h / ch));
    const players = $derived(live.players.filter((p) => p.pos));
    const listed = $derived(players.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())));

    function point(e: { clientX: number; clientY: number }) {
        const r = svg.getBoundingClientRect();
        // the map keeps its aspect ratio, so work out where it sits in the box
        const s = Math.max(view.w / r.width, view.h / r.height);
        const ox = (r.width * s - view.w) / 2, oy = (r.height * s - view.h) / 2;
        return { x: view.x - ox + (e.clientX - r.left) * s, y: view.y - oy + (e.clientY - r.top) * s, s };
    }

    function wheel(e: WheelEvent) {
        e.preventDefault();
        const p = point(e);
        const f = e.deltaY > 0 ? 1.2 : 1 / 1.2;
        const w = Math.min(W * 1.2, Math.max(200, view.w * f));
        const k = w / view.w;
        view = { x: p.x - (p.x - view.x) * k, y: p.y - (p.y - view.y) * k, w, h: view.h * k };
    }

    function down(e: PointerEvent) {
        drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
        svg.setPointerCapture(e.pointerId);
    }

    function move(e: PointerEvent) {
        if (!drag) return;
        const { s } = point(e);
        view = { ...view, x: drag.vx - (e.clientX - drag.x) * s, y: drag.vy - (e.clientY - drag.y) * s };
    }

    function focus(src: number) {
        selected = src;
        const p = players.find((x) => x.src === src);
        if (!p?.pos) return;
        const w = Math.min(view.w, 1500), h = (view.h / view.w) * w;
        view = { x: mx(p.pos[0]) - w / 2, y: my(p.pos[1]) - h / 2, w, h };
    }

    const reset = () => (view = { x: 0, y: 0, w: W, h: H });

    // a light grid every 1000 units so positions mean something without a map image
    const lines = [...Array(Math.ceil(W / 1000) + 1).keys()].map((i) => Math.ceil(left / 1000) * 1000 + i * 1000).filter((x) => x <= right);
    const rows = [...Array(Math.ceil(H / 1000) + 1).keys()].map((i) => Math.ceil(bottom / 1000) * 1000 + i * 1000).filter((y) => y <= top);
</script>

<div class="page-head">
    <h1>Live map <span class="muted">{players.length}</span></h1>
    <button class="btn small" onclick={reset}>Reset view</button>
</div>

<div class="layout">
    <div class="card map" bind:clientWidth={cw} bind:clientHeight={ch}>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <svg
            bind:this={svg}
            viewBox="{view.x} {view.y} {view.w} {view.h}"
            onwheel={wheel}
            onpointerdown={down}
            onpointermove={move}
            onpointerup={() => (drag = null)}
        >
            {#if image}
                <image href={image} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />
            {:else}
                <rect x="0" y="0" width={W} height={H} fill="#100e20" />
                {#each lines as x}<line x1={mx(x)} x2={mx(x)} y1="0" y2={H} class="grid" class:axis={x === 0} vector-effect="non-scaling-stroke" />{/each}
                {#each rows as y}<line y1={my(y)} y2={my(y)} x1="0" x2={W} class="grid" class:axis={y === 0} vector-effect="non-scaling-stroke" />{/each}
                {#each lines as x}<text x={mx(x) + 4 * px} y={Math.min(H, view.y + view.h) - 6 * px} font-size={11 * px} class="tick">{x}</text>{/each}
                {#each rows as y}<text x={Math.max(0, view.x) + 4 * px} y={my(y) - 4 * px} font-size={11 * px} class="tick">{y}</text>{/each}
            {/if}

            {#each players as p (p.src)}
                <g
                    class="player"
                    class:selected={selected === p.src}
                    transform="translate({mx(p.pos![0])} {my(p.pos![1])})"
                    onclick={() => go('player', `@${p.src}`)}
                    onpointerenter={() => (selected = p.src)}
                    role="link"
                    tabindex="-1"
                    onkeydown={() => {}}
                >
                    <circle r={(selected === p.src ? 8 : 6) * px} stroke-width={2 * px} />
                    {#if selected === p.src || view.w < W / 4}
                        <text y={-12 * px} font-size={12 * px} stroke-width={3 * px} text-anchor="middle">{p.name} ({p.src})</text>
                    {/if}
                </g>
            {/each}
        </svg>
        {#if !image}<p class="faint small hint">Scroll to zoom, drag to move. Add a map picture in config.json to see streets.</p>{/if}
    </div>

    <div class="card side">
        <input placeholder="Find a player" bind:value={q} />
        <div class="list">
            {#each listed as p (p.src)}
                <button class="item pick" class:active={selected === p.src} onclick={() => focus(p.src)}>
                    <span>{p.name} <span class="faint">({p.src})</span></span>
                    <span class="mono faint small">{p.pos?.[0]}, {p.pos?.[1]}</span>
                </button>
            {:else}<div class="empty">Nobody online.</div>{/each}
        </div>
    </div>
</div>

<style>
    .layout { display: grid; grid-template-columns: 1fr 280px; gap: 16px; }
    .map { padding: 0; overflow: hidden; position: relative; }
    svg { width: 100%; height: calc(100vh - 190px); min-height: 420px; display: block; cursor: grab; touch-action: none; background: #0b0918; }
    svg:active { cursor: grabbing; }
    .grid { stroke: #221d3d; stroke-width: 1; }
    .grid.axis { stroke: #352e5c; }
    .tick { fill: #4a4470; font-family: ui-monospace, monospace; }
    .player circle { fill: var(--brand); stroke: #fff; cursor: pointer; }
    .player.selected circle { fill: var(--teal); }
    .player text { fill: #fff; paint-order: stroke; stroke: #0b0918; pointer-events: none; font-weight: 600; }
    .hint { position: absolute; left: 12px; top: 8px; margin: 0; pointer-events: none; }
    .side { display: flex; flex-direction: column; gap: 10px; max-height: calc(100vh - 190px); overflow: auto; }
    .pick { width: 100%; background: none; border: 0; text-align: left; cursor: pointer; padding: 8px 6px; border-radius: 6px; flex-direction: column; gap: 2px; }
    .pick:hover, .pick.active { background: var(--panel-2); }
    @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } svg { height: 60vh; } }
</style>
