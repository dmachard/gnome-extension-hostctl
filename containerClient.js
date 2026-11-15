/* containerClient.js
 *
 * Async Docker / Podman container wrapper with runtime auto-detection
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {execCommand} from './exec.js';

const RUNTIMES = ['docker', 'podman'];
const PS_FORMAT = '{{.ID}}\t{{.Names}}\t{{.State}}';

export class ContainerClient {
    constructor() {
        this._cancellable = new Gio.Cancellable();
    }

    getRuntimes() {
        return RUNTIMES.filter(rt => GLib.find_program_in_path(rt) !== null);
    }

    hasRuntime() {
        return this.getRuntimes().length > 0;
    }

    async _listRuntime(runtime) {
        const output = await execCommand(
            [runtime, 'ps', '-a', '--format', PS_FORMAT],
            this._cancellable
        );
        const containers = [];
        for (const line of output.split('\n')) {
            if (!line.trim()) continue;
            const [id, names, state] = line.split('\t');
            if (!id || !names || !state) continue;
            containers.push({
                id: id.trim(),
                name: names.trim(),
                state: state.trim().toLowerCase(),
                runtime,
            });
        }
        return containers;
    }

    async listContainers() {
        const runtimes = this.getRuntimes();
        if (runtimes.length === 0) {
            return [];
        }

        const results = await Promise.allSettled(
            runtimes.map(rt => this._listRuntime(rt))
        );

        const containers = [];
        let firstError = null;
        let anySucceeded = false;

        for (let i = 0; i < results.length; i++) {
            const res = results[i];
            if (res.status === 'fulfilled') {
                anySucceeded = true;
                containers.push(...res.value);
            } else {
                firstError ??= res.reason;
                console.warn(`[hostctl] ${runtimes[i]} list failed: ${res.reason?.message}`);
            }
        }

        if (!anySucceeded && firstError) {
            throw firstError;
        }

        return containers;
    }

    startContainer(id, runtime) {
        return execCommand([runtime, 'start', id], this._cancellable);
    }

    resumeContainer(id, runtime) {
        return execCommand([runtime, 'unpause', id], this._cancellable);
    }

    stopContainer(id, runtime) {
        return execCommand([runtime, 'stop', id], this._cancellable);
    }

    removeContainer(id, runtime) {
        return execCommand([runtime, 'rm', id], this._cancellable);
    }

    destroy() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
    }
}

