/* prefs.js
 *
 * Preferences window for hostctl
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HostctlPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        const sectionsGroup = new Adw.PreferencesGroup({
            title: _('Sections'),
        });

        const toggles = [
            ['show-ssh', _('SSH Hosts')],
            ['show-vms', _('Virtual Machines')],
            ['show-containers', _('Containers')],
        ];
        for (const [key, title] of toggles) {
            const row = new Adw.SwitchRow({title});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            sectionsGroup.add(row);
        }

        const maxItemsRow = new Adw.SpinRow({
            title: _('Max items per section'),
            subtitle: _('Maximum visible items before scrolling'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 50,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        settings.bind('section-max-items', maxItemsRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        sectionsGroup.add(maxItemsRow);

        page.add(sectionsGroup);
        window.add(page);
    }
}
