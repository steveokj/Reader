const STORAGE_KEY = "slicer_api_base";
const SETTINGS_KEYS = {
  defaultMode: "slicer_default_mode",
  doubleClickLibrary: "slicer_double_click_library",
  hotkeySave: "slicer_hotkey_save",
  autoSaveMhtml: "slicer_auto_save_mhtml",
};
const RELOAD_PENDING_KEY = "reader_reload_pending";
const HANDLE_DB = "web-slicer-storage";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "mhtml-folder";

let configPromise = null;
let clickTimer = null;
let lastClickTime = 0;

async function getConfig() {
  if (configPromise) {
    return configPromise;
  }
  configPromise = fetch(chrome.runtime.getURL("config.json"))
    .then((response) => (response.ok ? response.json() : {}))
    .catch(() => ({}));
  return configPromise;
}

async function getApiBase() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  if (data[STORAGE_KEY]) {
    return data[STORAGE_KEY];
  }
  const config = await getConfig();
  return config.api_base || "";
}

async function getSettings() {
  const data = await chrome.storage.sync.get(Object.values(SETTINGS_KEYS));
  return {
    defaultMode: data[SETTINGS_KEYS.defaultMode] || "pick",
    doubleClickLibrary:
      typeof data[SETTINGS_KEYS.doubleClickLibrary] === "boolean"
        ? data[SETTINGS_KEYS.doubleClickLibrary]
        : false,
    hotkeySave:
      typeof data[SETTINGS_KEYS.hotkeySave] === "boolean"
        ? data[SETTINGS_KEYS.hotkeySave]
        : true,
    autoSaveMhtml:
      typeof data[SETTINGS_KEYS.autoSaveMhtml] === "boolean"
        ? data[SETTINGS_KEYS.autoSaveMhtml]
        : false,
  };
}

function sanitizeFileName(value) {
  return String(value || "page")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "page";
}

function buildMhtmlFileName(title, url) {
  const base = sanitizeFileName(title || url || "page");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${base}-${stamp}.mhtml`;
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen) {
    throw new Error("Offscreen API unavailable");
  }
  const hasDocument = chrome.offscreen.hasDocument
    ? await chrome.offscreen.hasDocument()
    : false;
  if (hasDocument) {
    return;
  }
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["BLOBS"],
    justification: "Save MHTML files to disk",
  });
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) {
    return;
  }
  try {
    await ensureContentScript(tab.id);
  } catch (error) {
    console.warn("Web Slicer failed to inject content script", error);
  }
  try {
    const settings = await getSettings();
    if (settings.doubleClickLibrary) {
      const now = Date.now();
      if (now - lastClickTime < 350) {
        lastClickTime = 0;
        if (clickTimer) {
          clearTimeout(clickTimer);
          clickTimer = null;
        }
        chrome.tabs.sendMessage(tab.id, { type: "slicer-open-library" });
        return;
      }
      lastClickTime = now;
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      clickTimer = setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { type: "slicer-toggle" });
        clickTimer = null;
      }, 350);
      return;
    }
  } catch (error) {
    console.warn("Web Slicer settings lookup failed", error);
  }
  chrome.tabs.sendMessage(tab.id, { type: "slicer-toggle" });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "reload-extension") {
    try {
      await chrome.storage.local.set({ [RELOAD_PENDING_KEY]: true });
    } catch (error) {
      console.warn("Web Slicer reload flag failed", error);
    }
    chrome.runtime.reload();
    return;
  }
  if (command !== "save-slice") {
    return;
  }
  try {
    const settings = await getSettings();
    if (!settings.hotkeySave) {
      return;
    }
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      return;
    }
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: "slicer-save-now" });
  } catch (error) {
    console.warn("Web Slicer save hotkey failed", error);
  }
});

async function handleReloadPending() {
  try {
    const data = await chrome.storage.local.get(RELOAD_PENDING_KEY);
    if (!data[RELOAD_PENDING_KEY]) {
      return;
    }
    await chrome.storage.local.remove(RELOAD_PENDING_KEY);
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id) {
      chrome.tabs.reload(tab.id);
    }
  } catch (error) {
    console.warn("Web Slicer reload pending failed", error);
  }
}

chrome.runtime.onStartup.addListener(() => {
  handleReloadPending();
});

chrome.runtime.onInstalled.addListener(() => {
  handleReloadPending();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "reload-extension") {
    chrome.runtime.reload();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return;
  }
  if (message.type === "slicer-save") {
    (async () => {
      try {
        const apiBase = await getApiBase();
        const response = await fetch(`${apiBase}/slicer/slices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.payload),
        });
        if (!response.ok) {
          throw new Error(`Save failed (${response.status})`);
        }
        const data = await response.json();
        sendResponse({ ok: true, slice: data.slice });
      } catch (error) {
        console.warn("Web Slicer save failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
  if (message.type === "slicer-list") {
    (async () => {
      try {
        const apiBase = await getApiBase();
        const url = new URL(`${apiBase}/slicer/slices`);
        if (message.url) {
          url.searchParams.set("url", message.url);
        }
        const response = await fetch(url.toString());
        if (!response.ok) {
          throw new Error(`List failed (${response.status})`);
        }
        const data = await response.json();
        sendResponse({ ok: true, slices: data.slices || [] });
      } catch (error) {
        console.warn("Web Slicer list failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
  if (message.type === "slicer-delete") {
    (async () => {
      try {
        const apiBase = await getApiBase();
        const response = await fetch(`${apiBase}/slicer/slices/${message.id}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          throw new Error(`Delete failed (${response.status})`);
        }
        sendResponse({ ok: true });
      } catch (error) {
        console.warn("Web Slicer delete failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
  if (message.type === "slicer-page-html") {
    (async () => {
      try {
        const apiBase = await getApiBase();
        const response = await fetch(`${apiBase}/slicer/pages/${message.pageId}/html`);
        if (!response.ok) {
          throw new Error(`Page HTML failed (${response.status})`);
        }
        const data = await response.json();
        sendResponse({ ok: true, page: data.page });
      } catch (error) {
        console.warn("Web Slicer page html failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
  if (message.type === "slicer-snapshot-html") {
    (async () => {
      try {
        const apiBase = await getApiBase();
        const response = await fetch(`${apiBase}/slicer/snapshots/${message.snapshotId}`);
        if (!response.ok) {
          throw new Error(`Snapshot HTML failed (${response.status})`);
        }
        const data = await response.json();
        sendResponse({ ok: true, snapshot: data.snapshot });
      } catch (error) {
        console.warn("Web Slicer snapshot html failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
  if (message.type === "slicer-page-html-refresh") {
    (async () => {
      try {
        const apiBase = await getApiBase();
        const response = await fetch(`${apiBase}/slicer/pages/html`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(message.payload),
        });
        if (!response.ok) {
          throw new Error(`Page HTML refresh failed (${response.status})`);
        }
        const data = await response.json();
        sendResponse({ ok: true, page: data.page });
      } catch (error) {
        console.warn("Web Slicer page html refresh failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
  if (message.type === "slicer-capture-page") {
    const tabId = message.tabId || sender?.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab id" });
      return true;
    }
    chrome.pageCapture.saveAsMHTML({ tabId }, async (blob) => {
      try {
        if (!blob) {
          throw new Error("No snapshot blob");
        }
        const arrayBuffer = await blob.arrayBuffer();
        let saved = false;
        let saveError = null;
        let saveSkipped = false;
        let fileName = "";
        let folderName = "";
        if (message.saveToDisk) {
          try {
            const settings = await getSettings();
            console.info("[WebSlicer] autoSaveMhtml", settings.autoSaveMhtml);
            if (settings.autoSaveMhtml) {
              await ensureOffscreenDocument();
              const result = await chrome.runtime.sendMessage({
                type: "slicer-offscreen-save-mhtml",
                data: new Uint8Array(arrayBuffer),
                title: message.title,
                url: message.url,
                mime: blob.type,
              });
              if (!result?.ok) {
                throw new Error(result?.error || "Save failed");
              }
              fileName = result.fileName || "";
              folderName = result.folderName || "";
              saved = true;
            } else {
              saveSkipped = true;
            }
          } catch (error) {
            saveError = String(error);
            console.warn("[WebSlicer] MHTML save failed", saveError);
          }
        }
        sendResponse({
          ok: true,
          mime: blob.type || "multipart/related",
          data: new Uint8Array(arrayBuffer),
          saved,
          saveError,
          saveSkipped,
          fileName,
          folderName,
        });
      } catch (error) {
        console.warn("Web Slicer capture failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    });
    return true;
  }
  if (message.type === "slicer-open-saved-mhtml") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const result = await chrome.runtime.sendMessage({
          type: "slicer-offscreen-open-mhtml",
          fileName: message.fileName,
        });
        if (!result?.ok) {
          throw new Error(result?.error || "Open failed");
        }
        sendResponse({
          ok: true,
          mime: result.mime || "multipart/related",
          data: result.data,
        });
      } catch (error) {
        console.warn("Web Slicer open saved MHTML failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
});
