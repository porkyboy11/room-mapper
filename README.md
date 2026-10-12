# Room Mapper - Lumiverse Extension

Visual environment tracking with interactive room maps and automatic context injection for immersive roleplay.

## Features

- **Interactive Minimap**: Float widget with draggable node graph showing room connections
- **Automatic Context Injection**: Current room description and exits automatically added to every generation
- **Keyword Auto-Tracking**: Automatically detects room mentions in assistant messages and switches location
- **Manual Room Editing**: Full CRUD interface for rooms, descriptions, aliases, and connections
- **LLM-Assisted Discovery**: Optional sidecar LLM scan to extract locations from chat history
- **Export/Import**: Save and share room maps as JSON files

## Installation

1. Copy the `room-mapper` folder to your Lumiverse addons directory
2. Open Lumiverse → Settings → Extensions
3. Click "Install Extension" and select the `room-mapper` folder
4. Grant required permissions:
   - **interceptor** (required): Inject room context into prompts
   - **ui_panels** (required): Float widget for minimap
   - **generation** (optional): LLM-assisted room discovery

## Quick Start

1. Open a chat and click the **Room Mapper** tab in the drawer
2. Click **+ Add Room** to create your first room
3. Add room name, description, and optional aliases
4. Add more rooms and the extension will automatically show connections
5. The **float widget** appears automatically showing your room map
6. Click any room in the map to set it as current
7. Room context is now automatically injected into every generation!

## Usage

### Manual Room Management

**Add a Room:**
1. Open Room Mapper drawer tab
2. Click "+ Add Room"
3. Fill in name, description, and aliases
4. Click Save

**Edit a Room:**
1. Click "Edit" on any room card
2. Modify fields
3. Click Save

**Connect Rooms:**
- Connections are created automatically when you mention connected rooms in aliases
- Or manually edit a room and add connections in the connections field

**Set Current Room:**
- Click "Set Current" on a room card, OR
- Click a room node in the float widget

### Automatic Room Detection

The extension automatically tracks your location by:
1. **Keyword matching**: Scans assistant messages for room names/aliases
2. **Emoji-aware parsing**: Recognizes formats like `📍Kitchen - Cooking Area`
3. **Auto-switch**: If exactly one known room is mentioned and it differs from current, switches automatically
4. **Cooldown**: Max one auto-switch per 10 seconds to prevent flickering

### LLM-Assisted Discovery

1. Enable "Enable automatic room discovery" in settings
2. Select a sidecar connection (requires `generation` permission)
3. Click "Scan Chat"
4. Review suggested rooms and connections
5. Approve to merge into your map

### Context Injection

Every generation automatically includes:
```
[Current Location: Kitchen]
A modern kitchen with stainless steel appliances and a large island.
Exits: Living Room, Hallway, Pantry
```

**Configure injection:**
- Toggle on/off: "Enable context injection"
- Change role: System / User / Assistant
- Edit template: Customize format with `{{roomName}}`, `{{description}}`, `{{exits}}`

### Float Widget

- **Drag nodes** to rearrange (positions saved automatically)
- **Click node** to set as current room
- **Close button** (×) to hide widget
- **Preview Map** button in drawer tab to show widget

## Settings

### Injection Settings
- **Enable context injection**: Toggle room context in prompts
- **Injection role**: System (recommended), User, or Assistant
- **Template**: Customize output format

### Discovery Settings
- **Enable automatic room discovery**: Toggle keyword scanning
- **Sidecar connection**: LLM for "Scan Chat" feature

## Tips

- **Use aliases** for common variations (e.g., "Kitchen" room with alias "cook room", "dining area")
- **Emoji prefixes** in your preset location markers (`📍`) are automatically stripped
- **Bidirectional connections**: Adding Kitchen→Living Room automatically adds Living Room→Kitchen
- **Export your map** to back up or share with others
- **One map per chat**: Each chat has its own independent room map

## Troublesho

### Widget not showing
- Check that `ui_panels` permission is granted
- Click "Preview Map" in the drawer tab
- Widget may be off-screen - check edges of window

### Rooms not auto-switching
- Ensure "Enable automatic room discovery" is checked
- Verify room has correct name/aliases
- Check console for keyword match logs
- 10-second cooldown may be active

### Context not injecting
- Verify "Enable context injection" is checked
- Check that a room is set as current
- Verify `interceptor` permission is granted
- Check Prompt Breakdown to see "Room Context" entry

### Scan Chat not working
- Requires `generation` permission
- Must select a sidecar connection
- Chat must have sufficient message history
- Check for error toasts

## Technical Details

- **Storage**: Extension storage (`maps/{chatId}.json`), one file per chat
- **Bundle size**: ~500KB (Cytoscape lazy-loaded)
- **Token cost**: ~100-200 tokens per generation (current room + neighbors)
- **Permissions**: `interceptor` (required), `ui_panels` (required), `generation` (optional)

## Troubleshooting Storage

Maps are stored in: `<lumiverse-data>/extensions/room_mapper/storage/maps/`

To reset a corrupted map:
1. Delete `maps/{chatId}.json`
2. Reload chat
3. Extension creates empty map automatically

## Version

1.0.0 - Initial release

## Support

For issues or feature requests, please contact the extension author or open an issue in the repository.

---

Built for Lumiverse with ❤️
