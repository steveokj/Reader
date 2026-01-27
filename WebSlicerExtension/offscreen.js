const HANDLE_DB = "web-slicer-storage";
const HANDLE_STORE = "handles";
const HANDLE_KEY = "mhtml-folder";

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

function toArrayBuffer(data) {
  if (!data) {
    return new ArrayBuffer(0);
  }
  if (data instanceof ArrayBuffer) {
    return data;
  }
  if (ArrayBuffer.isView(data)) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (Array.isArray(data)) {
    return Uint8Array.from(data).buffer;
  }
  if (data?.data) {
    return toArrayBuffer(data.data);
  }
  return new TextEncoder().encode(String(data)).buffer;
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

async function ensurePermission(handle) {
  const permission = await handle.queryPermission({ mode: "readwrite" });
  return permission === "granted";
}

async function saveMhtml(data, title, url, mime) {
  const handle = await getFolderHandle();
  if (!handle) {
    throw new Error("No MHTML folder configured");
  }
  const allowed = await ensurePermission(handle);
  if (!allowed) {
    throw new Error("MHTML folder permission not granted (re-pick folder in Options)");
  }
  const fileName = buildMhtmlFileName(title, url);
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const buffer = toArrayBuffer(data);
  await writable.write(new Blob([buffer], { type: mime || "multipart/related" }));
  await writable.close();
  return { fileName, folderName: handle.name || "" };
}

async function openMhtml(fileName) {
  const handle = await getFolderHandle();
  if (!handle) {
    throw new Error("No MHTML folder configured");
  }
  const fileHandle = await handle.getFileHandle(fileName);
  const file = await fileHandle.getFile();
  const arrayBuffer = await file.arrayBuffer();
  return { data: arrayBuffer, mime: file.type || "multipart/related" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) {
    return;
  }
  if (message.type === "slicer-offscreen-save-mhtml") {
    (async () => {
      try {
        const result = await saveMhtml(
          message.data,
          message.title,
          message.url,
          message.mime
        );
        sendResponse({ ok: true, ...result });
      } catch (error) {
        console.warn("Offscreen save failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
  if (message.type === "slicer-offscreen-open-mhtml") {
    (async () => {
      try {
        const result = await openMhtml(message.fileName);
        sendResponse({ ok: true, ...result });
      } catch (error) {
        console.warn("Offscreen open failed", error);
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true;
  }
});
