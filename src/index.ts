import { config, load, setConfig } from './config';
import { makeServer } from './http';
import { startLive } from './live';

setConfig(load());

const server = makeServer();
startLive(server);

server.on('error', (err: NodeJS.ErrnoException) => {
    console.error(
        err.code === 'EADDRINUSE'
            ? `fivepanel: port ${config.port} is already in use. Pick another with set fivepanel_port.`
            : `fivepanel: web server error: ${err.message}`,
    );
});

server.listen(config.port, config.host, () => {
    console.log(`fivepanel: listening on ${config.host}:${config.port}, open ${config.url}`);
    if (!config.discord.id || !config.discord.secret) {
        console.warn('fivepanel: set fivepanel_discord_id and fivepanel_discord_secret in server.cfg so staff can log in');
    }
});

on('onResourceStop', (name: string) => {
    if (name === GetCurrentResourceName()) server.close();
});
