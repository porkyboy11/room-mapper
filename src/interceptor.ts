// Room Mapper Backend - Interceptor
import type { SpindleAPI, LlmMessageDTO } from 'lumiverse-spindle-types';
import type { Room, RoomMap } from './types';
import { MapStorage } from './storage';

export class RoomInterceptor {
  constructor(
    private spindle: SpindleAPI,
    private storage: MapStorage
  ) {
    this.spindle.registerInterceptor(async (messages, context) => {
      return this.handleIntercept(messages, context);
    });
  }

  private async handleIntercept(
    messages: LlmMessageDTO[],
    context: any
  ): Promise<{ messages: LlmMessageDTO[]; breakdown?: Array<{ messageIndex: number; name?: string }> }> {
    try {
      const chatId = context?.chatId;
      if (typeof chatId !== 'string' || !chatId) return { messages };

      // Cached read keeps the pre-LLM path fast.
      const map = await this.storage.getCachedMap(chatId);

      if (!map.settings.injectionEnabled || !map.currentRoomId) return { messages };

      const currentRoom = map.rooms.find((r) => r.id === map.currentRoomId);
      if (!currentRoom) return { messages };

      const injectionMessage: LlmMessageDTO = {
        role: map.settings.injectionRole,
        content: this.buildInjectionContent(currentRoom, map),
      };

      return {
        messages: [injectionMessage, ...messages],
        breakdown: [{ messageIndex: 0, name: 'Room Context' }],
      };
    } catch (error) {
      this.spindle.log.error(`Interceptor error: ${error}`);
      return { messages };
    }
  }

  private buildInjectionContent(currentRoom: Room, map: RoomMap): string {
    const exits = currentRoom.connections
      .map((connId) => map.rooms.find((r) => r.id === connId)?.name ?? '')
      .filter((name) => name)
      .join(', ');

    return map.settings.template
      .replace(/\{\{roomName\}\}/g, currentRoom.name)
      .replace(/\{\{description\}\}/g, currentRoom.description)
      .replace(/\{\{exits\}\}/g, exits || 'None');
  }
}
