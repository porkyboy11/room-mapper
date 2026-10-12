// Room Mapper Backend - Sidecar Scanner
import type { SpindleAPI } from 'lumiverse-spindle-types';

const MAX_CONVERSATION_CHARS = 12000;

export class SidecarScanner {
  constructor(private spindle: SpindleAPI) {}

  async scanChat(chatId: string, messages: string[], connectionId?: string, userId?: string, modelOverride?: string): Promise<any> {
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

      // userId is required for operator-scoped installs; user-scoped installs
      // infer it from the extension owner, so omit it when absent.
      // generate.raw does not resolve the model from connection_id, so a model
      // must be supplied: either the user's free-text override or the one from
      // the connection profile. If neither is usable, fall back to quiet
      // (active chat connection).
      let rawRequest: any = null;
      if (connectionId && modelOverride) {
        // Explicit model: skip the profile lookup entirely.
        rawRequest = {
          type: 'raw' as const,
          messages: [{ role: 'user', content: prompt }],
          connection_id: connectionId,
          model: modelOverride,
          ...(userId ? { userId } : {}),
        };
      } else if (connectionId) {
        const profile = await this.spindle.connections.get(connectionId, userId);
        if (profile && profile.model) {
          rawRequest = {
            type: 'raw' as const,
            messages: [{ role: 'user', content: prompt }],
            connection_id: connectionId,
            provider: profile.provider,
            model: profile.model,
            ...(userId ? { userId } : {}),
          };
        } else {
          this.spindle.log.warn(
            `Sidecar connection ${connectionId} is unavailable or has no model; using the active chat connection instead.`
          );
        }
      }

      const result = (rawRequest
        ? await this.spindle.generate.raw(rawRequest)
        : await this.spindle.generate.quiet({
            type: 'quiet',
            messages: [{ role: 'user', content: prompt }],
            ...(userId ? { userId } : {}),
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
