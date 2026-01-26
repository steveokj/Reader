const STORAGE_KEY = "slicer_api_base";
const SETTINGS_KEYS = {
  defaultMode: "slicer_default_mode",
  doubleClickLibrary: "slicer_double_click_library",
  hotkeySave: "slicer_hotkey_save",
  autoSaveOnEnd: "slicer_auto_save_on_end",
};

let configPromise = null;

async function getConfig() {
  if (configPromise) {
    return configPromise;
  }
  configPromise = fetch(chrome.runtime.getURL("config.json"))
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));
  return configPromise;
}

const apiBaseInput = document.getElementById("apiBase");
const status = document.getElementById("status");
const saveButton = document.getElementById("save");
const defaultModeSelect = document.getElementById("defaultMode");
const doubleClickLibrary = document.getElementById("doubleClickLibrary");
const hotkeySave = document.getElementById("hotkeySave");
const autoSaveOnEnd = document.getElementById("autoSaveOnEnd");

async function loadSettings() {
  const data = await chrome.storage.sync.get([STORAGE_KEY, ...Object.values(SETTINGS_KEYS)]);
  if (data[STORAGE_KEY]) {
    apiBaseInput.value = data[STORAGE_KEY];
  } else {
    const config = await getConfig();
    apiBaseInput.value = config.api_base || "";
  }
  defaultModeSelect.value = data[SETTINGS_KEYS.defaultMode] || "pick";
  doubleClickLibrary.checked =
    typeof data[SETTINGS_KEYS.doubleClickLibrary] === "boolean"
      ? data[SETTINGS_KEYS.doubleClickLibrary]
      : false;
  hotkeySave.checked =
    typeof data[SETTINGS_KEYS.hotkeySave] === "boolean"
      ? data[SETTINGS_KEYS.hotkeySave]
      : true;
  autoSaveOnEnd.checked =
    typeof data[SETTINGS_KEYS.autoSaveOnEnd] === "boolean"
      ? data[SETTINGS_KEYS.autoSaveOnEnd]
      : true;
}

async function saveSettings() {
  const value = apiBaseInput.value.trim();
  await chrome.storage.sync.set({
    [STORAGE_KEY]: value,
    [SETTINGS_KEYS.defaultMode]: defaultModeSelect.value,
    [SETTINGS_KEYS.doubleClickLibrary]: doubleClickLibrary.checked,
    [SETTINGS_KEYS.hotkeySave]: hotkeySave.checked,
    [SETTINGS_KEYS.autoSaveOnEnd]: autoSaveOnEnd.checked,
  });
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1200);
}

saveButton.addEventListener("click", () => {
  saveSettings();
});

loadSettings();
