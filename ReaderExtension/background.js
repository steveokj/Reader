const DEFAULT_API_BASE = "https://192.168.2.34:8002";
const STORAGE_KEY = "reader_api_base";

function getApiBase() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get([STORAGE_KEY], (data) => {
        resolve(data[STORAGE_KEY] || DEFAULT_API_BASE);
      });
    } catch (error) {
      resolve(DEFAULT_API_BASE);
    }
  });
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

  const apiBase = await getApiBase();
  const url = /^https?:/i.test(path)
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

  if (message.type === "reader:uploadAudio") {
    handleAudioUpload(message).then(sendResponse);
    return true;
  }
});
