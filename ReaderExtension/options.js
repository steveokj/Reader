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

async function loadConfigApiBase() {
  try {
    const response = await fetch(chrome.runtime.getURL("config.json"));
    if (!response.ok) {
      return "";
    }
    const data = await response.json();
    if (data && typeof data.apiBase === "string") {
      return data.apiBase.trim();
    }
  } catch (error) {
    return "";
  }
  return "";
}

async function loadSettings() {
  const stored = await new Promise((resolve) => {
    chrome.storage.sync.get([STORAGE_KEY], (data) => {
      resolve(typeof data[STORAGE_KEY] === "string" ? data[STORAGE_KEY] : "");
    });
  });

  if (stored && stored.trim()) {
    input.value = stored.trim();
    return;
  }

  const fallback = await loadConfigApiBase();
  input.value = fallback || "";
}

saveButton.addEventListener("click", () => {
  const value = input.value.trim();
  chrome.storage.sync.set({ [STORAGE_KEY]: value }, () => {
    setStatus("Saved");
  });
});

loadSettings();
