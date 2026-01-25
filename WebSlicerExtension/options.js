const STORAGE_KEY = "slicer_api_base";

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

async function loadSettings() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  if (data[STORAGE_KEY]) {
    apiBaseInput.value = data[STORAGE_KEY];
    return;
  }
  const config = await getConfig();
  apiBaseInput.value = config.api_base || "";
}

async function saveSettings() {
  const value = apiBaseInput.value.trim();
  await chrome.storage.sync.set({ [STORAGE_KEY]: value });
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1200);
}

saveButton.addEventListener("click", () => {
  saveSettings();
});

loadSettings();
