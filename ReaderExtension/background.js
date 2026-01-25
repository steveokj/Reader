const STORAGE_KEY = "reader_api_base";
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

  if (!response.ok) {
    console.warn("[ReaderExt] API request failed", {
      url,
      status: response.status,
      data,
    });
  }

  return { ok: response.ok, status: response.status, data };
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
    console.log("[ReaderExt] Audio upload start", {
      size: payload?.blob?.size ?? null,
      mime: payload?.mime ?? null,
    });
    const formData = new FormData();
    if (payload?.blob) {
      formData.append(
        "file",
        payload.blob,
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
