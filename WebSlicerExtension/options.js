const STORAGE_KEY = "slicer_api_base";
const SETTINGS_KEYS = {
  defaultMode: "slicer_default_mode",
  doubleClickLibrary: "slicer_double_click_library",
  hotkeySave: "slicer_hotkey_save",
  autoSaveOnEnd: "slicer_auto_save_on_end",
  autoSaveMhtml: "slicer_auto_save_mhtml",
};
const HANDLE_DB = "web-slicer-storage";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "mhtml-folder";

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
const autoSaveMhtml = document.getElementById("autoSaveMhtml");
const chooseFolderButton = document.getElementById("chooseFolder");
const clearFolderButton = document.getElementById("clearFolder");
const folderStatus = document.getElementById("folderStatus");

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
        request.result.createObjectStore(HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFolderHandle() {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readonly");
    const store = tx.objectStore(HANDLE_STORE);
    const request = store.get(HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function setFolderHandle(handle) {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    const store = tx.objectStore(HANDLE_STORE);
    const request = store.put(handle, HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clearFolderHandle() {
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, "readwrite");
    const store = tx.objectStore(HANDLE_STORE);
    const request = store.delete(HANDLE_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function updateFolderStatus() {
  try {
    const handle = await getFolderHandle();
    folderStatus.textContent = handle ? `Folder: ${handle.name}` : "Not set";
  } catch (error) {
    console.warn("Folder status failed", error);
    folderStatus.textContent = "Not set";
  }
}

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
  autoSaveMhtml.checked =
    typeof data[SETTINGS_KEYS.autoSaveMhtml] === "boolean"
      ? data[SETTINGS_KEYS.autoSaveMhtml]
      : false;
  updateFolderStatus();
}

async function saveSettings() {
  const value = apiBaseInput.value.trim();
  await chrome.storage.sync.set({
    [STORAGE_KEY]: value,
    [SETTINGS_KEYS.defaultMode]: defaultModeSelect.value,
    [SETTINGS_KEYS.doubleClickLibrary]: doubleClickLibrary.checked,
    [SETTINGS_KEYS.hotkeySave]: hotkeySave.checked,
    [SETTINGS_KEYS.autoSaveOnEnd]: autoSaveOnEnd.checked,
    [SETTINGS_KEYS.autoSaveMhtml]: autoSaveMhtml.checked,
  });
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1200);
}

chooseFolderButton.addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({
      id: "web-slicer-mhtml",
      mode: "readwrite",
    });
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      throw new Error("Folder permission denied");
    }
    await setFolderHandle(handle);
    await updateFolderStatus();
    status.textContent = "Folder saved.";
    setTimeout(() => {
      status.textContent = "";
    }, 1200);
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }
    console.warn("Folder pick failed", error);
    status.textContent = "Folder selection failed.";
    setTimeout(() => {
      status.textContent = "";
    }, 1200);
  }
});

clearFolderButton.addEventListener("click", async () => {
  try {
    await clearFolderHandle();
    await updateFolderStatus();
    status.textContent = "Folder cleared.";
    setTimeout(() => {
      status.textContent = "";
    }, 1200);
  } catch (error) {
    console.warn("Folder clear failed", error);
    status.textContent = "Folder clear failed.";
    setTimeout(() => {
      status.textContent = "";
    }, 1200);
  }
});

saveButton.addEventListener("click", () => {
  saveSettings();
});

loadSettings();
