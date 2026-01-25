const DEFAULT_API_BASE = "https://192.168.2.34:8002";
const STORAGE_KEY = "reader_api_base";

const input = document.getElementById("api-base");
const status = document.getElementById("status");
const saveButton = document.getElementById("save");

function setStatus(message) {
  status.textContent = message;
  if (!message) {
    return;
  }
  window.clearTimeout(setStatus._timer);
  setStatus._timer = window.setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

function loadSettings() {
  chrome.storage.sync.get([STORAGE_KEY], (data) => {
    input.value = data[STORAGE_KEY] || DEFAULT_API_BASE;
  });
}

saveButton.addEventListener("click", () => {
  const value = input.value.trim() || DEFAULT_API_BASE;
  chrome.storage.sync.set({ [STORAGE_KEY]: value }, () => {
    setStatus("Saved");
  });
});

loadSettings();
