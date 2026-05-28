const STORAGE_KEY = "modHeaderLiteConfig";
const DEFAULT_CONFIG = {
  enabled: true,
  entries: [],
};
const DEFAULT_INITIATOR_DOMAINS = ["localhost", "127.0.0.1"];

const elements = {
  enabled: document.querySelector("#enabled"),
  form: document.querySelector("#rule-form"),
  editingId: document.querySelector("#editing-id"),
  urlContains: document.querySelector("#url-contains"),
  headerName: document.querySelector("#header-name"),
  headerValue: document.querySelector("#header-value"),
  operation: document.querySelector("#operation"),
  resourceType: document.querySelector("#resource-type"),
  initiatorDomainField: document.querySelector("#initiator-domain-field"),
  initiatorDomainPills: document.querySelector("#initiator-domain-pills"),
  initiatorDomainList: document.querySelector("#initiator-domain-list"),
  initiatorDomainInput: document.querySelector("#initiator-domain-input"),
  methodsFieldset: document.querySelector("#methods-fieldset"),
  methodAll: document.querySelector("#method-all"),
  saveRule: document.querySelector("#save-rule"),
  cancelEdit: document.querySelector("#cancel-edit"),
  rules: document.querySelector("#rules"),
  emptyState: document.querySelector("#empty-state"),
  import: document.querySelector("#import"),
  importFile: document.querySelector("#import-file"),
  export: document.querySelector("#export"),
};

let config = await loadConfig();
let currentInitiatorDomains = [];
initializeIconButtons();
resetForm();
render();

elements.enabled.addEventListener("change", async () => {
  config.enabled = elements.enabled.checked;
  await saveConfig();
  render();
});

elements.operation.addEventListener("change", () => {
  elements.headerValue.disabled = elements.operation.value === "remove";
});

elements.methodAll.addEventListener("change", () => {
  if (elements.methodAll.checked) {
    setCheckedValues("method", []);
  }
});

for (const input of document.querySelectorAll('input[name="method"]')) {
  input.addEventListener("change", syncMethodAllState);
}

elements.methodsFieldset.addEventListener("pointerdown", (event) => {
  if (event.target.closest("input, label")) {
    return;
  }

  setTimeout(() => {
    elements.methodAll.focus();
  });
});

elements.initiatorDomainField.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".pill-remove")) {
    return;
  }

  setTimeout(() => {
    elements.initiatorDomainInput.focus();
  });
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
    flashButtonTitle(elements.import, "Invalid JSON", "Import JSON");
  }
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const entry = readEntryFromForm();
  const editingId = elements.editingId.value;

  if (editingId) {
    config.entries = config.entries.map((item) =>
      item.id === editingId ? { ...item, ...entry } : item,
    );
  } else {
    config.entries = [
      { id: crypto.randomUUID(), enabled: true, ...entry },
    ].concat(config.entries);
  }

  await saveConfig();
  resetForm();
  render();
});

async function loadConfig() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return {
    ...DEFAULT_CONFIG,
    ...result[STORAGE_KEY],
    entries: result[STORAGE_KEY]?.entries || [],
  };
}

async function saveConfig() {
  await chrome.storage.local.set({ [STORAGE_KEY]: config });
}

function normalizeImportedConfig(importedConfig) {
  if (!importedConfig || !Array.isArray(importedConfig.entries)) {
    throw new Error("Imported config must contain an entries array.");
  }

  return {
    enabled: importedConfig.enabled !== false,
    entries: importedConfig.entries.map(normalizeImportedEntry),
  };
}

function normalizeImportedEntry(entry) {
  const operation = ["set", "append", "remove"].includes(entry?.operation)
    ? entry.operation
    : "set";

  return {
    id: entry?.id || crypto.randomUUID(),
    enabled: entry?.enabled !== false,
    urlContains: String(entry?.urlContains || "").trim(),
    headerName: String(entry?.headerName || "")
      .trim()
      .toLowerCase(),
    headerValue: operation === "remove" ? "" : String(entry?.headerValue || ""),
    operation,
    methods: Array.isArray(entry?.methods) ? entry.methods.filter(Boolean) : [],
    resourceTypes: Array.isArray(entry?.resourceTypes)
      ? entry.resourceTypes.filter(Boolean)
      : [],
    initiatorDomains: normalizeInitiatorDomains(entry?.initiatorDomains),
  };
}

function render() {
  elements.enabled.checked = config.enabled;
  elements.rules.innerHTML = "";
  elements.emptyState.hidden = config.entries.length > 0;

  for (const group of groupEntriesByInitiatorDomains(config.entries)) {
    elements.rules.append(createRuleGroup(group));
  }
}

function groupEntriesByInitiatorDomains(entries) {
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

function createRuleGroup(group) {
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
      startNewRuleForDomains(group.domains),
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

function startNewRuleForDomains(domains) {
  resetForm();
  setInitiatorDomains(domains);
  elements.urlContains.focus();
}

function createRuleRow(entry) {
  const row = document.createElement("li");
  row.className = "rule-row";
  row.setAttribute("aria-disabled", String(entry.enabled === false));

  const main = document.createElement("div");
  main.className = "rule-main";

  const title = document.createElement("div");
  title.className = "rule-title";
  title.textContent = `${entry.operation.toUpperCase()} ${entry.headerName}`;

  main.append(title);

  const controls = document.createElement("div");
  controls.className = "rule-controls";
  controls.append(
    createIconButton(
      entry.enabled === false ? "Enable" : "Disable",
      entry.enabled === false ? "play" : "pause",
      () => toggleEntry(entry.id),
    ),
    createIconButton("Edit", "edit", () => editEntry(entry)),
    createIconButton("Delete", "trash", () => deleteEntry(entry.id), "danger"),
  );

  row.append(main, controls);
  return row;
}

function initializeIconButtons() {
  setIconButton(elements.saveRule, "Save rule", "check");
  setIconButton(elements.cancelEdit, "Cancel edit", "x");
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

function getIconSvg(name) {
  const icons = {
    check: '<path d="M20 6 9 17l-5-5" />',
    download:
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />',
    edit: '<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />',
    pause: '<path d="M8 5v14" /><path d="M16 5v14" />',
    play: '<path d="m8 5 11 7-11 7Z" />',
    plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
    trash:
      '<path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5" /><path d="M14 11v5" />',
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

function editEntry(entry) {
  elements.editingId.value = entry.id;
  elements.urlContains.value = entry.urlContains;
  elements.headerName.value = entry.headerName;
  elements.headerValue.value = entry.headerValue;
  elements.operation.value = entry.operation;
  elements.resourceType.value = entry.resourceTypes[0] || "";
  setInitiatorDomains(normalizeInitiatorDomains(entry.initiatorDomains));
  setCheckedValues("method", entry.methods);
  syncMethodAllState();
  elements.cancelEdit.hidden = false;
  elements.headerValue.disabled = entry.operation === "remove";
}

function readEntryFromForm() {
  const operation = elements.operation.value;
  return {
    urlContains: elements.urlContains.value.trim(),
    headerName: elements.headerName.value.trim().toLowerCase(),
    headerValue: operation === "remove" ? "" : elements.headerValue.value,
    operation,
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
  elements.operation.value = "set";
  setInitiatorDomains(DEFAULT_INITIATOR_DOMAINS);
  elements.methodAll.checked = true;
  elements.cancelEdit.hidden = true;
  elements.headerValue.disabled = false;
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

function parseDomainList(value) {
  return value
    .split(",")
    .map(normalizeDomain)
    .filter(Boolean)
    .filter((domain, index, domains) => domains.indexOf(domain) === index);
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

function addInitiatorDomain(value) {
  const domains = parseDomainList(value);
  const addedDomains = domains.filter(
    (domain) => !currentInitiatorDomains.includes(domain),
  );

  if (addedDomains.length === 0) {
    elements.initiatorDomainInput.value = "";
    return false;
  }

  currentInitiatorDomains = currentInitiatorDomains.concat(addedDomains);
  elements.initiatorDomainInput.value = "";
  renderInitiatorDomainPills();
  return true;
}

function removeInitiatorDomain(index) {
  currentInitiatorDomains = currentInitiatorDomains.filter(
    (_domain, domainIndex) => domainIndex !== index,
  );
  renderInitiatorDomainPills();
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

function normalizeInitiatorDomains(initiatorDomains) {
  if (!Array.isArray(initiatorDomains)) {
    return DEFAULT_INITIATOR_DOMAINS;
  }

  return initiatorDomains.map(normalizeDomain).filter(Boolean);
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
