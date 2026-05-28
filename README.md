# Dev Server Debug Headers

A small Chrome Manifest V3 extension for adding, replacing, appending, or
removing request headers while debugging dev servers. Rules can restrict the
request initiator domain and default to `localhost` and `127.0.0.1`.

## Install for local development

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the cloned repository folder.

## Rule behavior

- Host access is currently `<all_urls>`, plus explicit `ws://*/*` and
  `wss://*/*` host permissions for WebSocket handshakes.
- Each rule can set `initiatorDomains`; the default is `localhost` and
  `127.0.0.1`.
- The extension badge counts enabled rules whose initiator domains match the
  current tab.
- `URL contains` is optional and is matched inside the full request URL.
- `Operation` maps to Chrome `declarativeNetRequest.modifyHeaders`.
- `Methods` and `Resource type` are optional filters.
  Use `WebSocket` to target `ws://` and `wss://` handshake requests.

The extension uses Declarative Net Request dynamic rules and stores all user
configuration in `chrome.storage.local`.

## License

MIT License. Copyright (c) 2026-2027 Mario Studio.
