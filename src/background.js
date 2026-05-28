import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  STORAGE_KEY,
  buildRules,
  countEnabledRulesForTab,
  normalizeSettings,
  summarizeRule,
} from "./core.js";

/**
 * @typedef {import("./core.js").ExtensionConfig} ExtensionConfig
 */

/**
 * @typedef {import("./core.js").StorageSettings} StorageSettings
 */

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
  if (
    ["local", "sync"].includes(areaName) &&
    (changes[STORAGE_KEY] || changes[SETTINGS_KEY])
  ) {
    console.log("[Dev Server Debug Headers] storage changed", changes);
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

/**
 * @param {string} reason
 * @returns {Promise<void>}
 */
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

/**
 * @returns {Promise<ExtensionConfig>}
 */
async function getConfig() {
  const settings = await getSettings();
  const result = await chrome.storage[settings.storageArea].get(STORAGE_KEY);
  const config = {
    enabled: true,
    entries: [],
    ...result[STORAGE_KEY],
  };

  console.log("[Dev Server Debug Headers] getConfig", {
    storageArea: settings.storageArea,
    config,
  });

  return config;
}

/**
 * @returns {Promise<StorageSettings>}
 */
async function getSettings() {
  const syncResult = await chrome.storage.sync.get(SETTINGS_KEY);
  const localResult = await chrome.storage.local.get(SETTINGS_KEY);
  const settings =
    syncResult[SETTINGS_KEY] || localResult[SETTINGS_KEY] || DEFAULT_SETTINGS;

  return normalizeSettings(settings);
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
