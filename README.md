# Dev Server Debug Headers

A small Chrome Manifest V3 extension for adding, replacing, appending, or
removing request and response headers while debugging dev servers. Rules can
restrict the request initiator domain and default to `localhost` and
`127.0.0.1`.

Documentation site: <https://mario.studio/dev-server-debug-headers>

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
- Rules can target request headers or response headers.
- `Operation` maps to Chrome `declarativeNetRequest.modifyHeaders`.
- Response rules can optionally match only when the response already contains
  the same header name.
- `Methods` and `Resource type` are optional filters.
  Use `WebSocket` to target `ws://` and `wss://` handshake requests.
- Click a rule title to edit it, or use the clone button to copy a rule into
  the editor while clearing its initiator domains.
- While the editor is editing or has unsaved user changes, the rules list is
  disabled to avoid accidental edits against stale UI state.
- Enable **Chrome sync** in the popup to store the config in
  `chrome.storage.sync`. Cross-device sharing requires Chrome sign-in and sync;
  otherwise Chrome keeps the data in the current profile.

The extension uses Declarative Net Request dynamic rules and stores all user
configuration in `chrome.storage.local` by default. When **Chrome sync** is
enabled, the active configuration is stored in `chrome.storage.sync` instead.

See [docs/usage.md](docs/usage.md) for usage scenarios, rule tips, Chrome sync
behavior, and corner cases.

## Development

Install development dependencies:

```bash
npm install
```

Useful checks:

```bash
npm run lint
npm run check
npm test
npm run coverage
```

Before committing, the Husky pre-commit hook runs `npm run precommit`, which
formats staged files with lint-staged, runs full ESLint, and runs unit tests.

## License

MIT License. Copyright (c) 2026-2027 Mario Studio.
