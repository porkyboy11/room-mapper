// Room Mapper Backend - Type Definitions

export const MAP_VERSION = 1;

export interface Room {
  id: string;
  name: string;
  description: string;
  aliases: string[];
  connections: string[];
  position?: { x: number; y: number };
}

export interface MapSettings {
  injectionEnabled: boolean;
  injectionRole: 'system' | 'user' | 'assistant';
  template: string;
  sidecarConnectionId?: string;
  sidecarModel?: string;
  autoDiscovery: boolean;
}

export interface RoomMap {
  version: number;
  currentRoomId: string | null;
  rooms: Room[];
  settings: MapSettings;
  updatedAt: number;
}

export const DEFAULT_TEMPLATE = `[Current Location: {{roomName}}]
{{description}}
Exits: {{exits}}`;

export function createEmptyMap(): RoomMap {
  return {
    version: MAP_VERSION,
    currentRoomId: null,
    rooms: [],
    settings: {
      injectionEnabled: true,
      injectionRole: 'system',
      template: DEFAULT_TEMPLATE,
      autoDiscovery: true,
    },
    updatedAt: Date.now(),
  };
}

/** Validate that an untrusted value is a well-formed Room. */
export function isValidRoom(value: any): value is Room {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    Array.isArray(value.aliases) &&
    Array.isArray(value.connections)
  );
}

/** Normalize a room payload, dropping non-string entries from arrays. */
export function normalizeRoom(value: any): Room {
  return {
    id: String(value.id),
    name: String(value.name),
    description: typeof value.description === 'string' ? value.description : '',
    aliases: (value.aliases as unknown[]).filter((a): a is string => typeof a === 'string'),
    connections: (value.connections as unknown[]).filter((c): c is string => typeof c === 'string'),
    ...(value.position && typeof value.position.x === 'number' && typeof value.position.y === 'number'
      ? { position: { x: value.position.x, y: value.position.y } }
      : {}),
  };
}
