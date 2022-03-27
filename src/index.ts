import express from 'express';
import util from 'util';
import childProcess from 'child_process';
import fs from 'fs';
import tmp from 'tmp';
import axios from 'axios';
const exec = util.promisify(childProcess.exec);

async function handleCommand(args: { config: string, command: string }) {

    const configFile = tmp.fileSync();
    try {
        fs.writeFileSync(configFile.fd, args.config);
        let res = await exec('/usr/src/lite-client/lite-client -C ' + configFile.name + ' -v 0 --cmd "' + args.command + '"', { timeout: 15000 });

        let stdout = res.stdout.split('\n');
        if (stdout[0].startsWith('connecting')) {
            stdout = stdout.slice(1);
        }
        if (stdout[0].startsWith('local key: ')) {
            stdout = stdout.slice(1);
        }
        if (stdout[0].startsWith('remote key: ')) {
            stdout = stdout.slice(1);
        }
        if (stdout[0].startsWith('conn ready')) {
            stdout = stdout.slice(1);
        }
        return {
            stderr: res.stderr,
            stdout: stdout.join('\n')
        };
    } finally {
        configFile.removeCallback();
    }
}

(async () => {
    let cache = new Map<string, string>();
    const app = express();
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    app.get('/', (req, res) => {
        res.send('Welcome to Validator!');
    });
    app.post('/command/state', express.json(), (req, res) => {
        (async () => {
            try {
                let body = req.body as { config: string, address: string };
                let config: string;
                if (cache.has(body.config)) {
                    config = cache.get(body.config)!;
                } else {
                    config = (await axios.get(body.config, {
                        responseType: 'blob',
                        transformResponse: [(data) => { return data; }],
                        timeout: 5000
                    })).data;
                    cache.set(body.config, config);
                }
                const endFile = tmp.fileSync();
                try {
                    let response = await handleCommand({
                        config: config,
                        command: `saveaccountdata "${endFile.name}" "${body.address}"`
                    });
                    let data = fs.readFileSync(endFile.fd).toString('base64');
                    res.status(200).send({
                        ok: true,
                        response: {
                            ...response,
                            data
                        }
                    });
                } finally {
                    endFile.removeCallback();
                }
            } catch (e) {
                console.warn(e);
                res.status(500).send({ ok: false });
            }
        })()
    });
    await new Promise<void>((resolve) => app.listen(port, () => resolve()));
    console.log('🚀 Server started at http://localhost:' + port + '/');
})();