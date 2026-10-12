// Room Mapper Frontend - Entry Point
import type { SpindleFrontendContext } from 'lumiverse-spindle-types';
import { DrawerTab } from './drawer-tab';
import { FloatWidget } from './float-widget';

// The host loads this bundle and calls the named `setup` export.
export function setup(ctx: SpindleFrontendContext) {
  let currentChatId: string | null = null;

  const notify = (level: 'success' | 'warning' | 'error' | 'info', message: string): void => {
    try {
      ctx.sendToBackend({ type: 'toast', level, message });
    } catch (error) {
      // Backend may be unavailable; console is the guaranteed channel.
      console.warn(`[room_mapper] ${level}: ${message}`, error);
    }
  };

  const widget = new FloatWidget(ctx, notify);
  const drawer = new DrawerTab(ctx, widget, notify);

  const unsubChat = ctx.events.on('CHAT_SWITCHED', (payload: any) => {
    if (payload?.chatId) {
      currentChatId = payload.chatId;
      ctx.sendToBackend({ type: 'load_map', chatId: payload.chatId });
    } else {
      currentChatId = null;
      drawer.clear();
      widget.clear();
    }
  });

  const unsubBackend = ctx.onBackendMessage((msg: any) => {
    switch (msg?.type) {
      case 'map_loaded':
      case 'map_updated':
        drawer.render(msg.chatId, msg.map);
        void widget.render(msg.chatId, msg.map).catch((error) => {
          console.warn('[room_mapper] Widget render failed:', error);
        });
        break;

      case 'map_export':
        downloadJSON(msg.json, `room-map-${msg.chatId}.json`);
        break;

      case 'scan_result':
        if (msg.error) notify('error', `Scan failed: ${msg.error}`);
        else drawer.showScanResults(msg.chatId, msg.suggestions);
        break;

      case 'maps_list':
        drawer.showMapsList(msg.maps);
        break;

      case 'map_deleted':
        if (msg.chatId === currentChatId) {
          ctx.sendToBackend({ type: 'load_map', chatId: msg.chatId });
        }
        break;

      case 'error':
        notify('error', msg.message);
        break;
    }
  });

  // CHAT_SWITCHED does not fire on page load/refresh — resolve the active chat
  // synchronously from app state so the map loads immediately.
  try {
    const active = ctx.getActiveChat?.();
    if (active?.chatId) {
      currentChatId = active.chatId;
      ctx.sendToBackend({ type: 'load_map', chatId: active.chatId });
    }
  } catch (error) {
    console.warn('[room_mapper] getActiveChat failed:', error);
  }

  return () => {
    unsubChat?.();
    unsubBackend?.();
    drawer.destroy();
    widget.destroy();
  };
}

function downloadJSON(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
