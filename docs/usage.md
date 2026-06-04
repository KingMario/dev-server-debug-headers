# Usage Guide

<p>
  <a href="https://github.com/KingMario/dev-server-debug-headers" aria-label="GitHub repository">
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path fill="currentColor" d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.63 5.47 7.7.4.07.55-.18.55-.39 0-.19-.01-.83-.01-1.51-2.01.38-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.16-.28-.15-.68-.52-.01-.53.63-.01 1.08.59 1.23.83.72 1.23 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.2-3.64-.9-3.64-4.01 0-.89.31-1.61.82-2.18-.08-.2-.36-1.03.08-2.15 0 0 .67-.22 2.2.83A7.5 7.5 0 0 1 8 3.92c.68 0 1.36.09 2 .27 1.53-1.05 2.2-.83 2.2-.83.44 1.12.16 1.95.08 2.15.51.57.82 1.29.82 2.18 0 3.12-1.87 3.81-3.65 4.01.29.25.54.74.54 1.5 0 1.08-.01 1.95-.01 2.22 0 .21.15.47.55.39A8.09 8.09 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z"></path>
    </svg>
    GitHub
  </a>
  ·
  <a href="https://github.com/KingMario/dev-server-debug-headers/stargazers">Star</a>
  ·
  <a href="https://github.com/KingMario/dev-server-debug-headers/fork">Fork</a>
</p>

Dev Server Debug Headers is a small Chrome Manifest V3 extension for changing
request and response headers while debugging local or development servers. It
is useful when you need a lightweight ModHeader-style workflow, but want rules
to be scoped to the page that initiates requests.

## Typical Use Cases

- Add a debug identity header while testing an API from a local frontend.
- Switch a backend feature flag by setting a request header.
- Append or remove a header for one development app without affecting unrelated
  browsing.
- Adjust response headers such as CORS, CSP, cache, or iframe-related headers
  to validate a dev-server hypothesis.
- Target WebSocket handshake requests during realtime debugging.
- Share the same development header rules across machines with Chrome sync.

## Core Concepts

Each rule describes one header operation:

- `Header direction`: whether the rule modifies request headers or response
  headers.
- `URL contains`: optional text matched against the full request URL.
- `Header name`: the request header to modify.
- `Header value`: the value used by `set` and `append`.
- `Operation`: set/replace, append, or remove.
- `Resource type`: optional request type filter.
- `Initiator domains`: the page origins allowed to initiate matching requests.
- `Methods`: optional HTTP method filter.

Response rules also support `Only if response already has this header`. When
enabled, Chrome evaluates the rule after response headers are available and only
applies it if the response contains the same header name.

The important scoping field is **Initiator domains**. It maps to Chrome
Declarative Net Request `condition.initiatorDomains`, so it matches the page
that started the request, not the destination server.

Example:

- Page: `http://localhost:5173`
- Request: `https://api.example.com/v1/users`
- Initiator domain: `localhost`

A rule with initiator domain `localhost` can apply to that request even though
the request destination is `api.example.com`.

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository folder.
5. Open the extension popup from the Chrome toolbar.

## Creating a Rule

1. Fill in `URL contains` when you want to narrow the match to a path or query
   fragment, such as `/v1/` or `/graphql`.
2. Choose `Request` or `Response` as the header direction.
3. Enter a lower-case or mixed-case header name. The extension normalizes header
   names to lower case when importing or saving through the UI.
4. Choose an operation:
   - `Set or replace`: set the header value or replace an existing value.
   - `Append`: append a value to an existing header when Chrome allows it.
   - `Remove`: remove the header; the value field is ignored.
5. For response rules, optionally check `Only if response already has this
header`.
6. Choose a resource type only when you need one. Leave it as `All` for broad
   matching.
7. Add initiator domains. If the list is empty, the extension defaults to
   `localhost` and `127.0.0.1`. Use the current-tab button at the end of the
   `Initiator domains` label row to add the active tab's domain. The button is
   shown only when the active tab is a normal `http` or `https` page, and is
   hidden on browser-internal or extension pages.
8. Choose methods. If `All` is checked, no method filter is emitted.
9. Click save.

Rules appear in the right panel grouped first by request/response direction and
then by normalized initiator domain. Click a rule title to edit it. Use the
checkbox at the start of a row to enable or disable a rule. Use the red `x` to
delete a rule.

## Editing and Cloning Rules

The rules list is designed to make each row compact but still keyboard and
screen-reader friendly:

- Click a rule title to edit the existing rule.
- Hover a truncated rule title to see the full title in the browser tooltip.
- Use the checkbox at the start of the row to enable or disable the rule.
- Use the clone button next to the rule title to copy the rule into the editor.
- Use the red `x` to delete the rule.

Clone is useful when two rules share the same URL, header name, operation,
methods, resource type, or request/response direction, but need different
initiator domains. When cloning, the extension copies every field except
`Initiator domains`, clears that list, and focuses the initiator domain input.
Saving the cloned form creates a new rule instead of changing the original.

The editor locks the rules list while it is editing an existing rule or while
the user has unsaved changes. This avoids accidental toggles, deletes, clones,
or imports against stale state. Programmatic prefill actions, such as clicking a
group `+` button or cloning a rule, become the editor's starting state and do
not count as dirty until the user changes a field.

## Response Header Rules

Response rules are useful for local experiments where you need to validate how
the browser would behave if the server returned different headers.

Common examples:

- Add or adjust CORS headers such as `Access-Control-Allow-Origin`,
  `Access-Control-Allow-Headers`, `Access-Control-Allow-Methods`, and
  `Access-Control-Allow-Credentials`.
- Remove or relax `Content-Security-Policy` while debugging script, style,
  worker, or connection restrictions.
- Remove iframe restrictions such as `X-Frame-Options` or CSP
  `frame-ancestors` for local embedding tests.
- Change cache headers such as `Cache-Control`, `ETag`, `Expires`, and
  `Last-Modified`.
- Test cross-origin isolation headers such as `Cross-Origin-Opener-Policy`,
  `Cross-Origin-Embedder-Policy`, and `Cross-Origin-Resource-Policy`.

Limitations:

- Response header changes happen after the server has already received the
  request.
- CORS debugging can still involve preflight requests, credentials, and browser
  origin checks. Treat response header modification as a development aid, not a
  production CORS bypass.
- Some sensitive headers may have browser or API-specific restrictions.

## WebSocket Requests

Chrome Declarative Net Request can target WebSocket handshakes through the
`websocket` resource type. To modify headers for `ws://` or `wss://` requests:

1. Set `Resource type` to `WebSocket`.
2. Keep the relevant initiator domain, such as `localhost`.
3. Use `URL contains` only if you need to narrow the handshake URL.

The extension's URL filter accepts `http`, `https`, `ws`, and `wss` schemes.

## Import and Export

Use export to download `dev-server-debug-headers.json`. Use import to restore a
previously exported config.

Tips:

- Export before experimenting with many rule changes.
- Use export as a manual backup before switching storage modes.
- Imported rules are normalized, including header names and initiator domains.

## Chrome Sync

By default, the extension stores config in `chrome.storage.local`, which belongs
to the current Chrome profile on the current machine.

When **Chrome sync** is enabled, the active config is stored in
`chrome.storage.sync`. Chrome sync can share that config across browsers where
the user is signed in and has Chrome Sync enabled.

### Requirements

Cross-device sharing requires:

- A Chrome profile signed into a Google account.
- Chrome Sync enabled for that profile.
- The extension installed in the synced Chrome profiles.

If the user is not signed in, if Chrome Sync is disabled, or if sync is
temporarily offline, `chrome.storage.sync` can still behave like local profile
storage. The extension keeps the checkbox available and shows a note instead of
disabling it.

### Switching Behavior

The extension intentionally avoids overwriting synced data when possible:

- `local -> sync`, sync has existing config: load the synced config into the UI.
- `local -> sync`, sync has no config: upload the current local config to sync.
- `sync -> local`: save the current active config into local storage and keep
  the UI unchanged.

This means the second machine you connect to sync should normally adopt the
already synced rules instead of replacing them with an empty local config.

### Corner Cases

- **Sync quota exceeded**: Chrome sync has much smaller quota than local
  storage. Official Chrome docs describe sync quota as about 100 KB total and
  about 8 KB per item. This extension stores the config under one key, so very
  large rule sets can fail to save to sync.
- **Offline or delayed sync**: Chrome may store changes locally first and sync
  later. Another machine may not see changes immediately.
- **Conflicting edits on multiple machines**: The extension does not merge rule
  edits at field level. The later synced config can replace the earlier one.
- **Extension not installed elsewhere**: Chrome may sync extension storage, but
  rules only affect browsers where this extension is installed and enabled.
- **Switching back to local**: The current active synced config is copied into
  local storage. Old local config is not restored automatically.
- **Save failure**: If Chrome rejects a save, the extension reports the failure
  and rolls back the in-memory UI state for the attempted change.

## Practical Tips

- Keep initiator domains narrow. Prefer `localhost`, `127.0.0.1`, or a specific
  dev domain instead of broad domains.
- Use the current-tab button when you opened the exact app page that should
  initiate the matching requests. It is hidden on browser-internal pages such
  as `chrome://` URLs, extension pages, and other non-`http`/`https` pages.
- Use `URL contains` for API path scoping. For example, use `/v1/` to avoid
  touching every request from the same page.
- Leave `Methods` as `All` unless the backend behavior differs by method.
- Use `Resource type = WebSocket` only for WebSocket handshake debugging.
- Disable a rule instead of deleting it when you expect to reuse it.
- Clone a rule when the next rule differs mainly by initiator domain. This keeps
  header details consistent while preventing a copied initiator scope from being
  reused accidentally.
- Watch the extension badge. It shows the number of enabled rules matching the
  active tab host.
- Avoid storing secrets in synced header values. Chrome extension storage is
  not a secret manager.

## Troubleshooting

- **A rule does not apply**: Check the initiator domain first. It should match
  the page that sends the request, not the API server.
- **A WebSocket rule does not apply**: Set `Resource type` to `WebSocket` and
  confirm the initiator domain is correct.
- **The badge count is zero**: The active tab host does not match any enabled
  rule's initiator domains, or the global `Enabled` switch is off.
- **Sync does not appear on another machine**: Confirm Chrome sign-in, Chrome
  Sync, extension installation, and wait for sync propagation.
- **Sync save fails**: Reduce rule count or header value size, then try again.
