// #/players/@12 -> { page: 'players', args: ['@12'] }

function parse() {
    const [page = '', ...args] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    return { page: page || 'dashboard', args };
}

export const route = $state(parse());

window.addEventListener('hashchange', () => {
    const r = parse();
    route.page = r.page;
    route.args = r.args;
});

export const go = (...parts: string[]) => (location.hash = `#/${parts.map(encodeURIComponent).join('/')}`);
export const href = (...parts: string[]) => `#/${parts.map(encodeURIComponent).join('/')}`;
