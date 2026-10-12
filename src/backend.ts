// Room Mapper Backend - Entry Point
//
// The Spindle host loads this module with `await import(entryPath)` for side
// effects only; it never invokes a default export. All setup therefore runs at
// module top level against the `spindle` global.
import { MapStorage } from './storage';
import { KeywordScanner } from './scanner';
import { RoomInterceptor } from './interceptor';
import { SidecarScanner } from './sidecar';
import { MessageHandler } from './handlers';

declare const spindle: import('lumiverse-spindle-types').SpindleAPI;

const storage = new MapStorage(spindle);
new KeywordScanner(spindle, storage);
new RoomInterceptor(spindle, storage);
const sidecarScanner = new SidecarScanner(spindle);
new MessageHandler(spindle, storage, sidecarScanner);

spindle.log.info('Room Mapper loaded');
