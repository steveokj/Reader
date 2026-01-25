const STORAGE_KEY = "slicer_api_base";
const DEFAULT_API_BASE = "http://127.0.0.1:8000";

const apiBaseInput = document.getElementById("apiBase");
const status = document.getElementById("status");
const saveButton = document.getElementById("save");

async function loadSettings() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  apiBaseInput.value = data[STORAGE_KEY] || DEFAULT_API_BASE;
}

async function saveSettings() {
  const value = apiBaseInput.value.trim();
  await chrome.storage.sync.set({ [STORAGE_KEY]: value || DEFAULT_API_BASE });
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1200);
}

saveButton.addEventListener("click", () => {
  saveSettings();
});

loadSettings();
