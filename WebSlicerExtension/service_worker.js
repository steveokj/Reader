const DEFAULT_API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "slicer_api_base";

async function getApiBase() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  return data[STORAGE_KEY] || DEFAULT_API_BASE;
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "slicer-save") {
    return;
  }
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
});
