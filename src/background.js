const STORAGE_KEY = "modHeaderLiteConfig";
const MAX_DYNAMIC_RULES = 500;
const DEFAULT_INITIATOR_DOMAINS = ["localhost", "127.0.0.1"];

console.log("[Dev Server Debug Headers] service worker loaded");

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[Dev Server Debug Headers] onInstalled", details);
  chrome.action.setBadgeBackgroundColor({ color: "#176b87" });
  syncRules("onInstalled");
  updateBadgeForActiveTab("onInstalled");
});
chrome.runtime.onStartup.addListener(() => {
  console.log("[Dev Server Debug Headers] onStartup");
  syncRules("onStartup");
  updateBadgeForActiveTab("onStartup");
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    console.log(
      "[Dev Server Debug Headers] storage changed",
      changes[STORAGE_KEY],
    );
    syncRules("storage.onChanged");
    updateBadgeForActiveTab("storage.onChanged");
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  updateBadgeForTab(tabId, "tabs.onActivated");
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateBadgeForTab(tabId, "tabs.onUpdated");
  }
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    updateBadgeForActiveTab("windows.onFocusChanged");
  }
});

async function syncRules(reason) {
  console.log("[Dev Server Debug Headers] syncRules:start", { reason });

  try {
    const config = await getConfig();
    const existingDynamicRules =
      await chrome.declarativeNetRequest.getDynamicRules();
    const existingSessionRules =
      await chrome.declarativeNetRequest.getSessionRules();
    const addRules = buildRules(config);

    console.log("[Dev Server Debug Headers] syncRules:rules", {
      enabled: config.enabled,
      configuredEntries: config.entries.length,
      existingDynamicRules: existingDynamicRules.length,
      existingSessionRules: existingSessionRules.length,
      addRules: addRules.length,
      addRulesPreview: addRules.map(summarizeRule),
    });

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingDynamicRules.map((rule) => rule.id),
      addRules,
    });
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existingSessionRules.map((rule) => rule.id),
    });

    console.log("[Dev Server Debug Headers] syncRules:done", { reason });
    updateBadgeForActiveTab(`syncRules:${reason}`);
  } catch (error) {
    console.error("[Dev Server Debug Headers] syncRules:error", error);
  }
}

async function getConfig() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const config = {
    enabled: true,
    entries: [],
    ...result[STORAGE_KEY],
  };

  console.log("[Dev Server Debug Headers] getConfig", config);

  return config;
}

function buildRules(config) {
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
        requestHeaders: [buildHeaderOperation(entry)],
      },
      condition: buildCondition(entry),
    }));

  console.log("[Dev Server Debug Headers] buildRules:built", {
    usableEntries: usableEntries.length,
    rules: rules.map(summarizeRule),
  });

  return rules;
}

function buildHeaderOperation(entry) {
  const operation = {
    header: entry.headerName.trim(),
    operation: entry.operation,
  };

  if (entry.operation !== "remove") {
    operation.value = entry.headerValue;
  }

  return operation;
}

function isUsableEntry(entry, index) {
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

function buildCondition(entry) {
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
    ...(methods.length > 0 ? { requestMethods: methods } : {}),
    ...(resourceTypes.length > 0 ? { resourceTypes } : {}),
  };
}

function normalizeInitiatorDomains(initiatorDomains) {
  if (!Array.isArray(initiatorDomains)) {
    return DEFAULT_INITIATOR_DOMAINS;
  }

  return initiatorDomains
    .map(normalizeDomain)
    .filter(Boolean)
    .filter((domain, index, domains) => domains.indexOf(domain) === index);
}

function normalizeDomain(domain) {
  return String(domain)
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^wss?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .toLowerCase();
}

function buildRegexFilter(urlContains) {
  const escapedNeedle = urlContains ? escapeRegex(urlContains) : "";
  return `^(https?|wss?)://.*${escapedNeedle}`;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function updateBadgeForActiveTab(reason) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      console.log("[Dev Server Debug Headers] badge skipped:no active tab", {
        reason,
      });
      return;
    }

    await updateBadgeForTab(tab.id, reason, tab);
  } catch (error) {
    console.error("[Dev Server Debug Headers] badge:error active tab", {
      reason,
      error,
    });
  }
}

async function updateBadgeForTab(tabId, reason, knownTab) {
  try {
    const tab = knownTab || (await chrome.tabs.get(tabId));
    const config = await getConfig();
    const count = countEnabledRulesForTab(config, tab.url || "");

    await chrome.action.setBadgeText({
      tabId,
      text: count > 0 ? String(count) : "",
    });
    await chrome.action.setTitle({
      tabId,
      title:
        count > 0
          ? `Dev Server Debug Headers: ${count} enabled rule${count === 1 ? "" : "s"}`
          : "Dev Server Debug Headers",
    });

    console.log("[Dev Server Debug Headers] badge updated", {
      reason,
      tabId,
      tabUrl: tab.url,
      count,
    });
  } catch (error) {
    console.error("[Dev Server Debug Headers] badge:error tab", {
      reason,
      tabId,
      error,
    });
  }
}

function countEnabledRulesForTab(config, tabUrl) {
  const tabDomain = getTabDomain(tabUrl);
  if (!config.enabled || !Array.isArray(config.entries) || !tabDomain) {
    return 0;
  }

  return config.entries.filter((entry) =>
    isEnabledRuleForDomain(entry, tabDomain),
  ).length;
}

function getTabDomain(tabUrl) {
  try {
    const url = new URL(tabUrl);
    return ["http:", "https:"].includes(url.protocol)
      ? url.hostname.toLowerCase()
      : "";
  } catch {
    return "";
  }
}

function isEnabledRuleForDomain(entry, tabDomain) {
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

function domainMatches(tabDomain, ruleDomain) {
  return tabDomain === ruleDomain || tabDomain.endsWith(`.${ruleDomain}`);
}

function summarizeRule(rule) {
  return {
    id: rule.id,
    requestHeaders: rule.action.requestHeaders,
    regexFilter: rule.condition.regexFilter,
    initiatorDomains: rule.condition.initiatorDomains,
    requestMethods: rule.condition.requestMethods,
    resourceTypes: rule.condition.resourceTypes,
  };
}
