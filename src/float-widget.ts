// Room Mapper Frontend - Float Widget
import type { SpindleFrontendContext } from 'lumiverse-spindle-types';

export type NotifyFn = (level: 'success' | 'warning' | 'error' | 'info', message: string) => void;

export class FloatWidget {
  private widget: any = null;
  private cy: any = null;
  private cytoscapeLoaded = false;
  private currentChatId: string | null = null;
  private currentMap: any = null;

  constructor(
    private ctx: SpindleFrontendContext,
    private notify: NotifyFn
  ) {
    this.initWidget();
  }

  private initWidget(): void {
    try {
      this.widget = this.ctx.ui.createFloatWidget({
        width: 400,
        height: 300,
        initialPosition: { x: 100, y: 100 },
        snapToEdge: false,
        tooltip: 'Room Map',
        chromeless: false,
      });
    } catch (error) {
      // Typically a missing `ui_panels` grant. Degrade gracefully: the drawer
      // tab still works, only the map visual is unavailable.
      console.warn('[room_mapper] Float widget unavailable:', error);
      this.widget = null;
      return;
    }

    this.widget.root.innerHTML = '';
    this.widget.root.style.cssText =
      'width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--lumiverse-fill);';

    const header = document.createElement('div');
    header.style.cssText =
      'padding: 8px; background: var(--lumiverse-fill-subtle); border-bottom: 1px solid var(--lumiverse-border); font-size: 12px; font-weight: 600; display: flex; justify-content: space-between; align-items: center;';

    const label = document.createElement('span');
    label.id = 'widget-current-room';
    label.textContent = 'No room selected';
    header.appendChild(label);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '\u00d7';
    closeBtn.style.cssText =
      'background: none; border: none; font-size: 20px; cursor: pointer; padding: 0; width: 20px; height: 20px; line-height: 1;';
    closeBtn.onclick = () => this.hide();
    header.appendChild(closeBtn);

    this.widget.root.appendChild(header);

    const graphContainer = document.createElement('div');
    graphContainer.id = 'room-map-graph';
    graphContainer.style.cssText = 'flex: 1; position: relative;';
    this.widget.root.appendChild(graphContainer);

    const visible = localStorage.getItem('room-mapper-widget-visible') !== 'false';
    if (!visible) this.hide();
  }

  async render(chatId: string, map: any): Promise<void> {
    this.currentChatId = chatId;
    this.currentMap = map;
    if (!this.widget) return;

    const roomLabel = this.widget.root.querySelector('#widget-current-room');
    if (roomLabel) {
      const currentRoom = map.rooms.find((r: any) => r.id === map.currentRoomId);
      roomLabel.textContent = currentRoom ? `Current: ${currentRoom.name}` : 'No room selected';
    }

    const container = this.widget.root.querySelector('#room-map-graph');
    if (!container) return;

    if (!map.rooms || map.rooms.length === 0) {
      this.destroyGraph();
      container.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--lumiverse-text-dim);font-size:12px;padding:16px;text-align:center;">No rooms yet. Add one in the Room Mapper tab.</div>';
      return;
    }

    try {
      await this.ensureCytoscapeLoaded();
    } catch (error) {
      this.notify('error', 'Failed to load the map renderer.');
      return;
    }

    // Clear any empty-state message before (re)mounting the graph.
    container.innerHTML = '';
    this.renderGraph(map);
  }

  private async ensureCytoscapeLoaded(): Promise<void> {
    if (this.cytoscapeLoaded) return;
    const cytoscapeModule: any = await import('cytoscape');
    (window as any).cytoscape = cytoscapeModule.default || cytoscapeModule;
    this.cytoscapeLoaded = true;
  }

  private destroyGraph(): void {
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }

  private renderGraph(map: any): void {
    if (!this.cytoscapeLoaded || !this.widget) return;

    const container = this.widget.root.querySelector('#room-map-graph');
    if (!container) return;

    const nodes = map.rooms.map((room: any) => ({
      data: { id: room.id, label: room.name },
      position: room.position || undefined,
    }));

    const edges: any[] = [];
    const seen = new Set<string>();
    for (const room of map.rooms) {
      for (const targetId of room.connections) {
        const key = [room.id, targetId].sort().join('::');
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ data: { id: `${room.id}->${targetId}`, source: room.id, target: targetId } });
      }
    }

    this.destroyGraph();
    const cytoscape = (window as any).cytoscape;

    this.cy = cytoscape({
      container,
      elements: [...nodes, ...edges],
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#666',
            label: 'data(label)',
            color: '#fff',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '12px',
            width: '60px',
            height: '60px',
            'text-wrap': 'wrap',
            'text-max-width': '55px',
          },
        },
        {
          selector: `node[id="${map.currentRoomId}"]`,
          style: { 'background-color': '#5B8CFF', 'border-width': 3, 'border-color': '#fff' },
        },
        {
          selector: 'edge',
          style: { width: 2, 'line-color': '#999', 'target-arrow-shape': 'none', 'curve-style': 'bezier' },
        },
      ],
      layout: {
        name: map.rooms.some((r: any) => r.position) ? 'preset' : 'circle',
        padding: 30,
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    this.cy.on('dragfree', 'node', (event: any) => {
      const node = event.target;
      const position = node.position();
      const roomId = node.id();
      if (!this.currentChatId || !this.currentMap) return;
      const room = this.currentMap.rooms.find((r: any) => r.id === roomId);
      if (!room) return;
      room.position = { x: position.x, y: position.y };
      this.ctx.sendToBackend({ type: 'update_room', chatId: this.currentChatId, room });
    });

    this.cy.on('tap', 'node', (event: any) => {
      const roomId = event.target.id();
      if (this.currentChatId) {
        this.ctx.sendToBackend({ type: 'set_current_room', chatId: this.currentChatId, roomId });
      }
    });
  }

  show(): void {
    if (!this.widget) {
      this.notify('warning', 'Map widget unavailable. Grant the "ui_panels" permission.');
      return;
    }
    this.widget.setVisible(true);
    localStorage.setItem('room-mapper-widget-visible', 'true');
  }

  hide(): void {
    if (!this.widget) return;
    this.widget.setVisible(false);
    localStorage.setItem('room-mapper-widget-visible', 'false');
  }

  clear(): void {
    this.currentChatId = null;
    this.currentMap = null;
    this.destroyGraph();
    const roomLabel = this.widget?.root.querySelector('#widget-current-room');
    if (roomLabel) roomLabel.textContent = 'No room selected';
    const container = this.widget?.root.querySelector('#room-map-graph');
    if (container) container.innerHTML = '';
  }

  destroy(): void {
    this.destroyGraph();
    if (this.widget) {
      this.widget.destroy();
      this.widget = null;
    }
  }
}
