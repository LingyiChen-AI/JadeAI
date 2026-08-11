// Preloaded via `node -r` into the Next server child process.
//
// Next sets `process.title = 'next-server (vX.Y.Z)'` (start-server.js). On macOS
// libuv implements that assignment by calling LaunchServices — and when the
// running executable lives inside an .app bundle, that call REGISTERS the process
// as a foreground application. The packaged app runs this child with Electron's
// own binary (ELECTRON_RUN_AS_NODE), which is inside JadeAI.app, so the child
// earned its own dock icon: a generic "exec" tile beside the real one.
//
// Verified directly against the packaged binary: a script that only sleeps gets
// no LaunchServices entry; adding a single `process.title = ...` produces one
// with `bundle path=/Applications/JadeAI.app`. ELECTRON_RUN_AS_NODE does not
// prevent it — it suppresses Chromium startup, not libuv's title call.
//
// So shadow the property. Reads still return whatever was last assigned, which
// is all any caller can observe from JS; only the LaunchServices side effect is
// dropped. Renaming the process is cosmetic here — nothing looks it up.
let shadowTitle = process.title;

Object.defineProperty(process, 'title', {
  configurable: true,
  enumerable: true,
  get() {
    return shadowTitle;
  },
  set(value) {
    shadowTitle = String(value);
  },
});
