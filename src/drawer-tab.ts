// Room Mapper Frontend - Drawer Tab
import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import type { FloatWidget, NotifyFn } from './float-widget';

const DEFAULT_TEMPLATE = `[Current Location: {{roomName}}]
{{description}}
Exits: {{exits}}`;

export class DrawerTab {
  private tab: any;
  private currentChatId: string | null = null;
  private currentMap: any = null;
  private settingsListenersAttached = false;
  private templateSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionSelect: any = null;

  constructor(
    private ctx: SpindleFrontendContext,
    private widget: FloatWidget,
    private notify: NotifyFn
  ) {
    this.tab = ctx.ui.registerDrawerTab({
      id: 'room-mapper',
      title: 'Room Mapper',
      shortName: 'Rooms',
      description: 'Environment and room tracking for roleplay',
      keywords: ['map', 'location', 'rooms', 'environment'],
      iconSvg: `<svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2L2 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-8-5z"/>
        <circle cx="10" cy="10" r="2"/>
      </svg>`,
    });

    this.initializeUI();
  }

  // ── Construction ──────────────────────────────────────────────────────────

  private initializeUI(): void {
    this.tab.root.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 16px;';

    container.appendChild(this.createSettingsSection());
    container.appendChild(this.createRoomsSection());
    container.appendChild(this.createActionsSection());

    this.tab.root.appendChild(container);
    this.attachSettingsListeners();
  }

  private section(title: string): { section: HTMLElement; body: HTMLElement } {
    const section = document.createElement('div');
    const header = document.createElement('h3');
    header.textContent = title;
    header.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; font-weight: 600;';
    section.appendChild(header);
    return { section, body: section };
  }

  private createSettingsSection(): HTMLElement {
    const { section } = this.section('Settings');

    // Injection toggle
    section.appendChild(
      this.toggle('injection-enabled', 'Enable context injection', true)
    );

    // Injection role
    const roleWrap = document.createElement('label');
    roleWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;';
    const roleCaption = document.createElement('span');
    roleCaption.textContent = 'Injection role:';
    roleCaption.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const roleSelect = document.createElement('select');
    roleSelect.id = 'injection-role';
    roleSelect.style.cssText =
      'padding: 6px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text);';
    for (const [value, text] of [['system', 'System'], ['user', 'User'], ['assistant', 'Assistant']] as const) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      roleSelect.appendChild(opt);
    }
    roleWrap.append(roleCaption, roleSelect);
    section.appendChild(roleWrap);

    // Template
    const tplWrap = document.createElement('label');
    tplWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;';
    const tplCaption = document.createElement('span');
    tplCaption.textContent = 'Injection template:';
    tplCaption.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const tpl = document.createElement('textarea');
    tpl.id = 'injection-template';
    tpl.rows = 4;
    tpl.value = DEFAULT_TEMPLATE;
    tpl.style.cssText =
      'padding: 8px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text); font-family: monospace; font-size: 12px; resize: vertical;';
    const tplHint = document.createElement('span');
    tplHint.textContent = 'Available: {{roomName}}, {{description}}, {{exits}}';
    tplHint.style.cssText = 'font-size: 11px; color: var(--lumiverse-text-dim);';
    tplWrap.append(tplCaption, tpl, tplHint);
    section.appendChild(tplWrap);

    // Auto-discovery
    section.appendChild(
      this.toggle('auto-discovery', 'Enable automatic room discovery', true)
    );

    // Sidecar connection selector
    const connWrap = document.createElement('div');
    connWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-top: 4px;';
    const connCaption = document.createElement('span');
    connCaption.textContent = 'Sidecar connection (Scan Chat):';
    connCaption.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const connSlot = document.createElement('div');
    connSlot.id = 'sidecar-connection-slot';
    connWrap.append(connCaption, connSlot);
    section.appendChild(connWrap);
    void this.mountConnectionSelector(connSlot);

    return section;
  }

  private toggle(id: string, label: string, checked: boolean): HTMLElement {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 8px;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = checked;
    const span = document.createElement('span');
    span.textContent = label;
    wrap.append(input, span);
    return wrap;
  }

  private async mountConnectionSelector(slot: HTMLElement): Promise<void> {
    try {
      const api = (this.ctx as any).connections;
      if (!api?.list) return;
      const profiles = await api.list();
      if (!Array.isArray(profiles) || profiles.length === 0) return;

      this.connectionSelect = this.ctx.components.mountSelect(slot, {
        value: '',
        placeholder: 'Active connection',
        clearable: true,
        clearLabel: 'Active connection',
        options: profiles.map((p: any) => ({ value: p.id, label: p.name || p.model || p.id })),
        onChange: (value: string) => {
          this.saveSettings({ sidecarConnectionId: value || undefined });
        },
      });
    } catch (error) {
      console.warn('[room_mapper] Sidecar connection selector unavailable:', error);
    }
  }

  private createRoomsSection(): HTMLElement {
    const { section } = this.section('Rooms');

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';
    const title = document.createElement('h3');
    title.textContent = 'Rooms';
    title.style.cssText = 'margin: 0; font-size: 14px; font-weight: 600;';
    const addButton = document.createElement('button');
    addButton.textContent = '+ Add Room';
    addButton.style.cssText =
      'padding: 4px 12px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-accent); color: white; border: none; cursor: pointer; font-size: 12px;';
    addButton.onclick = () => this.showRoomForm(null);
    header.append(title, addButton);
    section.appendChild(header);

    const roomsList = document.createElement('div');
    roomsList.id = 'rooms-list';
    roomsList.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    section.appendChild(roomsList);

    return section;
  }

  private createActionsSection(): HTMLElement {
    const { section } = this.section('Actions');

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

    row.appendChild(this.actionButton('scan-chat-btn', 'Scan Chat', () => this.handleScanChat()));
    row.appendChild(this.actionButton('preview-map-btn', 'Preview Map', () => this.widget.show()));
    row.appendChild(this.actionButton('export-map-btn', 'Export JSON', () => this.handleExport()));
    row.appendChild(this.actionButton('import-map-btn', 'Import JSON', () => this.handleImport()));
    row.appendChild(this.actionButton('manage-maps-btn', 'Manage Maps', () => this.handleManageMaps()));

    section.appendChild(row);
    return section;
  }

  private actionButton(id: string, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = label;
    btn.style.cssText =
      'padding: 8px 16px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text); cursor: pointer;';
    btn.onclick = onClick;
    return btn;
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  private attachSettingsListeners(): void {
    if (this.settingsListenersAttached) return;
    this.settingsListenersAttached = true;

    this.q('#injection-enabled')?.addEventListener('change', () => this.saveSettings());
    this.q('#injection-role')?.addEventListener('change', () => this.saveSettings());
    this.q('#auto-discovery')?.addEventListener('change', () => this.saveSettings());
    this.q('#injection-template')?.addEventListener('input', () => {
      if (this.templateSaveTimer) clearTimeout(this.templateSaveTimer);
      this.templateSaveTimer = setTimeout(() => this.saveSettings(), 400);
    });
  }

  private saveSettings(extra?: Record<string, unknown>): void {
    if (!this.currentChatId) return;
    const settings = {
      injectionEnabled: (this.q('#injection-enabled') as HTMLInputElement)?.checked,
      injectionRole: (this.q('#injection-role') as HTMLSelectElement)?.value,
      template: (this.q('#injection-template') as HTMLTextAreaElement)?.value,
      autoDiscovery: (this.q('#auto-discovery') as HTMLInputElement)?.checked,
      ...extra,
    };
    this.ctx.sendToBackend({ type: 'update_settings', chatId: this.currentChatId, settings });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render(chatId: string, map: any): void {
    this.currentChatId = chatId;
    this.currentMap = map;

    const enabled = this.q('#injection-enabled') as HTMLInputElement;
    if (enabled) enabled.checked = map.settings.injectionEnabled;

    const role = this.q('#injection-role') as HTMLSelectElement;
    if (role) role.value = map.settings.injectionRole;

    const tpl = this.q('#injection-template') as HTMLTextAreaElement;
    if (tpl && document.activeElement !== tpl) tpl.value = map.settings.template;

    const auto = this.q('#auto-discovery') as HTMLInputElement;
    if (auto) auto.checked = map.settings.autoDiscovery;

    if (this.connectionSelect && map.settings.sidecarConnectionId !== undefined) {
      this.connectionSelect.update({ value: map.settings.sidecarConnectionId ?? '' });
    }

    this.renderRoomsList(map);
  }

  private renderRoomsList(map: any): void {
    const roomsList = this.q('#rooms-list');
    if (!roomsList) return;
    roomsList.innerHTML = '';

    if (!map.rooms.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No rooms yet. Add one to get started!';
      empty.style.cssText = 'color: var(--lumiverse-text-dim); font-size: 12px; padding: 12px; text-align: center;';
      roomsList.appendChild(empty);
      return;
    }

    for (const room of map.rooms) {
      roomsList.appendChild(this.roomCard(room, map));
    }
  }

  private roomCard(room: any, map: any): HTMLElement {
    const isCurrent = room.id === map.currentRoomId;
    const card = document.createElement('div');
    card.style.cssText = `
      padding: 12px;
      border-radius: var(--lumiverse-radius);
      background: var(--lumiverse-fill-subtle);
      border: 2px solid ${isCurrent ? 'var(--lumiverse-accent)' : 'var(--lumiverse-border)'};
    `;

    const name = document.createElement('div');
    name.textContent = room.name;
    name.style.cssText = 'font-weight: 600; margin-bottom: 4px;';
    card.appendChild(name);

    if (room.description) {
      const desc = document.createElement('div');
      desc.textContent =
        room.description.length > 100 ? `${room.description.slice(0, 100)}...` : room.description;
      desc.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim); margin-bottom: 8px;';
      card.appendChild(desc);
    }

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

    actions.appendChild(
      this.smallButton(isCurrent ? '\u2713 Current' : 'Set Current', () => this.setCurrent(room.id))
    );
    actions.appendChild(this.smallButton('Edit', () => this.showRoomForm(room)));
    actions.appendChild(
      this.smallButton('Delete', () => this.deleteRoom(room.id), '#f87171')
    );

    card.appendChild(actions);
    return card;
  }

  private smallButton(label: string, onClick: () => void, color?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `padding: 4px 8px; font-size: 11px; border-radius: 3px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); color: ${color ?? 'var(--lumiverse-text)'}; cursor: pointer;`;
    btn.onclick = onClick;
    return btn;
  }

  // ── Room forms (XSS-safe: values set via properties, never innerHTML) ──────

  private showRoomForm(room: any | null): void {
    const modal = this.ctx.ui.showModal({ title: room ? 'Edit Room' : 'Add Room', width: 460 });

    const form = document.createElement('form');
    form.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const name = this.field(form, 'Room Name:', 'input') as HTMLInputElement;
    name.value = room?.name ?? '';
    name.required = true;

    const description = this.field(form, 'Description:', 'textarea') as HTMLTextAreaElement;
    description.rows = 3;
    description.value = room?.description ?? '';

    const aliases = this.field(form, 'Aliases (comma-separated):', 'input') as HTMLInputElement;
    aliases.value = Array.isArray(room?.aliases) ? room.aliases.join(', ') : '';

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.cssText =
      'padding: 8px 16px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text); cursor: pointer;';
    cancel.onclick = () => modal.dismiss();

    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save';
    save.style.cssText =
      'padding: 8px 16px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-accent); color: white; border: none; cursor: pointer;';

    buttons.append(cancel, save);
    form.appendChild(buttons);

    form.onsubmit = (event) => {
      event.preventDefault();
      this.saveRoom(room?.id ?? null, name.value, description.value, aliases.value);
      modal.dismiss();
    };

    modal.root.appendChild(form);
  }

  private field(parent: HTMLElement, caption: string, kind: 'input' | 'textarea'): HTMLElement {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const cap = document.createElement('div');
    cap.textContent = caption;
    cap.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const el = document.createElement(kind);
    el.style.cssText =
      'width: 100%; padding: 8px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text);';
    wrap.append(cap, el);
    parent.appendChild(wrap);
    return el;
  }

  private saveRoom(roomId: string | null, name: string, description: string, aliasesStr: string): void {
    const aliases = aliasesStr.split(',').map((s) => s.trim()).filter(Boolean);
    const existing = roomId ? this.currentMap?.rooms.find((r: any) => r.id === roomId) : null;
    const room = {
      id: roomId ?? crypto.randomUUID(),
      name: name.trim(),
      description,
      aliases,
      connections: existing?.connections ?? [],
    };
    this.ctx.sendToBackend({ type: 'update_room', chatId: this.currentChatId, room });
  }

  private setCurrent(roomId: string): void {
    this.ctx.sendToBackend({ type: 'set_current_room', chatId: this.currentChatId, roomId });
  }

  private async deleteRoom(roomId: string): Promise<void> {
    const { confirmed } = await this.ctx.ui.showConfirm({
      title: 'Delete Room',
      message: 'Delete this room and all of its connections? This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (confirmed) {
      this.ctx.sendToBackend({ type: 'delete_room', chatId: this.currentChatId, roomId });
    }
  }

  // ── Scan Chat ─────────────────────────────────────────────────────────────

  private async handleScanChat(): Promise<void> {
    if (!this.currentChatId) return;

    if (this.q('#auto-discovery') && !(this.q('#auto-discovery') as HTMLInputElement).checked) {
      this.notify('warning', 'Enable automatic room discovery first.');
      return;
    }

    const btn = this.q('#scan-chat-btn') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Scanning...';
    }

    try {
      const connectionId = this.currentMap?.settings?.sidecarConnectionId;
      // Backend now reads messages directly via spindle.chat.getMessages()
      this.ctx.sendToBackend({ type: 'scan_chat', chatId: this.currentChatId, connectionId });
    } catch (error) {
      this.notify('error', `Scan failed: ${error}`);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Scan Chat';
      }
    }
    
    // Reset button after a short delay (backend response via scan_result will arrive)
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Scan Chat';
      }
    }, 500);
  }

  showScanResults(chatId: string, suggestions: any): void {
    const rooms = Array.isArray(suggestions?.rooms) ? suggestions.rooms : [];
    const connections = Array.isArray(suggestions?.connections) ? suggestions.connections : [];

    if (rooms.length === 0) {
      this.notify('info', 'No new locations found.');
      return;
    }

    const modal = this.ctx.ui.showModal({ title: 'Scan Results', width: 460, maxHeight: 560 });
    const body = document.createElement('div');
    body.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const roomChecks: Array<{ room: any; input: HTMLInputElement }> = [];
    const roomSection = document.createElement('div');
    const roomTitle = document.createElement('div');
    roomTitle.textContent = 'Suggested rooms';
    roomTitle.style.cssText = 'font-weight: 600; margin-bottom: 6px;';
    roomSection.appendChild(roomTitle);

    for (const room of rooms) {
      if (!room || typeof room.name !== 'string') continue;
      const row = document.createElement('label');
      row.style.cssText = 'display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      const text = document.createElement('div');
      const strong = document.createElement('div');
      strong.textContent = room.name;
      strong.style.cssText = 'font-weight: 600;';
      const desc = document.createElement('div');
      desc.textContent = typeof room.description === 'string' ? room.description : '';
      desc.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
      text.append(strong, desc);
      row.append(input, text);
      roomSection.appendChild(row);
      roomChecks.push({ room, input });
    }
    body.appendChild(roomSection);

    const connChecks: Array<{ conn: any; input: HTMLInputElement }> = [];
    if (connections.length) {
      const connSection = document.createElement('div');
      const connTitle = document.createElement('div');
      connTitle.textContent = 'Suggested connections';
      connTitle.style.cssText = 'font-weight: 600; margin-bottom: 6px;';
      connSection.appendChild(connTitle);
      for (const conn of connections) {
        if (!conn || typeof conn.from !== 'string' || typeof conn.to !== 'string') continue;
        const row = document.createElement('label');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 12px;';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = true;
        const text = document.createElement('span');
        text.textContent = `${conn.from} \u2194 ${conn.to}`;
        row.append(input, text);
        connSection.appendChild(row);
        connChecks.push({ conn, input });
      }
      body.appendChild(connSection);
    }

    const approve = document.createElement('button');
    approve.textContent = 'Approve Selected';
    approve.style.cssText =
      'align-self: flex-end; padding: 8px 16px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-accent); color: white; border: none; cursor: pointer;';
    approve.onclick = () => {
      const selectedRooms = roomChecks.filter((c) => c.input.checked).map((c) => c.room);
      const selectedConnections = connChecks.filter((c) => c.input.checked).map((c) => c.conn);
      this.ctx.sendToBackend({ type: 'merge_suggestions', chatId, selectedRooms, selectedConnections });
      modal.dismiss();
    };
    body.appendChild(approve);

    modal.root.appendChild(body);
  }

  // ── Manage Maps ───────────────────────────────────────────────────────────

  private handleManageMaps(): void {
    this.ctx.sendToBackend({ type: 'list_maps' });
  }

  showMapsList(maps: any[]): void {
    const modal = this.ctx.ui.showModal({ title: 'Manage Maps', width: 460, maxHeight: 560 });
    const body = document.createElement('div');
    body.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

    if (!Array.isArray(maps) || maps.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No stored maps.';
      empty.style.cssText = 'color: var(--lumiverse-text-dim); font-size: 12px;';
      body.appendChild(empty);
    } else {
      for (const map of maps) {
        const row = document.createElement('div');
        row.style.cssText =
          'display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle);';
        const label = document.createElement('span');
        label.textContent = map.chatId === this.currentChatId ? `${map.chatId} (current)` : map.chatId;
        label.style.cssText = 'font-size: 12px; word-break: break-all;';
        const del = this.smallButton('Delete', async () => {
          const { confirmed } = await this.ctx.ui.showConfirm({
            title: 'Delete Map',
            message: `Delete the stored map for chat ${map.chatId}?`,
            variant: 'danger',
            confirmLabel: 'Delete',
          });
          if (confirmed) this.ctx.sendToBackend({ type: 'delete_map', chatId: map.chatId });
        }, '#f87171');
        row.append(label, del);
        body.appendChild(row);
      }
    }

    modal.root.appendChild(body);
  }

  // ── Export / Import ───────────────────────────────────────────────────────

  private handleExport(): void {
    if (this.currentChatId) {
      this.ctx.sendToBackend({ type: 'export_map', chatId: this.currentChatId });
    }
  }

  private handleImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event: any) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const json = e.target?.result as string;
        if (this.currentChatId && typeof json === 'string') {
          this.ctx.sendToBackend({ type: 'import_map', chatId: this.currentChatId, json });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  clear(): void {
    this.currentChatId = null;
    this.currentMap = null;
    const roomsList = this.q('#rooms-list');
    if (roomsList) roomsList.innerHTML = '';
  }

  destroy(): void {
    if (this.templateSaveTimer) clearTimeout(this.templateSaveTimer);
    this.connectionSelect?.destroy?.();
    this.tab.destroy();
  }

  private q(selector: string): Element | null {
    return this.tab.root.querySelector(selector);
  }
}
