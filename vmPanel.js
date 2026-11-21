/* vmPanel.js
 *
 * Minimalist GNOME Shell panel indicator for QEMU/KVM VMs and Docker/Podman containers
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { VirshClient } from './virshClient.js';
import { ContainerClient } from './containerClient.js';
import { SshClient } from './sshClient.js';

const STATE_DOT = {
    'running': 'vm-dot-running',
    'idle': 'vm-dot-running',
    'paused': 'vm-dot-paused',
    'restarting': 'vm-dot-paused',
    'in shutdown': 'vm-dot-paused',
    'pmsuspended': 'vm-dot-paused',
};

export const VmPanel = GObject.registerClass(
    class VmPanel extends PanelMenu.Button {
        _init(extension) {
            super._init(0.5, _('hostctl'));
            this.add_style_class_name('hostctl-panel-button');

            this._extension = extension;
            this._settings = extension.getSettings();
            this._virsh = new VirshClient();
            this._containers = new ContainerClient();
            this._ssh = new SshClient();
            this._destroyed = false;
            this._refreshGen = 0;

            this._settingsChangedId = this._settings.connect('changed', () => {
                this._refresh();
            });

            this.add_child(new St.Icon({
                gicon: Gio.icon_new_for_string(`${this._extension.path}/icons/hostctl-symbolic.svg`),
                style_class: 'system-status-icon',
            }));

            this._menuOpenId = this.menu.connect('open-state-changed', (_menu, isOpen) => {
                if (isOpen) {
                    this._refresh();
                }
            });

            this._refresh();
        }

        async _refresh() {
            const gen = ++this._refreshGen;
            const showSsh = this._settings.get_boolean('show-ssh');
            const showVms = this._settings.get_boolean('show-vms');
            const showContainers = this._settings.get_boolean('show-containers');

            const [vmResult, containerResult, sshResult] = await Promise.allSettled([
                showVms ? this._virsh.listVms() : Promise.resolve([]),
                showContainers ? this._containers.listContainers() : Promise.resolve([]),
                showSsh ? this._ssh.listHosts() : Promise.resolve([]),
            ]);

            if (this._destroyed || gen !== this._refreshGen) return;
            this._renderMenu(vmResult, containerResult, sshResult, gen, {
                showSsh,
                showVms,
                showContainers,
            });
        }

        _renderTopBar() {
            const topItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            topItem.add_style_class_name('vm-header-item');

            const box = new St.BoxLayout({
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            box.add_child(new St.Label({
                text: _('Host Control'),
                style_class: 'vm-top-title',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            }));

            box.add_child(this._makeActionButton('emblem-system-symbolic', _('Settings'), () => {
                this.menu.close();
                this._extension.openPreferences();
            }));

            topItem.add_child(box);
            this.menu.addMenuItem(topItem);
        }

        _renderSectionHeader(title, countText = null) {
            const headerItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false,
            });
            headerItem.add_style_class_name('vm-header-item');

            const box = new St.BoxLayout({
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });

            box.add_child(new St.Label({
                text: title,
                style_class: 'vm-header-title',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            }));

            let countLabel = null;
            if (countText !== null) {
                    countLabel = new St.Label({
                        text: countText,
                        style_class: 'vm-header-count',
                        y_align: Clutter.ActorAlign.CENTER,
            });
box.add_child(countLabel);
            }

headerItem.add_child(box);
this.menu.addMenuItem(headerItem);
return countLabel;
        }

_renderDisabledNote(target, text) {
    const item = new PopupMenu.PopupMenuItem(text);
    item.sensitive = false;
    target.addMenuItem(item);
}

_createScrollSection() {
    const maxItems = this._settings.get_int('section-max-items');
    const outer = new PopupMenu.PopupMenuSection();
    const scrollView = new St.ScrollView({
        style_class: 'vm-scroll',
        style: `max-height: ${maxItems * 34}px;`,
        hscrollbar_policy: St.PolicyType.NEVER,
        vscrollbar_policy: St.PolicyType.AUTOMATIC,
        overlay_scrollbars: false,
    });
    const inner = new PopupMenu.PopupMenuSection();

    if (typeof scrollView.set_child === 'function')
        scrollView.set_child(inner.actor);
    else
        scrollView.add_child(inner.actor);

    scrollView.connect('notify::mapped', () => {
        if (!scrollView.mapped) return;
        const children = inner.actor.get_children();
        const count = Math.min(children.length, maxItems);
        let height = 0;
        for (let i = 0; i < count; i++) {
            const [, natH] = children[i].get_preferred_height(-1);
            height += natH;
        }
        if (height > 0)
            scrollView.style = `max-height: ${height}px;`;
    });

    outer.actor.add_child(scrollView);
    this.menu.addMenuItem(outer);
    return inner;
}

_formatCount(items) {
    const running = items.filter(item => item.state === 'running').length;
    return `${running}/${items.length}`;
}

_renderMenu(vmResult, containerResult, sshResult, gen, { showSsh, showVms, showContainers }) {
    this.menu.removeAll();
    this._renderTopBar();
    let hasSection = true;

    let lastCountLabel = null;
    const nextSection = (title, countText) => {
        if (hasSection) {
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
        hasSection = true;
        lastCountLabel = this._renderSectionHeader(title, countText);
        return this._createScrollSection();
    };

    if (showSsh) {
        const totalSsh = sshResult.status === 'fulfilled' ? sshResult.value.length : 0;
        const sshCount = sshResult.status === 'fulfilled' ? `0/${totalSsh}` : null;
        const sshSection = nextSection(_('SSH Hosts'), sshCount);
        const sshState = { reachable: 0, total: totalSsh, label: lastCountLabel };

        if (sshResult.status === 'rejected') {
            console.error(`[hostctl] SSH config read failed: ${sshResult.reason?.message}`);
            this._renderDisabledNote(sshSection, _('Error: ') + sshResult.reason?.message);
        } else if (sshResult.value.length === 0) {
            this._renderDisabledNote(sshSection, _('No SSH hosts found'));
        } else {
            for (const host of sshResult.value) {
                const item = this._createEntryItem(host.name, 'shut off', null, {
                    onConnect: () => {
                        this.menu.close();
                        this._ssh.connectHost(host.name);
                    },
                });
                sshSection.addMenuItem(item);
                this._probeSshHost(host.name, item, gen, sshState);
            }
        }
    }

    if (showVms) {
        const vmCount = vmResult.status === 'fulfilled' ? this._formatCount(vmResult.value) : null;
        const vmSection = nextSection(_('Virtual Machines'), vmCount);

        if (vmResult.status === 'rejected') {
            console.error(`[hostctl] VM refresh failed: ${vmResult.reason?.message}`);
            this._renderDisabledNote(vmSection, _('Error: ') + vmResult.reason?.message);
        } else if (vmResult.value.length === 0) {
            this._renderDisabledNote(vmSection, _('No virtual machines found'));
        } else {
            for (const vm of vmResult.value) {
                vmSection.addMenuItem(this._createEntryItem(vm.name, vm.state, null, {
                    onStart: () => this._virsh.startVm(vm.name),
                    onPause: () => this._virsh.pauseVm(vm.name),
                    onResume: () => this._virsh.resumeVm(vm.name),
                    onStop: () => this._virsh.stopVm(vm.name, vm.state),
                }));
            }
        }
    }

    if (showContainers) {
        const hasRuntime = this._containers.hasRuntime();
        const containerCount = hasRuntime && containerResult.status === 'fulfilled'
            ? this._formatCount(containerResult.value)
            : null;
        const containerSection = nextSection(_('Containers'), containerCount);

        if (!hasRuntime) {
            this._renderDisabledNote(containerSection, _('No container runtime found'));
        } else if (containerResult.status === 'rejected') {
            console.error(`[hostctl] Container refresh failed: ${containerResult.reason?.message}`);
            this._renderDisabledNote(containerSection, _('Error: ') + containerResult.reason?.message);
        } else if (containerResult.value.length === 0) {
            this._renderDisabledNote(containerSection, _('No containers found'));
        } else {
            const multiRuntime = this._containers.getRuntimes().length > 1;
            for (const c of containerResult.value) {
                const suffix = multiRuntime ? c.runtime : null;
                containerSection.addMenuItem(this._createEntryItem(c.name, c.state, suffix, {
                    onStart: () => this._containers.startContainer(c.id, c.runtime),
                    onResume: () => this._containers.resumeContainer(c.id, c.runtime),
                    onStop: () => this._containers.stopContainer(c.id, c.runtime),
                    onRemove: () => this._containers.removeContainer(c.id, c.runtime),
                }));
            }
        }
    }

    if (!showSsh && !showVms && !showContainers) {
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._renderDisabledNote(this.menu, _('All sections are hidden'));
    }
}

        async _probeSshHost(hostName, item, gen, sshState) {
        const reachable = await this._ssh.isHostReachable(hostName);
        if (this._destroyed || gen !== this._refreshGen || !item._dot) return;
        item._dot.style_class = `vm-dot ${reachable ? 'vm-dot-running' : 'vm-dot-off'}`;
        if (reachable && sshState.label) {
            sshState.reachable++;
            sshState.label.text = `${sshState.reachable}/${sshState.total}`;
        }
    }

    _createEntryItem(name, state, runtimeSuffix, handlers) {
        const isActivatable = Boolean(handlers.onConnect);
        const item = new PopupMenu.PopupBaseMenuItem({
            activate: isActivatable,
            can_focus: isActivatable,
        });
        item.add_style_class_name('vm-row-item');

        if (handlers.onConnect) {
            item.connect('activate', () => {
                try {
                    handlers.onConnect();
                } catch (e) {
                    console.error(`[hostctl] SSH failed for ${name}: ${e.message}`);
                    Main.notify(_('hostctl'), `${name}: ${e.message}`);
                }
            });
        }

        const row = new St.BoxLayout({
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'vm-row',
        });

        if (state !== null) {
            const dotClass = STATE_DOT[state] ?? 'vm-dot-off';

            item._dot = new St.Label({
                text: '●',
                style_class: `vm-dot ${dotClass}`,
                y_align: Clutter.ActorAlign.CENTER,
            });
            row.add_child(item._dot);
        }

        row.add_child(new St.Label({
            text: name,
            style_class: 'vm-name',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        }));

        if (runtimeSuffix) {
            row.add_child(new St.Label({
                text: runtimeSuffix,
                style_class: 'vm-state',
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }

        const actionsBox = new St.BoxLayout({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'vm-actions',
        });

        if (handlers.onConnect) {
            actionsBox.add_child(new St.Icon({
                icon_name: 'utilities-terminal-symbolic',
                icon_size: 14,
                style_class: 'vm-state',
                y_align: Clutter.ActorAlign.CENTER,
            }));
        }

        if (state === 'running') {
            if (handlers.onPause) {
                actionsBox.add_child(this._makeActionButton(
                    'media-playback-pause-symbolic',
                    _('Pause'),
                    () => this._runAction(actionsBox, handlers.onPause, name)
                ));
            }
            actionsBox.add_child(this._makeActionButton(
                'media-playback-stop-symbolic',
                _('Stop'),
                () => this._runAction(actionsBox, handlers.onStop, name)
            ));
        } else if (state === 'paused') {
            actionsBox.add_child(this._makeActionButton(
                'media-playback-start-symbolic',
                _('Resume'),
                () => this._runAction(actionsBox, handlers.onResume, name)
            ));
            actionsBox.add_child(this._makeActionButton(
                'media-playback-stop-symbolic',
                _('Stop'),
                () => this._runAction(actionsBox, handlers.onStop, name)
            ));
        } else if (handlers.onStart) {
            actionsBox.add_child(this._makeActionButton(
                'media-playback-start-symbolic',
                _('Start'),
                () => this._runAction(actionsBox, handlers.onStart, name)
            ));
            if (handlers.onRemove) {
                const removeBtn = this._makeActionButton(
                    'user-trash-symbolic',
                    _('Remove'),
                    () => this._runAction(actionsBox, handlers.onRemove, name)
                );
                removeBtn.add_style_class_name('vm-action-btn-danger');
                actionsBox.add_child(removeBtn);
            }
        }

        row.add_child(actionsBox);
        item.add_child(row);
        return item;
    }

    _makeActionButton(iconName, accessibleName, onClick) {
        const btn = new St.Button({
            child: new St.Icon({
                icon_name: iconName,
                icon_size: 14,
            }),
            style_class: 'vm-action-btn',
            accessible_name: accessibleName,
            reactive: true,
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        btn.connect('clicked', onClick);
        return btn;
    }

        async _runAction(actionsBox, actionFn, name) {
        actionsBox.reactive = false;
        actionsBox.opacity = 120;
        try {
            await actionFn();
        } catch (e) {
            if (this._destroyed) return;
            console.error(`[hostctl] Action failed for ${name}: ${e.message}`);
            Main.notify(_('hostctl'), `${name}: ${e.message}`);
        } finally {
            if (!this._destroyed) {
                await this._refresh();
            }
        }
    }

    destroy() {
        this._destroyed = true;
        if (this._menuOpenId) {
            this.menu.disconnect(this._menuOpenId);
            this._menuOpenId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        this._settings = null;
        if (this._virsh) {
            this._virsh.destroy();
            this._virsh = null;
        }
        if (this._containers) {
            this._containers.destroy();
            this._containers = null;
        }
        if (this._ssh) {
            this._ssh.destroy();
            this._ssh = null;
        }
        super.destroy();
    }
});
