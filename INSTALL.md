# Room Mapper Extension - Installation & Testing Guide

## Installation

1. **Copy extension to Lumiverse**:
   - The extension is ready at: `I:\AIl\Lumiverse Desktop\Lumiverse addons\room-mapper`
   
2. **Install in Lumiverse**:
   - Open Lumiverse
   - Go to Settings → Extensions
   - Click "Install Extension"
   - Navigate to the `room-mapper` folder and select it
   - OR: Use the GitHub URL if you host this in a repository

3. **Grant Permissions**:
   - **interceptor** ✓ Required - injects room context into prompts
   - **ui_panels** ✓ Required - shows float widget minimap
   - **generation** ⚠️ Optional - enables LLM-assisted room discovery

## Quick Test

After installation:

1. **Open a chat** in Lumiverse
2. **Open the Room Mapper drawer tab** (sidebar, look for map icon)
3. **Add your first room**:
   - Click "+ Add Room"
   - Name: `Kitchen`
   - Description: `A modern kitchen with stainless steel appliances`
   - Aliases: `cook room, dining area`
   - Click Save

4. **Add a second room**:
   - Click "+ Add Room"  
   - Name: `Living Room`
   - Description: `Cozy living space with a fireplace`
   - Click Save

5. **Set Kitchen as current**:
   - Click "Set Current" on the Kitchen room card
   - The float widget should appear showing your two rooms

6. **Test context injection**:
   - Start a new generation in the chat
   - Check Prompt Breakdown (if available) - you should see "Room Context" entry
   - The LLM will receive: `[Current Location: Kitchen]\nA modern kitchen...`

7. **Test auto-switching**:
   - Send a message that mentions "Living Room"
   - Wait for assistant reply that includes "living room" in the text
   - The extension should auto-switch to Living Room
   - Float widget will highlight Living Room node

## Verification Checklist

- [ ] Extension installs without errors
- [ ] Room Mapper tab appears in drawer
- [ ] Can add/edit/delete rooms
- [ ] Float widget displays room graph
- [ ] Current room is highlighted in widget
- [ ] Can drag nodes to rearrange (positions persist)
- [ ] Clicking node in widget sets it as current
- [ ] Context injection adds room info to prompts
- [ ] Keyword auto-tracking switches rooms
- [ ] Export/Import JSON works
- [ ] Settings changes persist

## Built Files

- `dist/backend.js` - 15.64 KB - Backend worker (Bun runtime)
- `dist/frontend.js` - 0.47 MB - Frontend UI (includes Cytoscape bundle)

## Next Steps

1. Test with actual roleplay chat
2. Add emoji-prefixed location formats (📍Kitchen - Cooking Area)
3. Test keyword scanning with various room name formats
4. Test "Scan Chat" feature (requires generation permission)
5. Export/import maps between chats
6. Fine-tune injection template for your use case

## Known Limitations

- Cytoscape bundle is ~470KB (lazy-loaded on first widget open)
- One auto-switch per 10 seconds cooldown
- "Scan Chat" requires recent message history in chat
- Concurrent edits in multiple browser tabs: last write wins

## Support

If issues occur:
1. Check browser console for errors
2. Check Lumiverse extension logs
3. Verify permissions are granted
4. Try deleting corrupt map: `<data>/extensions/room_mapper/storage/maps/{chatId}.json`

---

Extension ready for use! 🗺️
