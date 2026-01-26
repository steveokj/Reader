const STORAGE_KEY = "reader_api_base";
const RELOAD_FLAG_KEY = "reader_reload_pending";
let configApiBasePromise = null;

function loadConfigApiBase() {
  if (configApiBasePromise) {
    return configApiBasePromise;
  }
  configApiBasePromise = (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL("config.json"));
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      if (data && typeof data.apiBase === "string" && data.apiBase.trim()) {
        return data.apiBase.trim();
      }
      return null;
    } catch (error) {
      return null;
    }
  })();
  return configApiBasePromise;
}

async function getApiBase() {
  const stored = await new Promise((resolve) => {
    try {
      chrome.storage.sync.get([STORAGE_KEY], (data) => {
        resolve(typeof data[STORAGE_KEY] === "string" ? data[STORAGE_KEY] : "");
      });
    } catch (error) {
      resolve("");
    }
  });

  if (stored && stored.trim()) {
    return stored.trim();
  }

  const configValue = await loadConfigApiBase();
  return configValue;
}

async function fetchApi(request = {}) {
  const {
    path = "",
    method = "GET",
    headers = {},
    json,
    body,
    responseType = "json",
  } = request;

  const isAbsolute = /^https?:/i.test(path);
  const apiBase = await getApiBase();
  if (!isAbsolute && (!apiBase || !apiBase.trim())) {
    return { ok: false, status: 0, error: "API base not configured" };
  }
  const url = isAbsolute
    ? path
    : `${apiBase}${path.startsWith("/") ? "" : "/"}${path}`;

  const init = {
    method,
    headers: { ...headers },
  };

  if (json !== undefined) {
    init.body = JSON.stringify(json);
    if (!init.headers["Content-Type"]) {
      init.headers["Content-Type"] = "application/json";
    }
  } else if (body !== undefined) {
    init.body = body;
  }

  const response = await fetch(url, init);
  let data = null;

  if (responseType === "text") {
    data = await response.text();
  } else if (responseType === "blob") {
    data = await response.blob();
  } else if (responseType === "arrayBuffer") {
    data = await response.arrayBuffer();
  } else {
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }
  }

  const responseHeaders = {
    "content-type": response.headers.get("content-type") || "",
  };

  if (!response.ok) {
    console.warn("[ReaderExt] API request failed", {
      url,
      status: response.status,
      data,
    });
  }

  return { ok: response.ok, status: response.status, data, headers: responseHeaders };
}

async function handleApiRequest(request) {
  try {
    return await fetchApi(request);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.message || "Request failed",
    };
  }
}

async function handleAudioUpload(payload) {
  try {
    const buffer = payload?.buffer;
    const dataUrl = payload?.dataUrl;
    const extractArrayBuffer = (value) => {
      if (!value) {
        return null;
      }
      if (value instanceof ArrayBuffer) {
        return value;
      }
      if (ArrayBuffer.isView(value)) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      }
      if (value.buffer instanceof ArrayBuffer) {
        const byteOffset = value.byteOffset || 0;
        const byteLength = value.byteLength || value.buffer.byteLength;
        return value.buffer.slice(byteOffset, byteOffset + byteLength);
      }
      if (Array.isArray(value)) {
        return Uint8Array.from(value).buffer;
      }
      if (Array.isArray(value.data)) {
        return Uint8Array.from(value.data).buffer;
      }
      return null;
    };
    let arrayBuffer = extractArrayBuffer(buffer);
    if (!arrayBuffer && typeof dataUrl === "string" && dataUrl.startsWith("data:")) {
      try {
        const base64 = dataUrl.split(",")[1] || "";
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer;
      } catch (error) {
        arrayBuffer = null;
      }
    }
    const blob =
      payload?.blob instanceof Blob
        ? payload.blob
        : arrayBuffer
          ? new Blob([arrayBuffer], { type: payload?.mime || "audio/webm" })
          : null;
    console.log("[ReaderExt] Audio upload start", {
      size: blob?.size ?? null,
      mime: payload?.mime ?? null,
      hasBuffer: Boolean(buffer),
      bufferBytes: arrayBuffer?.byteLength ?? null,
      hasDataUrl: Boolean(dataUrl),
    });
    if (!blob || !blob.size) {
      return { ok: false, status: 0, error: "Audio payload is empty" };
    }
    const formData = new FormData();
    if (blob) {
      formData.append(
        "file",
        blob,
        payload.fileName || "recording.webm"
      );
    }
    if (payload?.mime) {
      formData.append("mime", payload.mime);
    }
    return await fetchApi({
      path: "/media/audio",
      method: "POST",
      body: formData,
      responseType: "json",
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.message || "Upload failed",
    };
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

async function handleMediaFetch(payload) {
  try {
    const path = payload?.path || "";
    if (!path) {
      return { ok: false, status: 0, error: "Missing media path" };
    }
    const result = await fetchApi({ path, responseType: "arrayBuffer" });
    if (!result.ok || !result.data) {
      return {
        ok: false,
        status: result.status || 0,
        error: "Failed to fetch media",
      };
    }
    const bytes = new Uint8Array(result.data);
    if (!bytes.length) {
      return { ok: false, status: result.status || 0, error: "Empty media response" };
    }
    const contentType = result.headers?.["content-type"] || "application/octet-stream";
    const base64 = arrayBufferToBase64(bytes);
    const dataUrl = `data:${contentType};base64,${base64}`;
    return { ok: true, dataUrl, size: bytes.byteLength, contentType };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error?.message || "Media fetch failed",
    };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "reader:api") {
    handleApiRequest(message.request).then(sendResponse);
    return true;
  }

  if (message.type === "reader:getApiBase") {
    getApiBase().then((apiBase) => {
      sendResponse({ ok: true, apiBase });
    });
    return true;
  }

  if (message.type === "reader:uploadAudio") {
    handleAudioUpload(message).then(sendResponse);
    return true;
  }

  if (message.type === "reader:fetchMedia") {
    handleMediaFetch(message).then(sendResponse);
    return true;
  }

  if (message.type === "reader:debugApiBase") {
    getApiBase().then((apiBase) => {
      sendResponse({ ok: true, apiBase });
    });
    return true;
  }
});

async function consumeReloadFlag() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([RELOAD_FLAG_KEY], (data) => {
        const pending = Boolean(data?.[RELOAD_FLAG_KEY]);
        if (!pending) {
          resolve(false);
          return;
        }
        chrome.storage.local.remove([RELOAD_FLAG_KEY], () => {
          resolve(true);
        });
      });
    } catch (error) {
      resolve(false);
    }
  });
}

async function reloadActiveTabIfPending(source) {
  const pending = await consumeReloadFlag();
  if (!pending) {
    return;
  }
  console.log("[ReaderExt] Reload pending; refreshing active tab", source);
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      return;
    }
    chrome.tabs.reload(tabId);
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== "reader:reload") {
    return;
  }
  console.log("[ReaderExt] Reload command triggered");
  chrome.storage.local.set({ [RELOAD_FLAG_KEY]: true }, () => {
    chrome.runtime.reload();
  });
});

chrome.action.onClicked.addListener((tab) => {
  console.log("[ReaderExt] action icon clicked", tab?.id);
  if (!tab?.id) {
    console.warn("[ReaderExt] No active tab for action click");
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "reader:toggleNav" }, (response) => {
    const error = chrome.runtime.lastError;
    if (error) {
      console.warn("[ReaderExt] Toggle nav failed", error.message);
      return;
    }
    console.log("[ReaderExt] Toggle nav response", response);
  });
});

chrome.runtime.onInstalled.addListener(() => {
  void reloadActiveTabIfPending("installed");
});

chrome.runtime.onStartup.addListener(() => {
  void reloadActiveTabIfPending("startup");
});

void reloadActiveTabIfPending("boot");
