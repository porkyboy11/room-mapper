// Room Mapper Backend - Sidecar Scanner
import type { SpindleAPI } from 'lumiverse-spindle-types';

const MAX_CONVERSATION_CHARS = 12000;

export class SidecarScanner {
  constructor(private spindle: SpindleAPI) {}

  async scanChat(chatId: string, messages: string[], connectionId?: string): Promise<any> {
    try {
      if (!this.spindle.permissions.has('generation')) {
        throw new Error('Generation permission required for chat scanning');
      }

      const conversationText = messages.join('\n\n').slice(0, MAX_CONVERSATION_CHARS);
      const prompt = `You are analyzing a roleplay conversation to extract location information.

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
${conversationText}`;

      const result = (connectionId
        ? await this.spindle.generate.raw({
            type: 'raw',
            messages: [{ role: 'user', content: prompt }],
            connection_id: connectionId,
          })
        : await this.spindle.generate.quiet({
            type: 'quiet',
            messages: [{ role: 'user', content: prompt }],
          })) as { content?: string };

      const suggestions = this.parseSuggestions(result?.content || '');
      return { success: true, suggestions };
    } catch (error) {
      this.spindle.log.error(`Sidecar scan error: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /** Prefer a fenced ```json block, then fall back to the outermost braces. */
  private parseSuggestions(content: string): any {
    const fenced = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    const raw = fenced ? fenced[1] : (content.match(/\{[\s\S]*\}/) || [])[0];

    if (!raw) throw new Error('LLM response does not contain valid JSON');

    const parsed = JSON.parse(raw);
    return {
      rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      connections: Array.isArray(parsed.connections) ? parsed.connections : [],
    };
  }
}
