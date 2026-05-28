import {
  DEFAULT_INITIATOR_DOMAINS,
  MAX_DYNAMIC_RULES,
  buildCondition,
  buildHeaderOperation,
  buildRegexFilter,
  buildRules,
  countEnabledRulesForTab,
  createRuleTitle,
  domainMatches,
  escapeRegex,
  findRuleTitleElementById,
  getTabDomain,
  groupEntriesByInitiatorDomains,
  isEnabledRuleForDomain,
  normalizeDomain,
  normalizeHeaderTarget,
  normalizeImportedConfig,
  normalizeImportedEntry,
  normalizeInitiatorDomains,
  normalizeSettings,
  parseDomainList,
  shouldMatchExistingResponseHeader,
  summarizeRule,
  switchStorageArea,
} from "../src/core.js";
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

const baseEntry = {
  id: "rule-1",
  enabled: true,
  urlContains: "/api",
  headerName: "x-debug",
  headerValue: "on",
  operation: "set",
  methods: ["get"],
  resourceTypes: ["xmlhttprequest"],
  initiatorDomains: ["localhost"],
};

describe("settings and imported config normalization", () => {
  it("normalizes storage settings defensively", () => {
    assert.deepEqual(normalizeSettings({ storageArea: "sync" }), {
      storageArea: "sync",
    });
    assert.deepEqual(normalizeSettings({ storageArea: "local" }), {
      storageArea: "local",
    });
    assert.deepEqual(normalizeSettings({ storageArea: "cloud" }), {
      storageArea: "local",
    });
    assert.deepEqual(normalizeSettings(), { storageArea: "local" });
  });

  it("normalizes imported config and entries", () => {
    const config = normalizeImportedConfig(
      {
        enabled: false,
        entries: [
          {
            enabled: false,
            urlContains: " /v1/ ",
            headerName: " X-Debug-User ",
            headerValue: "alice",
            operation: "remove",
            methods: ["get", "", "post"],
            resourceTypes: ["xmlhttprequest", ""],
            initiatorDomains: ["HTTPS://LOCALHOST:3000/path"],
          },
        ],
      },
      () => "generated-id",
    );

    assert.deepEqual(config, {
      enabled: false,
      entries: [
        {
          id: "generated-id",
          enabled: false,
          urlContains: "/v1/",
          headerName: "x-debug-user",
          headerValue: "",
          headerTarget: "request",
          operation: "remove",
          responseHeaderConditionEnabled: false,
          methods: ["get", "post"],
          resourceTypes: ["xmlhttprequest"],
          initiatorDomains: ["localhost"],
        },
      ],
    });
  });

  it("falls back to set operation and rejects invalid config shapes", () => {
    assert.throws(
      () => normalizeImportedConfig({ entries: "not-an-array" }),
      /entries array/,
    );

    assert.equal(
      normalizeImportedEntry(
        {
          id: "kept-id",
          operation: "bad",
          headerValue: "value",
        },
        () => "unused",
      ).operation,
      "set",
    );
    assert.equal(
      normalizeImportedEntry({
        headerName: "x",
        headerTarget: "bad",
      }).headerTarget,
      "request",
    );
    assert.deepEqual(
      normalizeImportedEntry(
        {
          headerName: "x",
          headerTarget: "response",
          responseHeaderConditionEnabled: true,
        },
        () => "response-id",
      ),
      {
        id: "response-id",
        enabled: true,
        urlContains: "",
        headerName: "x",
        headerValue: "",
        headerTarget: "response",
        operation: "set",
        responseHeaderConditionEnabled: true,
        methods: [],
        resourceTypes: [],
        initiatorDomains: DEFAULT_INITIATOR_DOMAINS,
      },
    );

    assert.match(
      normalizeImportedEntry({ headerName: "x" }).id,
      /^[\da-f-]{36}$/i,
    );
    assert.equal(
      normalizeImportedEntry(undefined, () => "from-undefined").id,
      "from-undefined",
    );
    assert.match(
      normalizeImportedConfig({ entries: [{ headerName: "x" }] }).entries[0].id,
      /^[\da-f-]{36}$/i,
    );
    assert.equal(normalizeImportedConfig({ entries: [] }).enabled, true);
  });
});

describe("header target helpers", () => {
  it("normalizes request and response header targets", () => {
    assert.equal(normalizeHeaderTarget("request"), "request");
    assert.equal(normalizeHeaderTarget("response"), "response");
    assert.equal(normalizeHeaderTarget("bad"), "request");
    assert.equal(normalizeHeaderTarget(), "request");
  });

  it("matches existing response headers only for response rules", () => {
    assert.equal(
      shouldMatchExistingResponseHeader({
        ...baseEntry,
        headerTarget: "response",
        responseHeaderConditionEnabled: true,
      }),
      true,
    );
    assert.equal(
      shouldMatchExistingResponseHeader({
        ...baseEntry,
        headerTarget: "request",
        responseHeaderConditionEnabled: true,
      }),
      false,
    );
  });
});

describe("domain and grouping helpers", () => {
  it("normalizes domains and comma-separated domain lists", () => {
    assert.equal(
      normalizeDomain("WSS://API.Example.com:443/path"),
      "api.example.com",
    );
    assert.deepEqual(
      parseDomainList("https://Localhost:3000/a, 127.0.0.1, localhost"),
      ["localhost", "127.0.0.1"],
    );
  });

  it("normalizes initiator domains with defaults and de-duplication", () => {
    assert.deepEqual(normalizeInitiatorDomains(), DEFAULT_INITIATOR_DOMAINS);
    assert.deepEqual(
      normalizeInitiatorDomains(["HTTP://LOCALHOST:5173", "", "localhost"]),
      ["localhost"],
    );
  });

  it("groups rules by normalized initiator domain group", () => {
    const groups = groupEntriesByInitiatorDomains([
      { ...baseEntry, id: "one", initiatorDomains: ["https://dev.local:3000"] },
      { ...baseEntry, id: "two", initiatorDomains: undefined },
    ]);

    assert.equal(groups[0].key, "localhost, 127.0.0.1");
    assert.equal(groups[0].entries[0].id, "two");
    assert.equal(groups[1].key, "dev.local");
    assert.equal(groups[1].entries[0].id, "one");
  });
});

describe("rule title and DOM target helpers", () => {
  it("creates stable compact rule titles", () => {
    assert.equal(createRuleTitle(baseEntry), "SET x-debug");
  });

  it("finds save animation targets by id instead of title text", () => {
    const duplicateTitleElements = [
      { dataset: { ruleId: "older" }, textContent: "SET prefer-core" },
      { textContent: "SET prefer-core" },
      { dataset: { ruleId: "newer" }, textContent: "SET prefer-core" },
    ];

    assert.equal(
      findRuleTitleElementById(duplicateTitleElements, "newer"),
      duplicateTitleElements[2],
    );
    assert.equal(
      findRuleTitleElementById(duplicateTitleElements, "missing"),
      null,
    );
  });
});

describe("DNR rule building", () => {
  it("builds header operations and conditions", () => {
    assert.deepEqual(buildHeaderOperation(baseEntry), {
      header: "x-debug",
      operation: "set",
      value: "on",
    });
    assert.deepEqual(
      buildHeaderOperation({ ...baseEntry, operation: "remove" }),
      {
        header: "x-debug",
        operation: "remove",
      },
    );

    assert.deepEqual(buildCondition(baseEntry), {
      regexFilter: "^(https?|wss?)://.*/api",
      initiatorDomains: ["localhost"],
      requestMethods: ["get"],
      resourceTypes: ["xmlhttprequest"],
    });
    assert.deepEqual(
      buildCondition({
        ...baseEntry,
        headerTarget: "response",
        responseHeaderConditionEnabled: true,
      }),
      {
        regexFilter: "^(https?|wss?)://.*/api",
        initiatorDomains: ["localhost"],
        responseHeaders: [{ header: "x-debug" }],
        requestMethods: ["get"],
        resourceTypes: ["xmlhttprequest"],
      },
    );
  });

  it("builds request and response header modification rules", () => {
    const log = mock.method(console, "log", () => {});
    const [requestRule, responseRule] = buildRules({
      enabled: true,
      entries: [
        baseEntry,
        {
          ...baseEntry,
          id: "response-rule",
          headerTarget: "response",
          headerName: "access-control-allow-origin",
          headerValue: "*",
        },
      ],
    });

    assert.deepEqual(requestRule.action, {
      type: "modifyHeaders",
      requestHeaders: [{ header: "x-debug", operation: "set", value: "on" }],
    });
    assert.deepEqual(responseRule.action, {
      type: "modifyHeaders",
      responseHeaders: [
        {
          header: "access-control-allow-origin",
          operation: "set",
          value: "*",
        },
      ],
    });
    log.mock.restore();
  });

  it("escapes URL filters and supports empty optional filters", () => {
    assert.equal(escapeRegex("/v1?q=a+b"), "/v1\\?q=a\\+b");
    assert.equal(
      buildRegexFilter("/v1?q=a+b"),
      "^(https?|wss?)://.*/v1\\?q=a\\+b",
    );
    assert.deepEqual(
      buildCondition({
        ...baseEntry,
        urlContains: "",
        methods: [],
        resourceTypes: [],
        initiatorDomains: [],
      }),
      {
        regexFilter: "^(https?|wss?)://.*",
      },
    );
  });

  it("filters unusable rules and truncates to dynamic rule limit", () => {
    const disabledLog = mock.method(console, "log", () => {});
    const warnLog = mock.method(console, "warn", () => {});
    const entries = Array.from(
      { length: MAX_DYNAMIC_RULES + 1 },
      (_, index) => ({
        ...baseEntry,
        id: `rule-${index}`,
        headerName: `x-${index}`,
      }),
    );

    assert.equal(buildRules({ enabled: false, entries }).length, 0);
    assert.equal(buildRules({ enabled: true, entries: null }).length, 0);

    const rules = buildRules({
      enabled: true,
      entries: [
        undefined,
        { ...baseEntry, enabled: false },
        { ...baseEntry, operation: "bad" },
        { ...baseEntry, headerName: " " },
        ...entries,
      ],
    });

    assert.equal(rules.length, MAX_DYNAMIC_RULES);
    assert.equal(rules[0].id, 1);
    assert.equal(rules[0].action.requestHeaders[0].header, "x-0");
    assert.ok(disabledLog.mock.callCount() > 0);
    assert.ok(warnLog.mock.callCount() > 0);
    disabledLog.mock.restore();
    warnLog.mock.restore();
  });

  it("summarizes generated rules for diagnostics", () => {
    const log = mock.method(console, "log", () => {});
    const [rule] = buildRules({ enabled: true, entries: [baseEntry] });
    assert.deepEqual(summarizeRule(rule), {
      id: 1,
      requestHeaders: [{ header: "x-debug", operation: "set", value: "on" }],
      responseHeaders: undefined,
      regexFilter: "^(https?|wss?)://.*/api",
      initiatorDomains: ["localhost"],
      conditionResponseHeaders: undefined,
      requestMethods: ["get"],
      resourceTypes: ["xmlhttprequest"],
    });
    log.mock.restore();
  });
});

describe("badge domain matching", () => {
  it("extracts HTTP(S) tab domains only", () => {
    assert.equal(
      getTabDomain("https://Sub.Example.com/path"),
      "sub.example.com",
    );
    assert.equal(getTabDomain("chrome://extensions"), "");
    assert.equal(getTabDomain("not a url"), "");
  });

  it("counts enabled rules for exact and subdomain initiator matches", () => {
    const entries = [
      { ...baseEntry, id: "exact", initiatorDomains: ["example.com"] },
      { ...baseEntry, id: "sub", initiatorDomains: ["dev.example.com"] },
      { ...baseEntry, id: "disabled", enabled: false },
      { ...baseEntry, id: "missing-header", headerName: "" },
      { ...baseEntry, id: "bad-operation", operation: "bad" },
    ];

    assert.equal(
      countEnabledRulesForTab(
        { enabled: true, entries },
        "https://api.dev.example.com",
      ),
      2,
    );
    assert.equal(
      countEnabledRulesForTab({ enabled: false, entries }, "https://x"),
      0,
    );
    assert.equal(
      countEnabledRulesForTab({ enabled: true, entries: null }, "https://x"),
      0,
    );
    assert.equal(
      countEnabledRulesForTab({ enabled: true, entries }, "file:///tmp/a"),
      0,
    );
  });

  it("checks individual rule/domain matches", () => {
    assert.equal(domainMatches("api.example.com", "example.com"), true);
    assert.equal(domainMatches("badexample.com", "example.com"), false);
    assert.equal(isEnabledRuleForDomain(baseEntry, "localhost"), true);
    assert.equal(isEnabledRuleForDomain(undefined, "localhost"), false);
    assert.equal(
      isEnabledRuleForDomain({ ...baseEntry, operation: "bad" }, "localhost"),
      false,
    );
  });
});

describe("sync storage switching", () => {
  it("uploads local config if sync is empty", async () => {
    const config = { enabled: true, entries: [{ id: "1" }] };
    const saved = [];
    const { settings, config: nextConfig } = await switchStorageArea(
      "sync",
      config,
      {
        loadConfig: async () => ({ exists: false, config: {} }),
        saveConfig: async (area, cfg) => saved.push([area, cfg]),
        saveSettings: async () => {},
      },
    );

    assert.equal(settings.storageArea, "sync");
    assert.deepEqual(nextConfig, config);
    assert.deepEqual(saved, [["sync", config]]);
  });

  it("loads existing sync config if available", async () => {
    const syncConfig = { enabled: true, entries: [{ id: "sync-1" }] };
    const localConfig = { enabled: true, entries: [{ id: "local-1" }] };
    const saved = [];
    const { settings, config: nextConfig } = await switchStorageArea(
      "sync",
      localConfig,
      {
        loadConfig: async () => ({ exists: true, config: syncConfig }),
        saveConfig: async (area, cfg) => saved.push([area, cfg]),
        saveSettings: async () => {},
      },
    );

    assert.equal(settings.storageArea, "sync");
    assert.deepEqual(nextConfig, syncConfig);
    assert.deepEqual(saved, []);
  });

  it("keeps the current active config when switching back to local", async () => {
    const syncConfig = { enabled: true, entries: [{ id: "sync-active" }] };
    const saved = [];
    const { settings, config: nextConfig } = await switchStorageArea(
      "local",
      syncConfig,
      {
        loadConfig: async () => {
          throw new Error("local config should not be read");
        },
        saveConfig: async (area, cfg) => saved.push([area, cfg]),
        saveSettings: async () => {},
      },
    );

    assert.equal(settings.storageArea, "local");
    assert.deepEqual(nextConfig, syncConfig);
    assert.deepEqual(saved, [["local", syncConfig]]);
  });

  it("persists settings after target config handling", async () => {
    const calls = [];
    await switchStorageArea(
      "sync",
      { enabled: true, entries: [] },
      {
        loadConfig: async () => ({ exists: false, config: {} }),
        saveConfig: async (area) => calls.push(["config", area]),
        saveSettings: async (settings) => {
          calls.push(["settings", settings.storageArea]);
        },
      },
    );

    assert.deepEqual(calls, [
      ["config", "sync"],
      ["settings", "sync"],
    ]);
  });
});
