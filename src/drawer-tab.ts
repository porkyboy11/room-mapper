// Room Mapper Frontend - Drawer Tab
import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import type { FloatWidget, NotifyFn } from './float-widget';

const DEFAULT_TEMPLATE = `[Current Location: {{roomName}}]
{{description}}
Exits: {{exits}}`;

// Duplicated from src/types.ts (backend and frontend are separate bundles).
// Keep both definitions in sync.
const DEFAULT_SCAN_PROMPT = `You are analyzing a roleplay conversation to extract location information.

Review the conversation below and identify:
1. All distinct locations/rooms mentioned
2. A brief description of each location based on the narrative
3. Which locations are connected (characters moved between them)

Return ONLY valid JSON in this exact format, with no prose before or after:
{
  "rooms": [
    {"name": "Kitchen", "description": "A modern kitchen with stainless steel appliances", "aliases": ["cook room"]},
    {"name": "Living Room", "description": "Cozy living space with a fireplace", "aliases": []}
  ],
  "connections": [
    {"from": "Kitchen", "to": "Living Room"}
  ]
}

Conversation:
{{conversation}}`;

// Duplicated from src/types.ts (backend and frontend are separate bundles).
// Keep both definitions in sync.
function normalizeRoomKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type TabId = 'map' | 'editor' | 'settings';

export class DrawerTab {
  private tab: any;
  private currentChatId: string | null = null;
  private currentMap: any = null;
  private activeTab: TabId = 'map';
  private settingsListenersAttached = false;
  private settingsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionSelect: any = null;
  private editorRoomSelect: any = null;
  private editorRoomSignature = '';
  private editorRoomId: string | null = null;

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

  // ── Shell ─────────────────────────────────────────────────────────────────

  private initializeUI(): void {
    this.tab.root.innerHTML = '';

    const container = document.createElement('div');
    container.style.cssText = 'padding: 12px; display: flex; flex-direction: column; gap: 12px;';

    container.appendChild(this.createTabBar());
    container.appendChild(this.wrapPanel('map', this.createMapPanel()));
    container.appendChild(this.wrapPanel('editor', this.createEditorPanel()));
    container.appendChild(this.wrapPanel('settings', this.createSettingsPanel()));

    this.tab.root.appendChild(container);
    this.setActiveTab(this.activeTab);
    this.attachSettingsListeners();
  }

  private wrapPanel(tab: TabId, panel: HTMLElement): HTMLElement {
    panel.id = `room-mapper-panel-${tab}`;
    return panel;
  }

  private createTabBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.style.cssText = 'display: flex; gap: 4px; border-bottom: 1px solid var(--lumiverse-border); padding-bottom: 8px;';

    for (const [id, label] of [
      ['map', 'Map'],
      ['editor', 'Editor'],
      ['settings', 'Settings'],
    ] as Array<[TabId, string]>) {
      const btn = document.createElement('button');
      btn.id = `tab-btn-${id}`;
      btn.textContent = label;
      btn.style.cssText =
        'flex: 1; padding: 6px 8px; font-size: 12px; border-radius: var(--lumiverse-radius); background: transparent; border: none; color: var(--lumiverse-text-dim); cursor: pointer;';
      btn.onclick = () => this.setActiveTab(id);
      bar.appendChild(btn);
    }
    return bar;
  }

  private setActiveTab(tab: TabId): void {
    this.activeTab = tab;
    for (const id of ['map', 'editor', 'settings'] as TabId[]) {
      const panel = this.q(`#room-mapper-panel-${id}`) as HTMLElement | null;
      if (panel) panel.style.display = id === tab ? 'flex' : 'none';
      const btn = this.q(`#tab-btn-${id}`) as HTMLElement | null;
      if (btn) {
        const active = id === tab;
        btn.style.background = active ? 'var(--lumiverse-fill-subtle)' : 'transparent';
        btn.style.color = active ? 'var(--lumiverse-text)' : 'var(--lumiverse-text-dim)';
        btn.style.fontWeight = active ? '600' : '400';
      }
    }
  }

  private panel(title: string): HTMLElement {
    const section = document.createElement('div');
    section.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';
    const header = document.createElement('h3');
    header.textContent = title;
    header.style.cssText = 'margin: 0; font-size: 14px; font-weight: 600;';
    section.appendChild(header);
    return section;
  }

  // ── Map panel ─────────────────────────────────────────────────────────────

  private createMapPanel(): HTMLElement {
    const panel = this.panel('Map');

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
    const title = document.createElement('h3');
    title.textContent = 'Rooms';
    title.style.cssText = 'margin: 0; font-size: 14px; font-weight: 600;';
    const addButton = document.createElement('button');
    addButton.textContent = '+ Add Room';
    addButton.style.cssText =
      'padding: 4px 12px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-accent); color: white; border: none; cursor: pointer; font-size: 12px;';
    addButton.onclick = () => this.showRoomForm(null);
    header.append(title, addButton);
    panel.appendChild(header);

    const roomsList = document.createElement('div');
    roomsList.id = 'rooms-list';
    roomsList.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';
    panel.appendChild(roomsList);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';
    actions.appendChild(this.actionButton('scan-chat-btn', 'Scan Chat', () => this.handleScanChat()));
    actions.appendChild(this.actionButton('preview-map-btn', 'Preview Map', () => this.widget.show()));
    actions.appendChild(this.actionButton('export-map-btn', 'Export JSON', () => this.handleExport()));
    actions.appendChild(this.actionButton('import-map-btn', 'Import JSON', () => this.handleImport()));
    actions.appendChild(this.actionButton('manage-maps-btn', 'Manage Maps', () => this.handleManageMaps()));
    panel.appendChild(actions);

    return panel;
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

  // ── Editor panel ──────────────────────────────────────────────────────────

  private createEditorPanel(): HTMLElement {
    const panel = this.panel('Editor');

    const empty = document.createElement('div');
    empty.id = 'editor-empty';
    empty.textContent = 'No rooms yet. Add one in the Map tab, or use Scan Chat.';
    empty.style.cssText = 'color: var(--lumiverse-text-dim); font-size: 12px; padding: 8px 0;';
    panel.appendChild(empty);

    const body = document.createElement('div');
    body.id = 'editor-body';
    body.style.cssText = 'display: none; flex-direction: column; gap: 12px;';
    panel.appendChild(body);

    // Room selector
    const selectWrap = document.createElement('div');
    selectWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const selectCaption = document.createElement('span');
    selectCaption.textContent = 'Place to edit:';
    selectCaption.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const selectSlot = document.createElement('div');
    selectSlot.id = 'editor-room-slot';
    selectWrap.append(selectCaption, selectSlot);
    body.appendChild(selectWrap);

    // Name / description / aliases
    const name = this.field(body, 'Name:', 'input', 'editor-name');
    const description = this.field(body, 'Description:', 'textarea', 'editor-description') as HTMLTextAreaElement;
    description.rows = 3;
    this.field(body, 'Aliases (comma-separated):', 'input', 'editor-aliases');

    // Connections
    const connWrap = document.createElement('div');
    connWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const connCaption = document.createElement('div');
    connCaption.textContent = 'Connections';
    connCaption.style.cssText = 'font-size: 12px; font-weight: 600;';
    const connHint = document.createElement('div');
    connHint.textContent = 'Connections are two-way. Changes apply immediately.';
    connHint.style.cssText = 'font-size: 11px; color: var(--lumiverse-text-dim);';
    const connList = document.createElement('div');
    connList.id = 'editor-connections';
    connList.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow-y: auto;';
    connWrap.append(connCaption, connHint, connList);
    body.appendChild(connWrap);

    // Buttons
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';
    const save = document.createElement('button');
    save.textContent = 'Save Place';
    save.style.cssText =
      'padding: 6px 14px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-accent); color: white; border: none; cursor: pointer; font-size: 12px;';
    save.onclick = () => this.saveEditorRoom();
    const setCurrent = document.createElement('button');
    setCurrent.textContent = 'Set Current';
    setCurrent.style.cssText =
      'padding: 6px 14px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text); cursor: pointer; font-size: 12px;';
    setCurrent.onclick = () => {
      if (this.editorRoomId) this.setCurrent(this.editorRoomId);
    };
    const del = document.createElement('button');
    del.textContent = 'Delete Place';
    del.style.cssText =
      'padding: 6px 14px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); border: 1px solid var(--lumiverse-border); color: #f87171; cursor: pointer; font-size: 12px;';
    del.onclick = () => {
      if (this.editorRoomId) this.deleteRoom(this.editorRoomId);
    };
    buttons.append(save, setCurrent, del);
    body.appendChild(buttons);

    void name;
    void description;

    return panel;
  }

  private field(parent: HTMLElement, caption: string, kind: 'input' | 'textarea', id?: string): HTMLElement {
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const cap = document.createElement('div');
    cap.textContent = caption;
    cap.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const el = document.createElement(kind);
    if (id) el.id = id;
    el.style.cssText =
      'width: 100%; padding: 8px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill-subtle); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text);';
    wrap.append(cap, el);
    parent.appendChild(wrap);
    return el;
  }

  private renderEditorPanel(map: any): void {
    const empty = this.q('#editor-empty');
    const body = this.q('#editor-body') as HTMLElement | null;
    if (!empty || !body) return;

    if (!map.rooms.length) {
      (empty as HTMLElement).style.display = '';
      body.style.display = 'none';
      this.editorRoomId = null;
      return;
    }
    (empty as HTMLElement).style.display = 'none';
    body.style.display = 'flex';

    // Rebuild the room selector only when the room set changes, to avoid
    // clobbering interaction mid-edit.
    const signature = map.rooms.map((r: any) => `${r.id}:${r.name}`).join('|');
    if (signature !== this.editorRoomSignature) {
      this.editorRoomSignature = signature;
      const stillExists = this.editorRoomId && map.rooms.some((r: any) => r.id === this.editorRoomId);
      if (!stillExists) {
        this.editorRoomId = map.currentRoomId ?? map.rooms[0].id;
      }
      const slot = this.q('#editor-room-slot');
      if (slot) {
        slot.innerHTML = '';
        this.editorRoomSelect = this.ctx.components.mountSelect(slot, {
          value: this.editorRoomId ?? '',
          options: map.rooms.map((r: any) => ({ value: r.id, label: r.name })),
          onChange: (value: string) => {
            this.editorRoomId = value || null;
            this.fillEditorForm();
            this.renderEditorConnections();
          },
        });
      }
    }

    this.fillEditorForm();
    this.renderEditorConnections();
  }

  private fillEditorForm(): void {
    const room = this.currentMap?.rooms.find((r: any) => r.id === this.editorRoomId);
    const name = this.q('#editor-name') as HTMLInputElement | null;
    const description = this.q('#editor-description') as HTMLTextAreaElement | null;
    const aliases = this.q('#editor-aliases') as HTMLInputElement | null;
    if (!name || !description || !aliases) return;
    if (name === document.activeElement || description === document.activeElement || aliases === document.activeElement) return;
    name.value = room?.name ?? '';
    description.value = room?.description ?? '';
    aliases.value = Array.isArray(room?.aliases) ? room.aliases.join(', ') : '';
    if (this.editorRoomSelect) {
      this.editorRoomSelect.update({ value: this.editorRoomId ?? '' });
    }
  }

  private renderEditorConnections(): void {
    const list = this.q('#editor-connections');
    if (!list) return;
    list.innerHTML = '';

    const map = this.currentMap;
    const room = map?.rooms.find((r: any) => r.id === this.editorRoomId);
    if (!map || !room) return;

    const others = map.rooms.filter((r: any) => r.id !== room.id);
    if (others.length === 0) {
      const none = document.createElement('div');
      none.textContent = 'Add another place to connect rooms.';
      none.style.cssText = 'font-size: 11px; color: var(--lumiverse-text-dim);';
      list.appendChild(none);
      return;
    }

    for (const other of others) {
      const row = document.createElement('label');
      row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = room.connections.includes(other.id);
      input.onchange = () => {
        if (!this.currentChatId) return;
        this.ctx.sendToBackend({
          type: input.checked ? 'add_connection' : 'remove_connection',
          chatId: this.currentChatId,
          roomIdA: room.id,
          roomIdB: other.id,
        });
      };
      const label = document.createElement('span');
      label.textContent = other.name;
      row.append(input, label);
      list.appendChild(row);
    }
  }

  private saveEditorRoom(): void {
    const room = this.currentMap?.rooms.find((r: any) => r.id === this.editorRoomId);
    if (!room) return;
    const name = ((this.q('#editor-name') as HTMLInputElement)?.value || '').trim();
    if (!name) {
      this.notify('warning', 'Place name is required.');
      return;
    }
    const description = (this.q('#editor-description') as HTMLTextAreaElement)?.value ?? '';
    const aliasesStr = (this.q('#editor-aliases') as HTMLInputElement)?.value ?? '';
    const aliases = aliasesStr.split(',').map((s) => s.trim()).filter(Boolean);
    this.ctx.sendToBackend({
      type: 'update_room',
      chatId: this.currentChatId,
      room: {
        ...room,
        name,
        description,
        aliases,
      },
    });
    this.notify('success', `Saved "${name}".`);
  }

  private showRoomForm(room: any | null): void {
    const modal = this.ctx.ui.showModal({ title: room ? 'Edit Room' : 'Add Room', width: 460 });

    const form = document.createElement('form');
    form.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

    const name = this.field(form, 'Room Name:', 'input', 'modal-room-name') as HTMLInputElement;
    name.value = room?.name ?? '';
    name.required = true;

    const description = this.field(form, 'Description:', 'textarea', 'modal-room-description') as HTMLTextAreaElement;
    description.rows = 3;
    description.value = room?.description ?? '';

    const aliases = this.field(form, 'Aliases (comma-separated):', 'input', 'modal-room-aliases') as HTMLInputElement;
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
    if (!roomId) {
      this.editorRoomId = room.id;
    }
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

  // ── Settings panel ────────────────────────────────────────────────────────

  private createSettingsPanel(): HTMLElement {
    const panel = this.panel('Settings');

    // Injection
    const injectionTitle = document.createElement('div');
    injectionTitle.textContent = 'Context Injection';
    injectionTitle.style.cssText = 'font-size: 12px; font-weight: 600;';
    panel.appendChild(injectionTitle);

    panel.appendChild(this.toggle('injection-enabled', 'Enable context injection', true));

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
    panel.appendChild(roleWrap);

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
    panel.appendChild(tplWrap);

    // Scan prompt
    const promptTitle = document.createElement('div');
    promptTitle.textContent = 'Scan Chat';
    promptTitle.style.cssText = 'font-size: 12px; font-weight: 600; margin-top: 4px;';
    panel.appendChild(promptTitle);

    panel.appendChild(this.toggle('auto-discovery', 'Enable automatic room discovery', true));

    const connWrap = document.createElement('div');
    connWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;';
    const connCaption = document.createElement('span');
    connCaption.textContent = 'Sidecar connection:';
    connCaption.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const connSlot = document.createElement('div');
    connSlot.id = 'sidecar-connection-slot';
    connWrap.append(connCaption, connSlot);
    panel.appendChild(connWrap);
    void this.mountConnectionSelector(connSlot);

    const modelWrap = document.createElement('label');
    modelWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;';
    const modelCaption = document.createElement('span');
    modelCaption.textContent = 'Model override (optional):';
    modelCaption.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const modelInput = document.createElement('input');
    modelInput.type = 'text';
    modelInput.id = 'sidecar-model';
    modelInput.placeholder = 'Uses the connection\u2019s model when empty';
    modelInput.style.cssText =
      'padding: 6px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text);';
    modelWrap.append(modelCaption, modelInput);
    panel.appendChild(modelWrap);

    const promptWrap = document.createElement('label');
    promptWrap.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
    const promptCaption = document.createElement('span');
    promptCaption.textContent = 'Scan prompt (sent to the sidecar LLM):';
    promptCaption.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
    const promptArea = document.createElement('textarea');
    promptArea.id = 'scan-prompt';
    promptArea.rows = 10;
    promptArea.value = DEFAULT_SCAN_PROMPT;
    promptArea.style.cssText =
      'padding: 8px; border-radius: var(--lumiverse-radius); background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text); font-family: monospace; font-size: 11px; resize: vertical;';
    const promptRow = document.createElement('div');
    promptRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 8px;';
    const promptHint = document.createElement('span');
    promptHint.textContent = 'Must contain {{conversation}} \u2014 the chat history is inserted there.';
    promptHint.style.cssText = 'font-size: 11px; color: var(--lumiverse-text-dim);';
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.textContent = 'Reset to default';
    resetBtn.style.cssText =
      'padding: 4px 10px; font-size: 11px; border-radius: 3px; background: var(--lumiverse-fill); border: 1px solid var(--lumiverse-border); color: var(--lumiverse-text); cursor: pointer;';
    resetBtn.onclick = () => {
      const area = this.q('#scan-prompt') as HTMLTextAreaElement | null;
      if (area) {
        area.value = DEFAULT_SCAN_PROMPT;
        this.saveSettings();
      }
    };
    promptRow.append(promptHint, resetBtn);
    promptWrap.append(promptCaption, promptArea, promptRow);
    panel.appendChild(promptWrap);

    return panel;
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

  // ── Settings persistence ──────────────────────────────────────────────────

  private attachSettingsListeners(): void {
    if (this.settingsListenersAttached) return;
    this.settingsListenersAttached = true;

    this.q('#injection-enabled')?.addEventListener('change', () => this.saveSettings());
    this.q('#injection-role')?.addEventListener('change', () => this.saveSettings());
    this.q('#auto-discovery')?.addEventListener('change', () => this.saveSettings());
    for (const id of ['#injection-template', '#scan-prompt', '#sidecar-model']) {
      this.q(id)?.addEventListener('input', () => {
        if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer);
        this.settingsSaveTimer = setTimeout(() => this.saveSettings(), 400);
      });
    }
  }

  private saveSettings(extra?: Record<string, unknown>): void {
    if (!this.currentChatId) return;
    const settings = {
      injectionEnabled: (this.q('#injection-enabled') as HTMLInputElement)?.checked,
      injectionRole: (this.q('#injection-role') as HTMLSelectElement)?.value,
      template: (this.q('#injection-template') as HTMLTextAreaElement)?.value,
      scanPrompt: (this.q('#scan-prompt') as HTMLTextAreaElement)?.value,
      autoDiscovery: (this.q('#auto-discovery') as HTMLInputElement)?.checked,
      sidecarModel: ((this.q('#sidecar-model') as HTMLInputElement)?.value || '').trim() || undefined,
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

    const prompt = this.q('#scan-prompt') as HTMLTextAreaElement;
    if (prompt && document.activeElement !== prompt) {
      prompt.value = map.settings.scanPrompt || DEFAULT_SCAN_PROMPT;
    }

    const auto = this.q('#auto-discovery') as HTMLInputElement;
    if (auto) auto.checked = map.settings.autoDiscovery;

    if (this.connectionSelect && map.settings.sidecarConnectionId !== undefined) {
      this.connectionSelect.update({ value: map.settings.sidecarConnectionId ?? '' });
    }

    const model = this.q('#sidecar-model') as HTMLInputElement;
    if (model && document.activeElement !== model) model.value = map.settings.sidecarModel ?? '';

    this.renderRoomsList(map);
    this.renderEditorPanel(map);
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
    actions.appendChild(
      this.smallButton('Edit', () => {
        this.editorRoomId = room.id;
        this.setActiveTab('editor');
      })
    );
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
      const modelOverride = ((this.q('#sidecar-model') as HTMLInputElement)?.value || '').trim() || undefined;
      // Backend reads messages directly via spindle.chat.getMessages()
      this.ctx.sendToBackend({ type: 'scan_chat', chatId: this.currentChatId, connectionId, model: modelOverride });
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

  /** Fuzzy-match a suggested name against existing room names and aliases. */
  private findRoomBySuggestion(name: string): any {
    const key = normalizeRoomKey(name);
    if (!key || !this.currentMap) return undefined;
    return this.currentMap.rooms.find(
      (room: any) =>
        normalizeRoomKey(room.name) === key ||
        (Array.isArray(room.aliases) && room.aliases.some((alias: string) => normalizeRoomKey(alias) === key))
    );
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
      const duplicate = this.findRoomBySuggestion(room.name);
      const row = document.createElement('label');
      row.style.cssText = 'display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !duplicate;
      input.disabled = Boolean(duplicate);
      const text = document.createElement('div');
      const strong = document.createElement('div');
      strong.textContent = duplicate ? `${room.name} (already on map)` : room.name;
      strong.style.cssText = duplicate ? 'font-weight: 600; color: var(--lumiverse-text-dim);' : 'font-weight: 600;';
      const desc = document.createElement('div');
      desc.textContent = typeof room.description === 'string' ? room.description : '';
      desc.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
      text.append(strong, desc);
      row.append(input, text);
      if (!duplicate) roomSection.appendChild(row);
      roomChecks.push({ room, input });
    }
    if (!roomSection.querySelector('label')) {
      const none = document.createElement('div');
      none.textContent = 'No new locations found.';
      none.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
      roomSection.appendChild(none);
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
        const roomA = this.findRoomBySuggestion(conn.from);
        const roomB = this.findRoomBySuggestion(conn.to);
        const alreadyConnected = Boolean(
          roomA && roomB && roomA.id !== roomB.id && roomA.connections.includes(roomB.id)
        );
        const row = document.createElement('label');
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 4px; font-size: 12px;';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !alreadyConnected;
        input.disabled = alreadyConnected;
        const text = document.createElement('span');
        text.textContent = alreadyConnected
          ? `${conn.from} \u2194 ${conn.to} (already connected)`
          : `${conn.from} \u2194 ${conn.to}`;
        if (alreadyConnected) text.style.color = 'var(--lumiverse-text-dim)';
        row.append(input, text);
        if (!alreadyConnected) connSection.appendChild(row);
        connChecks.push({ conn, input });
      }
      if (!connSection.querySelector('label')) {
        const none = document.createElement('div');
        none.textContent = 'No new connections found.';
        none.style.cssText = 'font-size: 12px; color: var(--lumiverse-text-dim);';
        connSection.appendChild(none);
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
    this.editorRoomId = null;
    const roomsList = this.q('#rooms-list');
    if (roomsList) roomsList.innerHTML = '';
  }

  destroy(): void {
    if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer);
    this.connectionSelect?.destroy?.();
    this.editorRoomSelect?.destroy?.();
    this.tab.destroy();
  }

  private q(selector: string): Element | null {
    return this.tab.root.querySelector(selector);
  }
}
