/// <reference path="../types.d.ts" />

// Collections are created via the onBeforeServe hook in pb_hooks/main.pb.js
// (PocketBase v0.22 requires $app for collection management, which is only
//  available in hook context, not in the raw dbx.Builder migration context).
migrate(() => {}, () => {})
