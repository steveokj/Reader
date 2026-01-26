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

async function getApiBase() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  if (data[STORAGE_KEY]) {
    return data[STORAGE_KEY];
  }
  const config = await getConfig();
  return config.api_base || "";
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
  chrome.tabs.sendMessage(tab.id, { type: "slicer-toggle" });
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
});
