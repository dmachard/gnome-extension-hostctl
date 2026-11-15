/* sshClient.js
 *
 * Reads Host entries from ~/.ssh/config, probes reachability, and opens SSH sessions
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { execCommand, spawnInTerminal } from './exec.js';

const HOST_LINE_RE = /^\s*Host(?:\s+|=)(.+)$/i;
const WILDCARD_RE = /[*?!]/;
const PROBE_TIMEOUT_SEC = 2;

export class SshClient {
    constructor() {
        this._cancellable = new Gio.Cancellable();
    }

    _configPath() {
        return GLib.build_filenamev([GLib.get_home_dir(), '.ssh', 'config']);
    }

    async listHosts() {
        const file = Gio.File.new_for_path(this._configPath());
        if (!file.query_exists(null)) {
            return [];
        }

        const [, bytes] = await new Promise((resolve, reject) => {
                file.load_contents_async(this._cancellable, (f, res) => {
                    try {
                        resolve(f.load_contents_finish(res));
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            const text = new TextDecoder('utf-8').decode(bytes);
            const seen = new Set();
            const hosts = [];

            for (const rawLine of text.split('\n')) {
                const line = rawLine.replace(/#.*$/, '').trim();
                if (!line) continue;

                const match = line.match(HOST_LINE_RE);
                if (!match) continue;

                for (const token of match[1].trim().split(/\s+/)) {
                    if (!token || WILDCARD_RE.test(token) || seen.has(token)) {
                        continue;
                    }
                    seen.add(token);
                    hosts.push({ name: token });
                }
            }

            return hosts;
        }

    async _resolveEndpoint(host) {
            const out = await execCommand(['ssh', '-G', host], this._cancellable);
            let hostname = host;
            let port = 22;

            for(const line of out.split('\n')) {
                if (line.startsWith('hostname ')) {
            hostname = line.slice(9).trim();
        } else if (line.startsWith('port ')) {
            const parsed = Number.parseInt(line.slice(5).trim(), 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                port = parsed;
            }
        }
    }
        return { hostname, port };
    }

    async isHostReachable(host) {
    try {
        const { hostname, port } = await this._resolveEndpoint(host);
        const client = new Gio.SocketClient({ timeout: PROBE_TIMEOUT_SEC });
        return await new Promise(resolve => {
            client.connect_to_host_async(hostname, port, this._cancellable, (c, res) => {
                try {
                    const conn = c.connect_to_host_finish(res);
                    conn.close(null);
                    resolve(true);
                } catch {
                    resolve(false);
                }
            });
        });
    } catch {
        return false;
    }
}

connectHost(host) {
    spawnInTerminal(['ssh', host]);
}

destroy() {
    if (this._cancellable) {
        this._cancellable.cancel();
        this._cancellable = null;
    }
}
}
