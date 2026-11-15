/* virshClient.js
 *
 * Async virsh wrapper forcing LC_ALL=C / LANG=C for locale-safe parsing
 */

import Gio from 'gi://Gio';
import {execCommand} from './exec.js';

const KNOWN_STATES = 'running|shut off|paused|idle|in shutdown|crashed|pmsuspended';
const VM_LINE_RE = new RegExp(`^\\s*(\\d+|-)\\s+(.+?)\\s+(${KNOWN_STATES})\\s*$`);

export class VirshClient {
    constructor() {
        this._cancellable = new Gio.Cancellable();
    }

    _run(args) {
        return execCommand(['virsh', ...args], this._cancellable);
    }

    async listVms() {
        const output = await this._run(['list', '--all']);
        const vms = [];
        for (const line of output.split('\n')) {
            const match = line.match(VM_LINE_RE);
            if (match) {
                vms.push({
                    id: match[1] === '-' ? null : match[1],
                    name: match[2].trim(),
                    state: match[3],
                });
            }
        }
        return vms;
    }

    startVm(name) {
        return this._run(['start', name]);
    }

    pauseVm(name) {
        return this._run(['suspend', name]);
    }

    resumeVm(name) {
        return this._run(['resume', name]);
    }

    stopVm(name, state) {
        // Paused VMs cannot process ACPI shutdown; destroy powers them off directly
        const cmd = state === 'paused' ? 'destroy' : 'shutdown';
        return this._run([cmd, name]);
    }

    destroy() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }
    }
}

