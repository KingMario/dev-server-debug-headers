import {
  DEFAULT_CONFIG,
  DEFAULT_INITIATOR_DOMAINS,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  STORAGE_KEY,
  createRuleTitle,
  findRuleTitleElementById,
  groupEntriesByInitiatorDomains,
  normalizeHeaderTarget,
  normalizeImportedConfig,
  normalizeInitiatorDomains,
  normalizeSettings,
  parseDomainList,
  switchStorageArea,
} from "./core.js";

/**
 * @typedef {import("./core.js").RuleEntry} RuleEntry
 */

/**
 * @typedef {import("./core.js").ExtensionConfig} ExtensionConfig
 */

/**
 * @typedef {import("./core.js").StorageSettings} StorageSettings
 */

const elements = {
  enabled: document.querySelector("#enabled"),
  syncEnabled: document.querySelector("#sync-enabled"),
  form: document.querySelector("#rule-form"),
  editingId: document.querySelector("#editing-id"),
  headerTargetInputs: document.querySelectorAll('input[name="headerTarget"]'),
  responseHeaderCondition: document.querySelector("#response-header-condition"),
  responseConditionField: document.querySelector(".response-condition"),
  responseNote: document.querySelector("#response-note"),
  urlContains: document.querySelector("#url-contains"),
  headerName: document.querySelector("#header-name"),
  headerValue: document.querySelector("#header-value"),
  operation: document.querySelector("#operation"),
  resourceType: document.querySelector("#resource-type"),
  initiatorDomainField: document.querySelector("#initiator-domain-field"),
  initiatorDomainPills: document.querySelector("#initiator-domain-pills"),
  initiatorDomainList: document.querySelector("#initiator-domain-list"),
  initiatorDomainInput: document.querySelector("#initiator-domain-input"),
  initiatorDomainNote: document.querySelector("#initiator-domain-note"),
  addCurrentTabDomain: document.querySelector("#add-current-tab-domain"),
  methodsFieldset: document.querySelector("#methods-fieldset"),
  methodAll: document.querySelector("#method-all"),
  ruleFormTitle: document.querySelector("#rule-form-title"),
  editingRuleTitle: document.querySelector("#editing-rule-title"),
  saveRule: document.querySelector("#save-rule"),
  cancelEdit: document.querySelector("#cancel-edit"),
  rulesPanel: document.querySelector(".rules-panel"),
  rulesLockNote: document.querySelector("#rules-lock-note"),
  rules: document.querySelector("#rules"),
  emptyState: document.querySelector("#empty-state"),
  import: document.querySelector("#import"),
  importFile: document.querySelector("#import-file"),
  export: document.querySelector("#export"),
};

/** @type {StorageSettings} */
let settings = await loadSettings();
/** @type {ExtensionConfig} */
let config = await loadConfig(settings.storageArea);
let currentInitiatorDomains = [];
let editingRuleTitleToken = 0;
let editorBaseline = "";
let initiatorDomainNoteTimer = 0;
initializeIconButtons();
resetForm();
await syncCurrentTabDomainButton();
render();

elements.enabled.addEventListener("change", async () => {
  const previousConfig = cloneConfig(config);
  config.enabled = elements.enabled.checked;
  try {
    await saveConfig();
  } catch (error) {
    console.error("[Dev Server Debug Headers] save failed", error);
    config = previousConfig;
    alert(`Failed to update status: ${error.message}`);
  }
  render();
});

elements.syncEnabled.addEventListener("change", async () => {
  const targetStorageArea = elements.syncEnabled.checked ? "sync" : "local";
  const previousStorageArea = settings.storageArea;
  const previousConfig = cloneConfig(config);

  try {
    const loadResult = await switchStorageArea(targetStorageArea, config, {
      loadConfig: loadStoredConfig,
      saveConfig,
      saveSettings,
    });
    settings = loadResult.settings;
    config = loadResult.config;
    render();
  } catch (error) {
    console.error("[Dev Server Debug Headers] switch storage failed", error);
    settings = { storageArea: previousStorageArea };
    elements.syncEnabled.checked = previousStorageArea === "sync";
    config = previousConfig;
    alert(`Failed to switch storage: ${error.message}`);
    render();
  }
});

elements.operation.addEventListener("change", () => {
  elements.headerValue.disabled = elements.operation.value === "remove";
  syncRulesPanelDisabledState();
});

for (const input of elements.headerTargetInputs) {
  input.addEventListener("change", () => {
    syncHeaderTargetState();
    syncRulesPanelDisabledState();
  });
}

elements.methodAll.addEventListener("change", () => {
  if (elements.methodAll.checked) {
    setCheckedValues("method", []);
  }
  syncRulesPanelDisabledState();
});

for (const input of document.querySelectorAll('input[name="method"]')) {
  input.addEventListener("change", () => {
    syncMethodAllState();
    syncRulesPanelDisabledState();
  });
}

elements.form.addEventListener("input", syncRulesPanelDisabledState);
elements.form.addEventListener("change", syncRulesPanelDisabledState);

elements.methodsFieldset.addEventListener("pointerdown", (event) => {
  if (event.target.closest("input, label")) {
    return;
  }

  setTimeout(() => {
    elements.methodAll.focus();
  });
});

elements.initiatorDomainField.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button, .pill-remove")) {
    return;
  }

  setTimeout(() => {
    elements.initiatorDomainInput.focus();
  });
});

elements.addCurrentTabDomain.addEventListener("click", async () => {
  const domain = await getCurrentTabDomain();
  elements.addCurrentTabDomain.hidden = !domain;

  if (!domain) {
    return;
  }

  const added = addInitiatorDomain(domain, { clearInput: false });
  flashButtonTitle(
    elements.addCurrentTabDomain,
    added ? `Added ${domain}` : `${domain} already exists`,
    "Add active page domain",
  );
  elements.initiatorDomainInput.focus();
});

elements.initiatorDomainInput.addEventListener("keydown", (event) => {
  if (["Enter", ",", "Tab"].includes(event.key)) {
    const added = addInitiatorDomain(elements.initiatorDomainInput.value);
    if (added || event.key !== "Tab") {
      event.preventDefault();
    }
  }
});

elements.initiatorDomainInput.addEventListener("blur", () => {
  addInitiatorDomain(elements.initiatorDomainInput.value);
});

elements.cancelEdit.addEventListener("click", () => {
  resetForm();
});

elements.export.addEventListener("click", async () => {
  downloadJson("dev-server-debug-headers.json", config);
  flashButtonTitle(elements.export, "Downloaded", "Export JSON");
});

elements.import.addEventListener("click", () => {
  elements.importFile.click();
});

elements.importFile.addEventListener("change", async () => {
  const [file] = elements.importFile.files;
  elements.importFile.value = "";

  if (!file) {
    return;
  }

  const previousConfig = cloneConfig(config);

  try {
    const importedConfig = normalizeImportedConfig(
      JSON.parse(await file.text()),
    );
    config = importedConfig;
    await saveConfig();
    resetForm();
    render();
    flashButtonTitle(elements.import, "Imported", "Import JSON");
  } catch (error) {
    console.error("[Dev Server Debug Headers] import failed", error);
    config = previousConfig;
    render();
    flashButtonTitle(elements.import, "Invalid JSON", "Import JSON");
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = readEntryFromForm();
  const editingId = elements.editingId.value;
  const savedId = editingId || crypto.randomUUID();
  const nextRuleTitle = createRuleTitle(entry);
  const saveGhostSource = captureSaveGhostSource(nextRuleTitle);

  const previousConfig = cloneConfig(config);

  if (editingId) {
    config.entries = config.entries.map((item) =>
      item.id === editingId ? { ...item, ...entry } : item,
    );
  } else {
    config.entries = [{ id: savedId, enabled: true, ...entry }].concat(
      config.entries,
    );
  }

  try {
    await saveConfig();
  } catch (error) {
    console.error("[Dev Server Debug Headers] save failed", error);
    config = previousConfig;
    alert(`Failed to save rule: ${error.message}`);
    render();
    return;
  }
  resetForm();
  render();
  animateRuleSaveGhost(saveGhostSource, savedId);
});

/**
 * @returns {Promise<StorageSettings>}
 */
async function loadSettings() {
  const syncResult = await chrome.storage.sync.get(SETTINGS_KEY);
  const localResult = await chrome.storage.local.get(SETTINGS_KEY);
  const loadedSettings =
    syncResult[SETTINGS_KEY] || localResult[SETTINGS_KEY] || DEFAULT_SETTINGS;

  return normalizeSettings(loadedSettings);
}

/**
 * @param {StorageSettings} nextSettings
 * @returns {Promise<void>}
 */
async function saveSettings(nextSettings) {
  await Promise.all([
    chrome.storage.local.set({ [SETTINGS_KEY]: nextSettings }),
    chrome.storage.sync.set({ [SETTINGS_KEY]: nextSettings }),
  ]);
}

/**
 * @param {"local" | "sync"} storageArea
 * @returns {Promise<ExtensionConfig>}
 */
async function loadConfig(storageArea) {
  const result = await chrome.storage[storageArea].get(STORAGE_KEY);
  return {
    ...DEFAULT_CONFIG,
    ...result[STORAGE_KEY],
    entries: result[STORAGE_KEY]?.entries || [],
  };
}

/**
 * @param {"local" | "sync"} storageArea
 * @returns {Promise<{ exists: boolean, config: ExtensionConfig }>}
 */
async function loadStoredConfig(storageArea) {
  const result = await chrome.storage[storageArea].get(STORAGE_KEY);
  return {
    exists: Boolean(result[STORAGE_KEY]),
    config: {
      ...DEFAULT_CONFIG,
      ...result[STORAGE_KEY],
      entries: result[STORAGE_KEY]?.entries || [],
    },
  };
}

/**
 * @param {"local" | "sync"} [storageArea]
 * @param {ExtensionConfig} [nextConfig]
 * @returns {Promise<void>}
 */
async function saveConfig(
  storageArea = settings.storageArea,
  nextConfig = config,
) {
  await chrome.storage[storageArea].set({ [STORAGE_KEY]: nextConfig });
}

/**
 * @param {ExtensionConfig} value
 * @returns {ExtensionConfig}
 */
function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value));
}

function render() {
  elements.enabled.checked = config.enabled;
  elements.syncEnabled.checked = settings.storageArea === "sync";
  elements.rules.innerHTML = "";
  elements.emptyState.hidden = config.entries.length > 0;

  for (const group of groupEntriesByHeaderTarget(config.entries)) {
    elements.rules.append(createRuleTargetGroup(group));
  }

  syncRulesPanelDisabledState();
}

function groupEntriesByHeaderTarget(entries) {
  return [
    {
      key: "request",
      title: "Request headers",
      entries: entries.filter(
        (entry) => normalizeHeaderTarget(entry.headerTarget) === "request",
      ),
    },
    {
      key: "response",
      title: "Response headers",
      entries: entries.filter(
        (entry) => normalizeHeaderTarget(entry.headerTarget) === "response",
      ),
    },
  ].filter((group) => group.key === "request" || group.entries.length > 0);
}

function createRuleTargetGroup(group) {
  const groupItem = document.createElement("li");
  groupItem.className = "rule-target-group";
  groupItem.dataset.headerTarget = group.key;

  const title = document.createElement("div");
  title.className = "rule-target-title";
  title.textContent = group.title;

  const domains = document.createElement("ul");
  domains.className = "rule-group-list";

  for (const domainGroup of groupEntriesByInitiatorDomains(group.entries)) {
    domains.append(createRuleGroup(domainGroup, group.key));
  }

  groupItem.append(title, domains);
  return groupItem;
}

function createRuleGroup(group, headerTarget = "request") {
  const groupItem = document.createElement("li");
  groupItem.className = "rule-group";

  const header = document.createElement("div");
  header.className = "rule-group-header";

  const title = document.createElement("div");
  title.className = "rule-group-title";
  title.textContent = group.domains.join(", ");

  header.append(
    title,
    createIconButton("Add new rule", "plus", () =>
      startNewRuleForDomains(group.domains, headerTarget),
    ),
  );

  const list = document.createElement("ul");
  list.className = "rule-group-list";

  for (const entry of group.entries) {
    list.append(createRuleRow(entry));
  }

  groupItem.append(header, list);
  return groupItem;
}

function startNewRuleForDomains(domains, headerTarget = "request") {
  resetForm();
  setHeaderTarget(headerTarget);
  setInitiatorDomains(domains);
  resetEditorBaseline();
  syncRulesPanelDisabledState();
  elements.urlContains.focus();
}

function createRuleRow(entry) {
  const ruleTitle = createRuleTitle(entry);
  const row = document.createElement("li");
  row.className = "rule-row";
  row.setAttribute("aria-disabled", String(entry.enabled === false));

  const main = document.createElement("div");
  main.className = "rule-main";

  const title = document.createElement("button");
  title.type = "button";
  title.className = "rule-title";
  title.dataset.ruleId = entry.id;
  title.textContent = ruleTitle;
  title.title = ruleTitle;
  title.setAttribute("aria-label", `Edit rule ${ruleTitle}`);
  title.addEventListener("click", () => {
    const titleToken = startEditingRuleTitleTransition();
    animateRuleEditGhost(title, ruleTitle, titleToken);
    editEntry(entry);
  });

  main.append(title);

  const controls = document.createElement("div");
  controls.className = "rule-controls";
  controls.append(
    createIconButton(
      `Clone rule ${ruleTitle}`,
      "clone",
      () => cloneEntry(entry),
      "ghost-icon clone-icon",
    ),
    createIconButton(
      `Delete rule ${ruleTitle}`,
      "x",
      () => deleteEntry(entry.id),
      "danger-icon",
    ),
  );

  row.append(createRuleEnabledToggle(entry, ruleTitle), main, controls);
  return row;
}

function createRuleEnabledToggle(entry, ruleTitle) {
  const label = document.createElement("label");
  label.className = "rule-enabled-toggle";
  label.title =
    entry.enabled === false
      ? `Enable rule ${ruleTitle}`
      : `Disable rule ${ruleTitle}`;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = entry.enabled !== false;
  input.setAttribute(
    "aria-label",
    entry.enabled === false
      ? `Enable rule ${ruleTitle}`
      : `Disable rule ${ruleTitle}`,
  );
  input.addEventListener("change", () => toggleEntry(entry.id));

  label.append(input);
  return label;
}

function initializeIconButtons() {
  setIconButton(elements.saveRule, "Save rule", "save");
  setIconButton(elements.cancelEdit, "Cancel edit", "undo");
  setIconButton(
    elements.addCurrentTabDomain,
    "Add active page domain",
    "crosshair",
  );
  setIconButton(elements.import, "Import JSON", "upload");
  setIconButton(elements.export, "Export JSON", "download");
}

function createIconButton(label, iconName, onClick, className = "secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  setIconButton(button, label, iconName);
  button.addEventListener("click", onClick);
  return button;
}

function setIconButton(button, label, iconName) {
  button.classList.add("icon-button");
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = getIconSvg(iconName);
}

function flashButtonTitle(button, text, fallbackText) {
  button.title = text;
  setTimeout(() => {
    button.title = fallbackText;
  }, 1200);
}

function flashInitiatorDomainNote(text) {
  clearTimeout(initiatorDomainNoteTimer);
  elements.initiatorDomainNote.textContent = text;
  elements.initiatorDomainField.classList.add("is-attention");

  initiatorDomainNoteTimer = setTimeout(() => {
    resetInitiatorDomainNote();
  }, 1800);
}

function resetInitiatorDomainNote() {
  clearTimeout(initiatorDomainNoteTimer);
  initiatorDomainNoteTimer = 0;
  elements.initiatorDomainNote.textContent =
    "Empty uses localhost and 127.0.0.1.";
  elements.initiatorDomainField.classList.remove("is-attention");
}

/**
 * @param {string} fallbackRuleTitle
 * @returns {{ left: number, top: number, width: number, text: string }}
 */
function captureSaveGhostSource(fallbackRuleTitle) {
  const sourceElement = elements.editingRuleTitle.hidden
    ? elements.ruleFormTitle
    : elements.editingRuleTitle;
  const sourceRect = sourceElement.getBoundingClientRect();

  return {
    left: sourceRect.left,
    top: sourceRect.top,
    width: sourceRect.width,
    text: fallbackRuleTitle,
  };
}

/**
 * @param {HTMLElement} sourceElement
 * @param {string} ruleTitle
 * @param {number} titleToken
 * @returns {Promise<void>}
 */
async function animateRuleEditGhost(sourceElement, ruleTitle, titleToken) {
  if (globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    showEditingRuleTitle(ruleTitle, titleToken);
    return;
  }

  const sourceRect = sourceElement.getBoundingClientRect();
  const targetRect = getEditingRuleTitleTargetRect();
  const ghost = document.createElement("div");

  ghost.className = "edit-ghost";
  ghost.textContent = sourceElement.textContent;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.left = `${sourceRect.left}px`;
  ghost.style.top = `${sourceRect.top}px`;
  ghost.style.width = `${sourceRect.width}px`;
  document.body.append(ghost);

  try {
    const animation = ghost.animate(
      [
        {
          opacity: 0.95,
          transform: "translate3d(0, 0, 0) scale(1)",
        },
        {
          opacity: 0.72,
          transform: `translate3d(${targetRect.left - sourceRect.left}px, ${
            targetRect.top - sourceRect.top
          }px, 0) scale(0.86)`,
        },
      ],
      {
        duration: 260,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    );

    await animation.finished;
    showEditingRuleTitle(ruleTitle, titleToken);
  } catch (_error) {
    // A canceled animation should only remove the transient ghost.
  } finally {
    ghost.remove();
  }
}

/**
 * @returns {{ left: number, top: number }}
 */
function getEditingRuleTitleTargetRect() {
  const titleRect = elements.ruleFormTitle.getBoundingClientRect();
  const titleStyles = globalThis.getComputedStyle(
    elements.ruleFormTitle.parentElement,
  );
  const titleGap = Number.parseFloat(titleStyles.columnGap || titleStyles.gap);

  return {
    left: titleRect.right + (Number.isNaN(titleGap) ? 8 : titleGap),
    top: titleRect.top,
  };
}

/**
 * @param {{ left: number, top: number, width: number, text: string }} source
 * @param {string} targetRuleId
 * @returns {Promise<void>}
 */
async function animateRuleSaveGhost(source, targetRuleId) {
  if (globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const targetElement = findRuleTitleElement(targetRuleId);
  if (!targetElement) {
    return;
  }

  const targetRect = targetElement.getBoundingClientRect();
  const ghost = document.createElement("div");

  ghost.className = "edit-ghost";
  ghost.textContent = source.text;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.left = `${source.left}px`;
  ghost.style.top = `${source.top}px`;
  ghost.style.width = `${Math.max(source.width, targetRect.width)}px`;
  document.body.append(ghost);

  try {
    const animation = ghost.animate(
      [
        {
          opacity: 0.9,
          transform: "translate3d(0, 0, 0) scale(0.86)",
        },
        {
          opacity: 0.72,
          transform: `translate3d(${targetRect.left - source.left}px, ${
            targetRect.top - source.top
          }px, 0) scale(1)`,
        },
      ],
      {
        duration: 240,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    );

    await animation.finished;
  } catch (_error) {
    // A canceled animation should only remove the transient ghost.
  } finally {
    ghost.remove();
  }
}

/**
 * @param {string} ruleId
 * @returns {HTMLElement | null}
 */
function findRuleTitleElement(ruleId) {
  return findRuleTitleElementById(
    Array.from(document.querySelectorAll(".rule-title")),
    ruleId,
  );
}

/**
 * @returns {number}
 */
function startEditingRuleTitleTransition() {
  editingRuleTitleToken += 1;
  clearEditingRuleTitle();
  return editingRuleTitleToken;
}

/**
 * @param {string} ruleTitle
 * @param {number} titleToken
 * @returns {void}
 */
function showEditingRuleTitle(ruleTitle, titleToken) {
  if (titleToken !== editingRuleTitleToken) {
    return;
  }

  elements.editingRuleTitle.textContent = ruleTitle;
  elements.editingRuleTitle.hidden = false;
}

function clearEditingRuleTitle() {
  editingRuleTitleToken += 1;
  elements.editingRuleTitle.textContent = "";
  elements.editingRuleTitle.hidden = true;
}

function getIconSvg(name) {
  const icons = {
    clone:
      '<path fill="currentColor" stroke="none" d="M22.335273 1.090909v20.379273h-2.877818V22.909091H2.181818V3.967636h1.437818V1.090909h18.715636z m-4.556727 4.554545H3.859636v15.585818h13.92V5.645455z m2.876727-2.876727H5.298545v1.198909h14.16l-0.001091 15.823636h1.197818V2.768727z m-5.370545 14.145818v1.678909H6.526909v-1.678909h8.757818z m0-4.315636v1.678909H6.526909v-1.678909h8.757818z m0-4.178182v1.678909H6.526909V8.420727h8.757818z" />',
    crosshair:
      '<circle cx="12" cy="12" r="7" /><path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" />',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />',
    plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
    save: '<path d="M4 4h13l3 3v13H4Z" /><path d="M7 4v6h10V4" /><path d="M8 20v-7h8v7" /><path d="M14 6h2" />',
    undo: '<path d="M8 7H4V3" /><path d="M4.6 7A8 8 0 1 1 6 18" />',
    upload:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" />',
    x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
  };

  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function toggleEntry(id) {
  config.entries = config.entries.map((entry) =>
    entry.id === id ? { ...entry, enabled: entry.enabled === false } : entry,
  );
  await saveConfig();
  render();
}

async function deleteEntry(id) {
  config.entries = config.entries.filter((entry) => entry.id !== id);
  await saveConfig();
  render();
}

async function getCurrentTabDomain() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return getPageHostname(tab?.url);
  } catch (error) {
    console.error("[Dev Server Debug Headers] active tab lookup failed", error);
    return "";
  }
}

async function syncCurrentTabDomainButton() {
  elements.addCurrentTabDomain.hidden = !(await getCurrentTabDomain());
}

function getPageHostname(url) {
  try {
    const parsedUrl = new URL(url || "");
    return ["http:", "https:"].includes(parsedUrl.protocol)
      ? parsedUrl.hostname
      : "";
  } catch {
    return "";
  }
}

function cloneEntry(entry) {
  resetForm();
  applyEntryToForm(entry);
  elements.editingId.value = "";
  clearEditingRuleTitle();
  setInitiatorDomains([]);
  elements.cancelEdit.hidden = false;
  flashInitiatorDomainNote(
    "Cloned rule. Add an initiator domain or keep defaults.",
  );
  resetEditorBaseline();
  syncRulesPanelDisabledState();
  elements.initiatorDomainInput.focus();
}

function editEntry(entry) {
  elements.editingId.value = entry.id;
  applyEntryToForm(entry);
  elements.cancelEdit.hidden = false;
  syncRulesPanelDisabledState();
}

function applyEntryToForm(entry) {
  setHeaderTarget(normalizeHeaderTarget(entry.headerTarget));
  elements.responseHeaderCondition.checked =
    entry.responseHeaderConditionEnabled === true;
  elements.urlContains.value = entry.urlContains;
  elements.headerName.value = entry.headerName;
  elements.headerValue.value = entry.headerValue;
  elements.operation.value = entry.operation;
  elements.resourceType.value = entry.resourceTypes[0] || "";
  setInitiatorDomains(normalizeInitiatorDomains(entry.initiatorDomains));
  setCheckedValues("method", entry.methods);
  syncMethodAllState();
  elements.headerValue.disabled = entry.operation === "remove";
  syncHeaderTargetState();
}

function readEntryFromForm() {
  const operation = elements.operation.value;
  const headerTarget = getHeaderTarget();
  return {
    urlContains: elements.urlContains.value.trim(),
    headerName: elements.headerName.value.trim().toLowerCase(),
    headerValue: operation === "remove" ? "" : elements.headerValue.value,
    headerTarget,
    operation,
    responseHeaderConditionEnabled:
      headerTarget === "response" && elements.responseHeaderCondition.checked,
    methods: getCheckedValues("method"),
    resourceTypes: elements.resourceType.value
      ? [elements.resourceType.value]
      : [],
    initiatorDomains: getInitiatorDomains(),
  };
}

function resetForm() {
  elements.form.reset();
  elements.editingId.value = "";
  clearEditingRuleTitle();
  setHeaderTarget("request");
  elements.responseHeaderCondition.checked = false;
  elements.operation.value = "set";
  setInitiatorDomains(DEFAULT_INITIATOR_DOMAINS);
  elements.methodAll.checked = true;
  elements.cancelEdit.hidden = true;
  elements.headerValue.disabled = false;
  resetInitiatorDomainNote();
  syncHeaderTargetState();
  resetEditorBaseline();
  syncRulesPanelDisabledState();
}

function getHeaderTarget() {
  return normalizeHeaderTarget(
    document.querySelector('input[name="headerTarget"]:checked')?.value,
  );
}

function setHeaderTarget(headerTarget) {
  const normalizedHeaderTarget = normalizeHeaderTarget(headerTarget);

  for (const input of elements.headerTargetInputs) {
    input.checked = input.value === normalizedHeaderTarget;
  }

  syncHeaderTargetState();
}

function syncHeaderTargetState() {
  const isResponse = getHeaderTarget() === "response";
  elements.responseConditionField.hidden = !isResponse;
  elements.responseHeaderCondition.disabled = !isResponse;
  elements.responseNote.hidden = !isResponse;

  if (!isResponse) {
    elements.responseHeaderCondition.checked = false;
  }
}

function syncRulesPanelDisabledState() {
  const isEditing = Boolean(elements.editingId.value);
  const isDirty = editorBaseline !== getEditorSnapshot();
  const shouldDisable = isEditing || isDirty;
  const disabledTitle = shouldDisable
    ? "Save or cancel current editor changes first."
    : "";
  elements.rulesPanel.setAttribute("aria-disabled", String(shouldDisable));
  elements.rulesLockNote.hidden = !shouldDisable;
  elements.import.title = disabledTitle || "Import JSON";
  elements.export.title = disabledTitle || "Export JSON";

  for (const control of elements.rulesPanel.querySelectorAll(
    "button, input, select, textarea",
  )) {
    control.disabled = shouldDisable;
  }
}

function resetEditorBaseline() {
  editorBaseline = getEditorSnapshot();
}

function getEditorSnapshot() {
  return JSON.stringify({
    ...readEntryFromForm(),
    editingId: elements.editingId.value,
    pendingInitiatorDomain: elements.initiatorDomainInput.value,
  });
}

function getCheckedValues(name) {
  return Array.from(
    document.querySelectorAll(`input[name="${name}"]:checked`),
  ).map((input) => input.value);
}

function setCheckedValues(name, values) {
  for (const input of document.querySelectorAll(`input[name="${name}"]`)) {
    input.checked = values.includes(input.value);
  }
}

function syncMethodAllState() {
  const selectedMethods = getCheckedValues("method");
  elements.methodAll.checked = selectedMethods.length === 0;
}

function getInitiatorDomains() {
  return currentInitiatorDomains.length > 0
    ? currentInitiatorDomains
    : DEFAULT_INITIATOR_DOMAINS;
}

function setInitiatorDomains(domains) {
  currentInitiatorDomains = normalizeInitiatorDomains(domains);
  renderInitiatorDomainPills();
}

function addInitiatorDomain(value, { clearInput = true } = {}) {
  const domains = parseDomainList(value);
  const addedDomains = domains.filter(
    (domain) => !currentInitiatorDomains.includes(domain),
  );

  if (addedDomains.length === 0) {
    if (clearInput) {
      elements.initiatorDomainInput.value = "";
    }
    syncRulesPanelDisabledState();
    return false;
  }

  currentInitiatorDomains = currentInitiatorDomains.concat(addedDomains);
  if (clearInput) {
    elements.initiatorDomainInput.value = "";
  }
  renderInitiatorDomainPills();
  syncRulesPanelDisabledState();
  return true;
}

function removeInitiatorDomain(index) {
  currentInitiatorDomains = currentInitiatorDomains.filter(
    (_domain, domainIndex) => domainIndex !== index,
  );
  renderInitiatorDomainPills();
  syncRulesPanelDisabledState();
}

function renderInitiatorDomainPills() {
  elements.initiatorDomainList.innerHTML = "";

  for (const [index, domain] of currentInitiatorDomains.entries()) {
    const pill = document.createElement("span");
    pill.className = "pill";

    const text = document.createElement("span");
    text.textContent = domain;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "pill-remove";
    removeButton.textContent = "x";
    removeButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    removeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeInitiatorDomain(index);
      elements.initiatorDomainInput.focus();
    });

    pill.append(text, removeButton);
    elements.initiatorDomainList.append(pill);
  }
}
