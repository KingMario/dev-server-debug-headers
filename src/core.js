export const STORAGE_KEY = "modHeaderLiteConfig";
export const SETTINGS_KEY = "modHeaderLiteSettings";
export const MAX_DYNAMIC_RULES = 500;
export const DEFAULT_CONFIG = {
  enabled: true,
  entries: [],
};
export const DEFAULT_SETTINGS = {
  storageArea: "local",
};
export const DEFAULT_INITIATOR_DOMAINS = ["localhost", "127.0.0.1"];
export const HEADER_TARGETS = ["request", "response"];

/**
 * @typedef {Object} RuleEntry
 * @property {string} id
 * @property {boolean} enabled
 * @property {string} title
 * @property {string} urlContains
 * @property {string} headerName
 * @property {string} headerValue
 * @property {"request" | "response"} headerTarget
 * @property {"set" | "append" | "remove"} operation
 * @property {boolean} responseHeaderConditionEnabled
 * @property {string[]} methods
 * @property {string[]} resourceTypes
 * @property {string[]} initiatorDomains
 */

/**
 * @typedef {Object} ExtensionConfig
 * @property {boolean} enabled
 * @property {RuleEntry[]} entries
 */

/**
 * @typedef {Object} StorageSettings
 * @property {"local" | "sync"} storageArea
 */

/**
 * @param {Partial<StorageSettings> | undefined} settings
 * @returns {StorageSettings}
 */
export function normalizeSettings(settings) {
  return {
    storageArea:
      settings?.storageArea === "sync" ? "sync" : DEFAULT_SETTINGS.storageArea,
  };
}

/**
 * @param {unknown} importedConfig
 * @param {() => string} [createId]
 * @returns {ExtensionConfig}
 */
export function normalizeImportedConfig(
  importedConfig,
  createId = () => crypto.randomUUID(),
) {
  if (!importedConfig || !Array.isArray(importedConfig.entries)) {
    throw new Error("Imported config must contain an entries array.");
  }

  return {
    enabled: importedConfig.enabled !== false,
    entries: importedConfig.entries.map((entry) =>
      normalizeImportedEntry(entry, createId),
    ),
  };
}

/**
 * @param {Partial<RuleEntry> | undefined} entry
 * @param {() => string} [createId]
 * @returns {RuleEntry}
 */
export function normalizeImportedEntry(
  entry,
  createId = () => crypto.randomUUID(),
) {
  const operation = ["set", "append", "remove"].includes(entry?.operation)
    ? entry.operation
    : "set";

  return {
    id: entry?.id || createId(),
    enabled: entry?.enabled !== false,
    title: String(entry?.title || "").trim(),
    urlContains: String(entry?.urlContains || "").trim(),
    headerName: String(entry?.headerName || "")
      .trim()
      .toLowerCase(),
    headerValue: operation === "remove" ? "" : String(entry?.headerValue || ""),
    headerTarget: normalizeHeaderTarget(entry?.headerTarget),
    operation,
    responseHeaderConditionEnabled:
      normalizeHeaderTarget(entry?.headerTarget) === "response" &&
      entry?.responseHeaderConditionEnabled === true,
    methods: Array.isArray(entry?.methods) ? entry.methods.filter(Boolean) : [],
    resourceTypes: Array.isArray(entry?.resourceTypes)
      ? entry.resourceTypes.filter(Boolean)
      : [],
    initiatorDomains: normalizeInitiatorDomains(entry?.initiatorDomains),
  };
}

/**
 * @param {RuleEntry[]} entries
 * @returns {{ key: string, domains: string[], entries: RuleEntry[] }[]}
 */
export function groupEntriesByInitiatorDomains(entries) {
  const groupsByKey = new Map();
  const defaultKey = DEFAULT_INITIATOR_DOMAINS.join(", ");
  groupsByKey.set(defaultKey, {
    key: defaultKey,
    domains: DEFAULT_INITIATOR_DOMAINS,
    entries: [],
  });

  for (const entry of entries) {
    const domains = normalizeInitiatorDomains(entry.initiatorDomains);
    const key = domains.join(", ");

    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        domains,
        entries: [],
      });
    }

    groupsByKey.get(key).entries.push(entry);
  }

  return Array.from(groupsByKey.values());
}

/**
 * @param {Pick<RuleEntry, "title" | "operation" | "headerName">} entry
 * @returns {string}
 */
export function createRuleTitle(entry) {
  if (entry.title?.trim()) {
    return entry.title.trim();
  }

  return `${entry.operation.toUpperCase()} ${entry.headerName}`;
}

export function normalizeHeaderTarget(headerTarget) {
  return HEADER_TARGETS.includes(headerTarget) ? headerTarget : "request";
}

/**
 * @param {string} value
 * @returns {string[]}
 */
export function parseDomainList(value) {
  return value
    .split(",")
    .map(normalizeDomain)
    .filter(Boolean)
    .filter((domain, index, domains) => domains.indexOf(domain) === index);
}

export function normalizeInitiatorDomains(initiatorDomains) {
  if (!Array.isArray(initiatorDomains)) {
    return DEFAULT_INITIATOR_DOMAINS;
  }

  return initiatorDomains
    .map(normalizeDomain)
    .filter(Boolean)
    .filter((domain, index, domains) => domains.indexOf(domain) === index);
}

export function normalizeDomain(domain) {
  return String(domain)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

/**
 * @param {ExtensionConfig} config
 * @returns {Object[]}
 */
export function buildRules(config) {
  if (!config.enabled || !Array.isArray(config.entries)) {
    console.log("[Dev Server Debug Headers] buildRules:disabled-or-invalid", {
      enabled: config.enabled,
      entriesIsArray: Array.isArray(config.entries),
    });
    return [];
  }

  const usableEntries = config.entries.filter((entry, index) =>
    isUsableEntry(entry, index),
  );

  if (config.entries.length > MAX_DYNAMIC_RULES) {
    console.warn("[Dev Server Debug Headers] buildRules:truncated", {
      configuredEntries: config.entries.length,
      maxDynamicRules: MAX_DYNAMIC_RULES,
    });
  }

  const rules = usableEntries
    .slice(0, MAX_DYNAMIC_RULES)
    .map((entry, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        [`${normalizeHeaderTarget(entry.headerTarget)}Headers`]: [
          buildHeaderOperation(entry),
        ],
      },
      condition: buildCondition(entry),
    }));

  console.log("[Dev Server Debug Headers] buildRules:built", {
    usableEntries: usableEntries.length,
    rules: rules.map(summarizeRule),
  });

  return rules;
}

/**
 * @param {RuleEntry} entry
 * @returns {{ header: string, operation: string, value?: string }}
 */
export function buildHeaderOperation(entry) {
  const operation = {
    header: entry.headerName.trim(),
    operation: entry.operation,
  };

  if (entry.operation !== "remove") {
    operation.value = entry.headerValue;
  }

  return operation;
}

/**
 * @param {RuleEntry | undefined} entry
 * @param {number} index
 * @returns {entry is RuleEntry}
 */
export function isUsableEntry(entry, index) {
  if (!entry || entry.enabled === false) {
    console.log("[Dev Server Debug Headers] entry skipped:disabled", {
      index,
      entry,
    });
    return false;
  }

  const operation = entry.operation || "set";
  if (!["set", "append", "remove"].includes(operation)) {
    console.warn("[Dev Server Debug Headers] entry skipped:invalid operation", {
      index,
      operation,
      entry,
    });
    return false;
  }

  if (!entry.headerName?.trim()) {
    console.warn(
      "[Dev Server Debug Headers] entry skipped:missing headerName",
      {
        index,
        entry,
      },
    );
    return false;
  }

  return true;
}

/**
 * @param {RuleEntry} entry
 * @returns {Object}
 */
export function buildCondition(entry) {
  const urlContains = entry.urlContains?.trim();
  const initiatorDomains = normalizeInitiatorDomains(entry.initiatorDomains);
  const methods = Array.isArray(entry.methods)
    ? entry.methods.filter(Boolean)
    : [];
  const resourceTypes = Array.isArray(entry.resourceTypes)
    ? entry.resourceTypes.filter(Boolean)
    : [];

  return {
    regexFilter: buildRegexFilter(urlContains),
    ...(initiatorDomains.length > 0 ? { initiatorDomains } : {}),
    ...(shouldMatchExistingResponseHeader(entry)
      ? { responseHeaders: [{ header: entry.headerName.trim() }] }
      : {}),
    ...(methods.length > 0 ? { requestMethods: methods } : {}),
    ...(resourceTypes.length > 0 ? { resourceTypes } : {}),
  };
}

export function shouldMatchExistingResponseHeader(entry) {
  return (
    normalizeHeaderTarget(entry.headerTarget) === "response" &&
    entry.responseHeaderConditionEnabled === true &&
    Boolean(entry.headerName?.trim())
  );
}

export function buildRegexFilter(urlContains) {
  const escapedNeedle = urlContains ? escapeRegex(urlContains) : "";
  return `^(https?|wss?)://.*${escapedNeedle}`;
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function countEnabledRulesForTab(config, tabUrl) {
  const tabDomain = getTabDomain(tabUrl);
  if (!config.enabled || !Array.isArray(config.entries) || !tabDomain) {
    return 0;
  }

  return config.entries.filter((entry) =>
    isEnabledRuleForDomain(entry, tabDomain),
  ).length;
}

export function getTabDomain(tabUrl) {
  try {
    const url = new URL(tabUrl);
    return ["http:", "https:"].includes(url.protocol)
      ? url.hostname.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

export function isEnabledRuleForDomain(entry, tabDomain) {
  if (!entry || entry.enabled === false || !entry.headerName?.trim()) {
    return false;
  }

  const operation = entry.operation || "set";
  if (!["set", "append", "remove"].includes(operation)) {
    return false;
  }

  return normalizeInitiatorDomains(entry.initiatorDomains).some((domain) =>
    domainMatches(tabDomain, domain),
  );
}

export function domainMatches(tabDomain, ruleDomain) {
  return tabDomain === ruleDomain || tabDomain.endsWith(`.${ruleDomain}`);
}

/**
 * @param {"local" | "sync"} targetStorageArea
 * @param {ExtensionConfig} currentConfig
 * @param {{ loadConfig: (storageArea: "local" | "sync") => Promise<{ exists: boolean, config: ExtensionConfig }>, saveConfig: (storageArea: "local" | "sync", config: ExtensionConfig) => Promise<void>, saveSettings: (settings: StorageSettings) => Promise<void> }} actions
 * @returns {Promise<{ settings: StorageSettings, config: ExtensionConfig }>}
 */
export async function switchStorageArea(
  targetStorageArea,
  currentConfig,
  actions,
) {
  let nextConfig = currentConfig;
  if (targetStorageArea === "sync") {
    const target = await actions.loadConfig("sync");

    if (target.exists) {
      nextConfig = target.config;
    } else {
      await actions.saveConfig("sync", currentConfig);
    }
  } else {
    await actions.saveConfig("local", currentConfig);
  }

  const settings = { storageArea: targetStorageArea };
  await actions.saveSettings(settings);
  return { settings, config: nextConfig };
}

/**
 * @param {{ dataset?: { ruleId?: string } }[]} elements
 * @param {string} ruleId
 * @returns {{ dataset?: { ruleId?: string } } | null}
 */
export function findRuleTitleElementById(elements, ruleId) {
  return elements.find((element) => element.dataset?.ruleId === ruleId) || null;
}

export function summarizeRule(rule) {
  return {
    id: rule.id,
    requestHeaders: rule.action.requestHeaders,
    responseHeaders: rule.action.responseHeaders,
    regexFilter: rule.condition.regexFilter,
    initiatorDomains: rule.condition.initiatorDomains,
    conditionResponseHeaders: rule.condition.responseHeaders,
    requestMethods: rule.condition.requestMethods,
    resourceTypes: rule.condition.resourceTypes,
  };
}
