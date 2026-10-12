// Room Mapper Backend - Storage Layer
import type { SpindleAPI } from 'lumiverse-spindle-types';
import type { RoomMap } from './types';
import { MAP_VERSION, createEmptyMap } from './types';

export class MapStorage {
  private inFlight = new Map<string, Promise<RoomMap>>();
  private cache = new Map<string, { map: RoomMap; at: number }>();
  private readonly cacheTtlMs = 1500;

  constructor(private spindle: SpindleAPI) {}

  private path(chatId: string): string {
    return `maps/${chatId}.json`;
  }

  /**
   * Load a map, deduplicating concurrent requests for the same chat so a
   * brand-new chat is not initialized twice (two empty maps racing).
   */
  async loadMap(chatId: string): Promise<RoomMap> {
    const existing = this.inFlight.get(chatId);
    if (existing) return existing;

    const promise = this.loadMapInternal(chatId);
    this.inFlight.set(chatId, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(chatId);
    }
  }

  /** Short-lived cached read used on the hot generation path. */
  async getCachedMap(chatId: string): Promise<RoomMap> {
    const hit = this.cache.get(chatId);
    if (hit && Date.now() - hit.at < this.cacheTtlMs) return hit.map;
    const map = await this.loadMap(chatId);
    this.cache.set(chatId, { map, at: Date.now() });
    return map;
  }

  private async loadMapInternal(chatId: string): Promise<RoomMap> {
    const path = this.path(chatId);
    let raw = '';
    try {
      const exists = await this.spindle.storage.exists(path);
      if (!exists) {
        const empty = createEmptyMap();
        await this.saveMap(chatId, empty);
        return empty;
      }

      raw = await this.spindle.storage.read(path);
      const parsed = JSON.parse(raw) as RoomMap;

      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.rooms) || !parsed.settings) {
        throw new Error('Invalid map structure');
      }

      if (parsed.version !== MAP_VERSION) {
        this.spindle.log.warn(`Unsupported map version ${parsed.version} for chat ${chatId}`);
        await this.backupCorrupt(chatId, raw);
        this.spindle.toast.warning('Unsupported map version. Starting fresh (old file backed up).');
        const empty = createEmptyMap();
        await this.saveMap(chatId, empty);
        return empty;
      }

      return parsed;
    } catch (error) {
      this.spindle.log.warn(`Failed to load map for chat ${chatId}: ${error}`);
      if (raw) await this.backupCorrupt(chatId, raw);
      this.spindle.toast.warning('Map file corrupted. Starting with empty map.');
      const empty = createEmptyMap();
      await this.saveMap(chatId, empty);
      return empty;
    }
  }

  private async backupCorrupt(chatId: string, content: string): Promise<void> {
    try {
      await this.spindle.storage.write(`maps/${chatId}.corrupt-${Date.now()}.json`, content);
    } catch {
      // Best-effort backup only.
    }
  }

  async saveMap(chatId: string, map: RoomMap): Promise<void> {
    map.updatedAt = Date.now();
    await this.spindle.storage.write(this.path(chatId), JSON.stringify(map, null, 2));
    this.cache.set(chatId, { map, at: Date.now() });
    this.spindle.sendToFrontend({ type: 'map_updated', chatId, map });
  }

  async deleteMap(chatId: string): Promise<void> {
    await this.spindle.storage.delete(this.path(chatId));
    this.cache.delete(chatId);
    this.spindle.sendToFrontend({ type: 'map_deleted', chatId });
  }

  async listAllMaps(): Promise<Array<{ chatId: string; path: string }>> {
    try {
      const files = await this.spindle.storage.list('maps/');
      return files
        .filter((f) => f.endsWith('.json') && !f.includes('.corrupt-'))
        .map((path) => ({
          chatId: path.replace('maps/', '').replace('.json', ''),
          path,
        }));
    } catch (error) {
      this.spindle.log.error(`Failed to list maps: ${error}`);
      return [];
    }
  }
}
