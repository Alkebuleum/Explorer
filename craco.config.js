const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");

// CRA5/webpack5 dropped automatic Node core-module polyfills. `solc`'s browser
// entrypoint (`solc/wrapper`) needs `assert`, and its dependency chain
// (`memorystream`/`follow-redirects`, used only by the Node-only
// `loadRemoteVersion` helper we never call — soljson is fetched via browser
// fetch() instead) also touches `Buffer`, `stream`, `util`, etc. at import
// time. NodePolyfillPlugin covers the full set instead of hand-picking
// individual fallbacks one build error at a time.
module.exports = {
  webpack: {
    plugins: {
      add: [new NodePolyfillPlugin()],
    },
  },
};
