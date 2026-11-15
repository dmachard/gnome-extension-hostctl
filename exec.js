/* exec.js
 *
 * Shared async subprocess helper forcing LC_ALL=C / LANG=C for locale-safe parsing
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const TERMINALS = [
    ['xdg-terminal-exec'],
    ['ptyxis', '--'],
    ['gnome-terminal', '--'],
    ['kgx', '--'],
    ['alacritty', '-e'],
    ['kitty'],
    ['xterm', '-e'],
];

/**
 * Launch an interactive command in the user's terminal emulator (detached).
 * @param {string[]} argv
 */
export function spawnInTerminal(argv) {
    for (const [bin, ...prefix] of TERMINALS) {
        if (GLib.find_program_in_path(bin) !== null) {
            Gio.Subprocess.new([bin, ...prefix, ...argv], Gio.SubprocessFlags.NONE);
            return;
        }
    }
    throw new Error('No supported terminal emulator found');
}

/**
 * Execute a command asynchronously and return its stdout as UTF-8.
 * @param {string[]} argv
 * @param {Gio.Cancellable | null} cancellable
 * @returns {Promise<string>}
 */
export function execCommand(argv, cancellable = null) {
    return new Promise((resolve, reject) => {
        const launcher = new Gio.SubprocessLauncher({
            flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
        });
        // Force C locale so CLI output and state strings are never translated
        launcher.setenv('LC_ALL', 'C', true);
        launcher.setenv('LANG', 'C', true);

        let proc;
        try {
            proc = launcher.spawnv(argv);
        } catch (e) {
            reject(e);
            return;
        }

        proc.communicate_utf8_async(null, cancellable, (p, res) => {
            try {
                const [, stdout, stderr] = p.communicate_utf8_finish(res);
                if (p.get_successful()) {
                    resolve(stdout ?? '');
                } else {
                    reject(new Error((stderr || stdout || `${argv[0]} ${argv[1] ?? ''} failed`).trim()));
                }
            } catch (e) {
                reject(e);
            }
        });
    });
}

