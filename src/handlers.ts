// Room Mapper Backend - Message Handlers
import type { SpindleAPI } from 'lumiverse-spindle-types';
import type { Room, RoomMap } from './types';
import { isValidRoom, normalizeRoom } from './types';
import { MapStorage } from './storage';
import { SidecarScanner } from './sidecar';

export class MessageHandler {
  constructor(
    private spindle: SpindleAPI,
    private storage: MapStorage,
    private scanner: SidecarScanner
  ) {
    this.spindle.onFrontendMessage((payload, userId) => {
      void this.handleMessage(payload as any, userId);
    });
  }

  private async handleMessage(msg: any, userId?: string): Promise<void> {
    try {
      switch (msg?.type) {
        case 'load_map':
          await this.handleLoadMap(msg.chatId);
          break;
        case 'update_room':
          await this.handleUpdateRoom(msg.chatId, msg.room);
          break;
        case 'delete_room':
          await this.handleDeleteRoom(msg.chatId, msg.roomId);
          break;
        case 'set_current_room':
          await this.handleSetCurrentRoom(msg.chatId, msg.roomId);
          break;
        case 'add_connection':
          await this.handleAddConnection(msg.chatId, msg.roomIdA, msg.roomIdB);
          break;
        case 'remove_connection':
          await this.handleRemoveConnection(msg.chatId, msg.roomIdA, msg.roomIdB);
          break;
        case 'update_settings':
          await this.handleUpdateSettings(msg.chatId, msg.settings);
          break;
        case 'export_map':
          await this.handleExportMap(msg.chatId);
          break;
        case 'import_map':
          await this.handleImportMap(msg.chatId, msg.json);
          break;
        case 'list_maps':
          await this.handleListMaps();
          break;
        case 'delete_map':
          await this.handleDeleteMap(msg.chatId);
          break;
        case 'scan_chat':
          await this.handleScanChat(msg.chatId, msg.messages, msg.connectionId, userId, msg.model);
          break;
        case 'merge_suggestions':
          await this.handleMergeSuggestions(msg.chatId, msg.selectedRooms, msg.selectedConnections);
          break;
        case 'toast':
          this.handleToast(msg.level, msg.message, userId);
          break;
      }
    } catch (error) {
      this.spindle.log.error(`Message handler error: ${error}`);
      this.spindle.sendToFrontend({ type: 'error', message: String(error) });
    }
  }

  /** Relay a frontend-originated notification through the backend toast API. */
  private handleToast(level: unknown, message: unknown, userId?: string): void {
    const text = typeof message === 'string' ? message : String(message ?? '');
    if (!text) return;
    const options = userId ? { userId } : undefined;
    switch (level) {
      case 'success':
        this.spindle.toast.success(text, options);
        break;
      case 'warning':
        this.spindle.toast.warning(text, options);
        break;
      case 'error':
        this.spindle.toast.error(text, options);
        break;
      default:
        this.spindle.toast.info(text, options);
    }
  }

  private async handleLoadMap(chatId: string): Promise<void> {
    const map = await this.storage.loadMap(chatId);
    this.spindle.sendToFrontend({ type: 'map_loaded', chatId, map });
  }

  private async handleUpdateRoom(chatId: string, room: any): Promise<void> {
    if (!isValidRoom(room)) {
      this.spindle.log.error('Rejected invalid room payload');
      return;
    }
    const clean = normalizeRoom(room);

    const map = await this.storage.loadMap(chatId);
    const index = map.rooms.findIndex((r) => r.id === clean.id);
    if (index >= 0) {
      map.rooms[index] = clean;
    } else {
      map.rooms.push(clean);
    }
    await this.storage.saveMap(chatId, map);
  }

  private async handleDeleteRoom(chatId: string, roomId: string): Promise<void> {
    const map = await this.storage.loadMap(chatId);
    map.rooms = map.rooms.filter((r) => r.id !== roomId);
    for (const room of map.rooms) {
      room.connections = room.connections.filter((id) => id !== roomId);
    }
    if (map.currentRoomId === roomId) map.currentRoomId = null;
    await this.storage.saveMap(chatId, map);
  }

  private async handleSetCurrentRoom(chatId: string, roomId: string | null): Promise<void> {
    const map = await this.storage.loadMap(chatId);
    map.currentRoomId = typeof roomId === 'string' ? roomId : null;
    await this.storage.saveMap(chatId, map);
  }

  private async handleAddConnection(chatId: string, roomIdA: string, roomIdB: string): Promise<void> {
    const map = await this.storage.loadMap(chatId);
    const roomA = map.rooms.find((r) => r.id === roomIdA);
    const roomB = map.rooms.find((r) => r.id === roomIdB);
    if (roomA && roomB) {
      if (!roomA.connections.includes(roomIdB)) roomA.connections.push(roomIdB);
      if (!roomB.connections.includes(roomIdA)) roomB.connections.push(roomIdA);
      await this.storage.saveMap(chatId, map);
    }
  }

  private async handleRemoveConnection(chatId: string, roomIdA: string, roomIdB: string): Promise<void> {
    const map = await this.storage.loadMap(chatId);
    const roomA = map.rooms.find((r) => r.id === roomIdA);
    const roomB = map.rooms.find((r) => r.id === roomIdB);
    if (roomA && roomB) {
      roomA.connections = roomA.connections.filter((id) => id !== roomIdB);
      roomB.connections = roomB.connections.filter((id) => id !== roomIdA);
      await this.storage.saveMap(chatId, map);
    }
  }

  private async handleUpdateSettings(chatId: string, settings: any): Promise<void> {
    if (!settings || typeof settings !== 'object') return;
    const map = await this.storage.loadMap(chatId);
    map.settings = { ...map.settings, ...settings };
    await this.storage.saveMap(chatId, map);
  }

  private async handleExportMap(chatId: string): Promise<void> {
    const map = await this.storage.loadMap(chatId);
    this.spindle.sendToFrontend({
      type: 'map_export',
      chatId,
      json: JSON.stringify(map, null, 2),
    });
  }

  private async handleImportMap(chatId: string, json: string): Promise<void> {
    try {
      const map = JSON.parse(json) as RoomMap;
      if (!map || typeof map !== 'object' || !Array.isArray(map.rooms) || !map.settings) {
        throw new Error('Invalid map structure');
      }
      map.rooms = map.rooms.filter(isValidRoom).map(normalizeRoom);
      await this.storage.saveMap(chatId, map);
      this.spindle.toast.success('Map imported successfully');
    } catch (error) {
      this.spindle.toast.error(`Import failed: ${error}`);
      throw error;
    }
  }

  private async handleListMaps(): Promise<void> {
    const maps = await this.storage.listAllMaps();
    this.spindle.sendToFrontend({ type: 'maps_list', maps });
  }

  private async handleDeleteMap(chatId: string): Promise<void> {
    await this.storage.deleteMap(chatId);
    this.spindle.toast.success('Map deleted');
  }

  private async handleScanChat(chatId: string, _unused: unknown, connectionId?: string, userId?: string, modelOverride?: string): Promise<void> {
    try {
      // Read messages from backend using the stable spindle.chat.getMessages API
      const messages = await this.spindle.chat.getMessages(chatId);

      if (!Array.isArray(messages) || messages.length === 0) {
        this.spindle.sendToFrontend({
          type: 'scan_result',
          chatId,
          suggestions: null,
          error: 'No conversation messages available',
        }, userId);
        return;
      }

      // Format last ~40 messages as "Role: content" strings for the sidecar LLM
      const recent = messages.slice(-40);
      const text = recent.map((m) => {
        const role = m.is_user ? 'User' : 'Assistant';
        const content = typeof m.content === 'string' ? m.content : '';
        return `${role}: ${content}`;
      });

      // User-editable scan prompt lives in per-map settings.
      const map = await this.storage.getCachedMap(chatId);
      const result = await this.scanner.scanChat(chatId, text, connectionId, userId, modelOverride, map.settings.scanPrompt);
      this.spindle.sendToFrontend({
        type: 'scan_result',
        chatId,
        suggestions: result.suggestions ?? null,
        error: result.error,
      }, userId);
    } catch (error) {
      this.spindle.log.error(`Scan chat failed: ${error}`);
      this.spindle.sendToFrontend({
        type: 'scan_result',
        chatId,
        suggestions: null,
        error: String(error),
      }, userId);
    }
  }

  private async handleMergeSuggestions(
    chatId: string,
    selectedRooms: any,
    selectedConnections: any
  ): Promise<void> {
    const rooms = Array.isArray(selectedRooms) ? selectedRooms : [];
    const connections = Array.isArray(selectedConnections) ? selectedConnections : [];

    const map = await this.storage.loadMap(chatId);

    for (const suggested of rooms) {
      if (!suggested || typeof suggested.name !== 'string' || !suggested.name.trim()) continue;
      const exists = map.rooms.find((r) => r.name.toLowerCase() === suggested.name.trim().toLowerCase());
      if (exists) continue;
      const newRoom: Room = {
        id: crypto.randomUUID(),
        name: suggested.name.trim(),
        description: typeof suggested.description === 'string' ? suggested.description : '',
        aliases: Array.isArray(suggested.aliases)
          ? suggested.aliases.filter((a: unknown): a is string => typeof a === 'string')
          : [],
        connections: [],
      };
      map.rooms.push(newRoom);
    }

    for (const conn of connections) {
      if (!conn || typeof conn.from !== 'string' || typeof conn.to !== 'string') continue;
      const roomA = map.rooms.find((r) => r.name === conn.from);
      const roomB = map.rooms.find((r) => r.name === conn.to);
      if (roomA && roomB && roomA.id !== roomB.id && !roomA.connections.includes(roomB.id)) {
        roomA.connections.push(roomB.id);
        roomB.connections.push(roomA.id);
      }
    }

    await this.storage.saveMap(chatId, map);
    this.spindle.toast.success('Suggestions merged successfully');
  }
}
