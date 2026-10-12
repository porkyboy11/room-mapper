// Room Mapper Backend - Keyword Scanner
import type { SpindleAPI } from 'lumiverse-spindle-types';
import type { RoomMap } from './types';
import { MapStorage } from './storage';

export class KeywordScanner {
  private lastAutoSwitchByChat = new Map<string, number>();
  private readonly autoSwitchCooldownMs = 10000;

  constructor(
    private spindle: SpindleAPI,
    private storage: MapStorage
  ) {
    this.spindle.on('MESSAGE_SENT', (payload) => {
      void this.handleMessageSent(payload as any);
    });
  }

  private async handleMessageSent(payload: any): Promise<void> {
    try {
      const message = payload?.message;
      if (!message || message.is_user) return;

      const chatId = payload?.chatId;
      if (typeof chatId !== 'string' || !chatId) return;

      const now = Date.now();
      const lastSwitch = this.lastAutoSwitchByChat.get(chatId) ?? 0;
      if (now - lastSwitch < this.autoSwitchCooldownMs) return;

      const map = await this.storage.loadMap(chatId);
      if (!map.settings.autoDiscovery || map.rooms.length === 0) return;

      const content = typeof message.content === 'string' ? this.cleanContent(message.content) : '';
      if (!content) return;

      const matchedRooms = this.findMatchingRooms(content, map);

      // Safe mode: only auto-switch when exactly one distinct known room is
      // mentioned. Multiple matches are treated as ambiguous and ignored.
      if (matchedRooms.size !== 1) return;

      const [roomId] = Array.from(matchedRooms);
      if (roomId === map.currentRoomId) return;

      map.currentRoomId = roomId;
      await this.storage.saveMap(chatId, map);
      this.lastAutoSwitchByChat.set(chatId, now);

      const room = map.rooms.find((r) => r.id === roomId);
      this.spindle.log.info(`Auto-switched to room: ${room?.name ?? roomId}`);
    } catch (error) {
      this.spindle.log.error(`Keyword scanner error: ${error}`);
    }
  }

  /** Strip leading location emoji and surrounding whitespace. */
  private cleanContent(content: string): string {
    const leadingEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1FA00}-\u{1FAFF}]+\s*/u;
    return content.replace(leadingEmoji, '').trim();
  }

  private findMatchingRooms(content: string, map: RoomMap): Set<string> {
    const matched = new Set<string>();

    for (const room of map.rooms) {
      const searchTerms = [room.name, ...room.aliases];
      for (const term of searchTerms) {
        if (typeof term !== 'string' || !term.trim()) continue;

        let pattern: RegExp;
        try {
          pattern = new RegExp(`\\b${this.escapeRegex(term.trim())}\\b`, 'i');
        } catch (error) {
          this.spindle.log.warn(`Invalid match pattern for room "${room.name}": ${error}`);
          continue;
        }

        if (pattern.test(content)) {
          matched.add(room.id);
          break;
        }
      }
    }

    return matched;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
