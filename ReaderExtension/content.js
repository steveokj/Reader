(() => {
  const NAV_SWIPE_ZONE_HEIGHT = 120;
  const NAV_SWIPE_MIN_PX = 60;
  const NAV_SWIPE_MAX_MS = 1200;
  const DOUBLE_CLICK_WINDOW_MS = 4000;

  const DEBUG = true;
  const log = (...args) => {
    if (DEBUG) {
      console.log("[ReaderExt]", ...args);
    }
  };

  const EXPLORE_IMAGE_URL_REGEX =
    /https?:\/\/[^\s)]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]+)?/gi;
  const EXPLORE_MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;

  const EXPLORE_DEFAULT_MODEL = "gpt-5.2-codex";
  const EXPLORE_DEFAULT_REASONING = "medium";
  const EXPLORE_REASONING_LEVELS = [
    { value: "none", label: "None" },
    { value: "minimal", label: "Minimal" },
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
    { value: "xhigh", label: "Extra high" },
  ];
  const EXPLORE_MODEL_OPTIONS = [
    {
      id: "gpt-5.2-codex",
      label: "gpt-5.2-codex",
      reasoning_levels: ["low", "medium", "high", "xhigh"],
      default_reasoning: "medium",
    },
    {
      id: "gpt-5.2",
      label: "gpt-5.2",
      reasoning_levels: ["low", "medium", "high", "xhigh"],
      default_reasoning: "medium",
    },
  ];

  const state = {
    selection: null,
    selectionId: null,
    isSaving: false,
    isCommitted: false,
    markerIds: new Map(),
    anchorRange: null,
    anchorTimer: null,
    navOpen: false,
    noteModalOpen: false,
    modalSelectionOverride: null,
    modalSource: null,
    modalHideMarkers: false,
    navSwipeStart: null,
    highlightsPanelOpen: false,
    highlightsTab: "selections",
    highlightsLoading: false,
    showHighlightsOnPage: true,
    highlightsData: {
      bundles: [],
      additions: [],
      markers: [],
      selectionById: new Map(),
      additionById: new Map(),
    },
    highlightDetail: null,
    lastInteraction: null,
  };

  const exploreState = {
    open: false,
    messages: [],
    draft: "",
    threadId: null,
    contextText: "",
    error: "",
    isSubmitting: false,
    storageKey: "",
    anchorSelectionId: null,
    anchorSelector: null,
    anchorText: "",
    anchorUrl: "",
    anchorTitle: "",
    quoteText: "",
  };

  const exploreSettings = {
    loaded: false,
    systemPrompt: "",
    model: "",
    reasoning: "",
    availableModels: [],
    reasoningLevels: [],
    showPanel: false,
    draft: null,
    forceNewThread: false,
    badgeText: "",
    badgeTimeout: null,
  };

  const artifactState = {
    additionId: null,
    selectionId: null,
    contextText: "",
    kind: "explore",
    markers: [],
  };

  let exploreMessageCounter = 0;

  async function sendBackgroundMessage(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (response) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            resolve({ ok: false, status: 0, error: lastError.message });
            return;
          }
          if (!response) {
            resolve({ ok: false, status: 0, error: "No response from background" });
            return;
          }
          resolve(response);
        });
      } catch (error) {
        resolve({
          ok: false,
          status: 0,
          error: error?.message || "Failed to send message",
        });
      }
    });
  }

  async function apiRequest(request) {
    return sendBackgroundMessage("reader:api", { request });
  }

  async function uploadAudioBlob(blob, mime) {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    const dataUrl = await blobToDataUrl(blob);
    return sendBackgroundMessage("reader:uploadAudio", {
      buffer,
      dataUrl,
      mime,
      fileName: "recording.webm",
    });
  }

  let apiBaseCache = null;
  async function getApiBaseFromBackground() {
    if (apiBaseCache !== null) {
      return apiBaseCache;
    }
    const result = await sendBackgroundMessage("reader:getApiBase", {});
    apiBaseCache = result?.apiBase || "";
    return apiBaseCache;
  }

  const overlay = mountOverlay();
  const actionMenu = buildActionMenu();
  const noteModal = buildNoteModal();
  const grammarModal = buildGrammarModal();
  const audioModal = buildAudioModal();
  const exploreModal = buildExploreModal();
  const mobileNav = buildMobileNav();
  const highlightsPanel = buildHighlightsPanel();
  const highlightDetailModal = buildHighlightDetailModal();
  const artifactMenu = buildArtifactMenu();

  overlay.root.appendChild(actionMenu.el);
  overlay.root.appendChild(noteModal.el);
  overlay.root.appendChild(mobileNav.el);
  overlay.root.appendChild(grammarModal.el);
  overlay.root.appendChild(audioModal.el);
  overlay.root.appendChild(exploreModal.el);
  overlay.root.appendChild(highlightsPanel.el);
  overlay.root.appendChild(highlightDetailModal.el);
  overlay.root.appendChild(artifactMenu.el);

  hideActionMenu();
  hideNoteModal();
  hideMobileNav();
  hideGrammarModal();
  hideAudioModal();
  hideExploreModal();
  hideHighlightsPanel();
  hideHighlightDetailModal();
  hideArtifactMenu();
  updateNavButtons();

  document.addEventListener("mouseup", handleMouseUp, true);
  document.addEventListener("dblclick", handleDoubleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("mousedown", handleDocumentMouseDown);
  document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message !== "object") {
        return;
      }
      if (message.type === "reader:toggleNav") {
        log("Toolbar toggle received");
        if (state.navOpen) {
          hideMobileNav();
        } else {
          showMobileNav();
        }
        sendResponse?.({ ok: true, navOpen: state.navOpen });
        return true;
      }
    });
  }

  if (state.showHighlightsOnPage) {
    refreshHighlightsData({ silent: true });
  }

  function mountOverlay() {
    const host = document.createElement("div");
    host.id = "reader-extension-host";
    const shadow = host.attachShadow({ mode: "open" });

    const legacy = document.getElementById("reader-extension-style");
    if (legacy) {
      legacy.remove();
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("overlay.css");
    link.addEventListener("error", (error) => {
      console.warn("Reader extension failed to load CSS", error);
    });
    shadow.appendChild(link);

    const root = document.createElement("div");
    root.className = "reader-extension-ui";
    shadow.appendChild(root);

    (document.body || document.documentElement).appendChild(host);

    log("Overlay mounted");

    return { host, shadow, root };
  }

  function buildActionMenu() {
    const el = document.createElement("div");
    el.className = "action-menu";

    const meta = document.createElement("div");
    meta.className = "action-menu__meta";

    const metaLeft = document.createElement("div");
    metaLeft.className = "action-menu__meta-left";

    const commit = document.createElement("button");
    commit.className = "action-menu__commit";
    commit.type = "button";
    commit.title = "Save selection";
    commit.innerHTML = iconCheck();

    const status = document.createElement("span");
    status.textContent = "Not saved";

    metaLeft.appendChild(commit);
    metaLeft.appendChild(status);

    const close = document.createElement("button");
    close.className = "action-menu__icon";
    close.type = "button";
    close.title = "Close";
    close.innerHTML = iconClose();

    meta.appendChild(metaLeft);
    meta.appendChild(close);

    const markers = document.createElement("div");
    markers.className = "action-menu__markers";
    markers.appendChild(buildMarkerToggle(true));

    const actions = document.createElement("div");
    actions.className = "action-menu__actions";

    const actionButtons = {
      note: createActionButton(iconNote(), "Note"),
      audio: createActionButton(iconAudio(), "Audio"),
      copy: createActionButton(iconCopy(), "Copy"),
      explore: createActionButton(iconExplore(), "Explore"),
      grammar: createActionButton(iconGrammar(), "Grammar"),
      more: createActionButton(iconMore(), "More"),
      map: createActionButton(iconMap(), "Map"),
    };

    Object.values(actionButtons).forEach((button) => actions.appendChild(button));

    el.appendChild(meta);
    el.appendChild(markers);
    el.appendChild(actions);

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("mouseup", stopPropagation);
    el.addEventListener("click", stopPropagation);
    el.addEventListener("click", (event) => {
      log("Action menu click", event.target);
    });

    commit.addEventListener("click", async () => {
      log("Commit selection clicked");
      await commitSelection();
    });

    close.addEventListener("click", () => {
      log("Close action menu clicked");
      clearSelection();
      hideActionMenu();
    });

    actionButtons.note.addEventListener("click", () => {
      log("Note action clicked");
      openNoteModal();
    });

    actionButtons.copy.addEventListener("click", async () => {
      log("Copy action clicked");
      if (state.selection) {
        try {
          await navigator.clipboard.writeText(state.selection.text);
        } catch (error) {
          console.warn("Reader extension copy failed", error);
        }
      }
    });

    actionButtons.explore.addEventListener("click", () => {
      log("Explore action clicked");
      openExploreModal();
    });

    actionButtons.audio.addEventListener("click", () => {
      log("Audio action clicked");
      openAudioModal();
    });

    actionButtons.grammar.addEventListener("click", () => {
      log("Grammar action clicked");
      openGrammarModal();
    });

    actionButtons.map.addEventListener("click", () => {
      log("Map action clicked");
      handleMapAction();
    });

    actionButtons.more.addEventListener("click", () => {
      log("More action clicked");
      openOptionsPage();
    });

    return { el, commit, status, markers, actionButtons };
  }

  function buildArtifactMenu() {
    const el = document.createElement("div");
    el.className = "action-menu action-menu--artifact";

    const meta = document.createElement("div");
    meta.className = "action-menu__meta";

    const metaLeft = document.createElement("div");
    metaLeft.className = "action-menu__meta-left";
    const label = document.createElement("span");
    label.textContent = "Explore response";
    metaLeft.appendChild(label);

    const close = document.createElement("button");
    close.className = "action-menu__icon";
    close.type = "button";
    close.title = "Close";
    close.innerHTML = iconClose();

    meta.appendChild(metaLeft);
    meta.appendChild(close);

    const markers = document.createElement("div");
    markers.className = "action-menu__markers";

    const text = document.createElement("div");
    text.className = "action-menu__text";

    const actions = document.createElement("div");
    actions.className = "action-menu__actions";

    const buttons = {
      note: createActionButton(iconNote(), "Note"),
      audio: createActionButton(iconAudio(), "Audio"),
      explore: createActionButton(iconExplore(), "Explore"),
      more: createActionButton(iconMore(), "More"),
    };

    buttons.more.disabled = true;

    Object.values(buttons).forEach((button) => actions.appendChild(button));

    el.appendChild(meta);
    el.appendChild(markers);
    el.appendChild(text);
    el.appendChild(actions);

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("mouseup", stopPropagation);
    el.addEventListener("click", stopPropagation);

    close.addEventListener("click", () => {
      hideArtifactMenu();
    });

    buttons.note.addEventListener("click", () => {
      handleArtifactAction("note");
    });
    buttons.audio.addEventListener("click", () => {
      handleArtifactAction("audio");
    });
    buttons.explore.addEventListener("click", () => {
      handleArtifactAction("explore");
    });

    return { el, label, markers, text, buttons };
  }

  function buildNoteModal() {
    const el = document.createElement("div");
    el.className = "modal-backdrop";

    const card = document.createElement("div");
    card.className = "modal-card";

    const header = document.createElement("div");
    header.className = "modal-header";

    const title = document.createElement("h2");
    title.textContent = "New note";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";

    header.appendChild(title);
    header.appendChild(close);

    const markers = document.createElement("div");
    markers.className = "modal-markers";
    markers.appendChild(buildMarkerToggle(true));

    const textarea = document.createElement("textarea");
    textarea.className = "modal-textarea";
    textarea.placeholder = "Write your note...";

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary";
    cancel.textContent = "Cancel";

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save note";

    actions.appendChild(cancel);
    actions.appendChild(save);

    card.appendChild(header);
    card.appendChild(markers);
    card.appendChild(textarea);
    card.appendChild(actions);
    el.appendChild(card);

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("click", stopPropagation);

    cancel.addEventListener("click", () => {
      hideNoteModal();
    });
    close.addEventListener("click", () => {
      hideNoteModal();
    });
    save.addEventListener("click", async () => {
      await saveNote(textarea.value);
      hideNoteModal();
    });

    return { el, textarea, title, markers };
  }

  function buildGrammarModal() {
    const el = document.createElement("div");
    el.className = "modal-backdrop";

    const card = document.createElement("div");
    card.className = "modal-card";

    const header = document.createElement("div");
    header.className = "modal-header";

    const title = document.createElement("h2");
    title.textContent = "Grammar";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";

    header.appendChild(title);
    header.appendChild(close);

    const markers = document.createElement("div");
    markers.className = "modal-markers";
    markers.appendChild(buildMarkerToggle(true));

    const grid = document.createElement("div");
    grid.className = "modal-icon-grid";

    const buttons = {
      word: createModalIconButton(iconWord(), "Word"),
      bars: createModalIconButton(iconBars(), "Bars"),
      structure: createModalIconButton(iconStructure(), "Structure"),
      lookup: createModalIconButton(iconLookup(), "Lookup"),
    };

    Object.values(buttons).forEach((button) => grid.appendChild(button));

    card.appendChild(header);
    card.appendChild(markers);
    card.appendChild(grid);
    el.appendChild(card);

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("click", stopPropagation);

    close.addEventListener("click", () => {
      hideGrammarModal();
    });

    buttons.word.addEventListener("click", async () => {
      const trimmed = getSelectionTextTrimmed();
      if (!trimmed) {
        return;
      }
      await saveGrammar({ kind: "word", text: trimmed });
      const lookupUrl = buildLookupUrl(trimmed);
      if (lookupUrl) {
        window.open(lookupUrl, "_blank", "noopener,noreferrer");
      }
      hideGrammarModal();
    });

    buttons.bars.addEventListener("click", async () => {
      const raw = getSelectionTextRaw();
      if (!raw) {
        return;
      }
      await saveGrammar({ kind: "bars", text: raw });
      hideGrammarModal();
    });

    buttons.structure.addEventListener("click", async () => {
      const raw = getSelectionTextRaw();
      if (!raw) {
        return;
      }
      await saveGrammar({ kind: "structure", text: raw });
      hideGrammarModal();
    });

    buttons.lookup.addEventListener("click", async () => {
      const trimmed = getSelectionTextTrimmed();
      if (!trimmed) {
        return;
      }
      const lookupUrl = buildLookupUrl(trimmed);
      await saveGrammar({ kind: "lookup", text: trimmed, lookup_url: lookupUrl });
      if (lookupUrl) {
        window.open(lookupUrl, "_blank", "noopener,noreferrer");
      }
      hideGrammarModal();
    });

    const updateButtons = () => {
      const disabled = !getSelectionTextTrimmed();
      Object.values(buttons).forEach((button) => {
        button.disabled = disabled;
      });
    };

    return { el, updateButtons };
  }

  function buildAudioModal() {
    const el = document.createElement("div");
    el.className = "modal-backdrop";

    const card = document.createElement("div");
    card.className = "modal-card";

    const header = document.createElement("div");
    header.className = "modal-header";

    const spacer = document.createElement("span");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "modal-icon";
    close.innerHTML = iconClose();

    header.appendChild(spacer);
    header.appendChild(close);

    const markers = document.createElement("div");
    markers.className = "modal-markers";
    markers.appendChild(buildMarkerToggle(true));

    const section = document.createElement("div");
    section.className = "modal-section";

    const status = document.createElement("div");
    status.className = "audio-status";

    const dot = document.createElement("span");
    dot.className = "idle-dot";

    const timer = document.createElement("span");
    timer.className = "audio-timer";
    timer.textContent = "0:00";

    status.appendChild(dot);
    status.appendChild(timer);

    const controls = document.createElement("div");
    controls.className = "audio-recorder";

    const record = createAudioControl(iconRecord(), "Start", "Start recording");
    const pause = createAudioControl(iconPause(), "Pause", "Pause recording");
    const stop = createAudioControl(iconStop(), "Stop", "Stop recording");
    const restart = createAudioControl(iconRestart(), "Restart", "Restart recording", "secondary");
    const clear = createAudioControl(iconClear(), "Clear", "Clear recording", "secondary");
    const save = createAudioControl(iconSave(), "Save", "Save recording");

    controls.appendChild(record);
    controls.appendChild(pause);
    controls.appendChild(stop);
    controls.appendChild(restart);
    controls.appendChild(clear);
    controls.appendChild(save);

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.style.display = "none";

    const error = document.createElement("div");
    error.className = "modal-hint";
    error.style.display = "none";

    section.appendChild(status);
    section.appendChild(controls);
    section.appendChild(audio);
    section.appendChild(error);

    card.appendChild(header);
    card.appendChild(markers);
    card.appendChild(section);
    el.appendChild(card);

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("click", stopPropagation);

    let recorder = null;
    let stream = null;
    let chunks = [];
    let audioBlob = null;
    let audioUrl = null;
    let elapsed = 0;
    let timerId = null;
    let mode = "idle";

    const updateTimer = () => {
      timer.textContent = formatTime(elapsed);
    };

    const setError = (message) => {
      if (!message) {
        error.style.display = "none";
        error.textContent = "";
        return;
      }
      error.textContent = message;
      error.style.display = "block";
    };

    const stopTracks = () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      stream = null;
    };

    const resetAudio = () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      audioUrl = null;
      audioBlob = null;
      audio.src = "";
      audio.style.display = "none";
      chunks = [];
      elapsed = 0;
      updateTimer();
    };

    const setMode = (nextMode) => {
      mode = nextMode;
      const showRecorded = mode === "recorded" || mode === "uploading";
      record.style.display = mode === "idle" ? "" : "none";
      pause.style.display = mode === "recording" || mode === "paused" ? "" : "none";
      stop.style.display = mode === "recording" || mode === "paused" ? "" : "none";
      restart.style.display = showRecorded ? "" : "none";
      clear.style.display = showRecorded ? "" : "none";
      save.style.display = showRecorded ? "" : "none";

      if (mode === "recording") {
        pause.innerHTML = iconPause();
        pause.title = "Pause";
        pause.setAttribute("aria-label", "Pause recording");
      } else if (mode === "paused") {
        pause.innerHTML = iconPlay();
        pause.title = "Resume";
        pause.setAttribute("aria-label", "Resume recording");
      }

      const isRecording = mode === "recording";
      dot.className = isRecording ? "pulse-dot" : "idle-dot";

      const isUploading = mode === "uploading";
      [record, pause, stop, restart, clear, save].forEach((button) => {
        button.disabled = isUploading;
      });

      if (mode === "recording") {
        if (!timerId) {
          timerId = window.setInterval(() => {
            elapsed += 1;
            updateTimer();
          }, 1000);
        }
      } else if (timerId) {
        window.clearInterval(timerId);
        timerId = null;
      }
    };

    const pickMimeType = () => {
      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
        return "";
      }
      return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    };

    const handleStart = async () => {
      log("Audio start");
      setError("");
      resetAudio();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = pickMimeType();
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        log("Audio recorder started", { mimeType: recorder.mimeType });
        recorder.ondataavailable = (event) => {
          log("Audio chunk", { size: event.data.size });
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onstop = () => {
          audioBlob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
          log("Audio blob built", { size: audioBlob.size, type: audioBlob.type });
          if (!audioBlob.size) {
            setError("Recording is empty. Try again.");
            setMode("idle");
            stopTracks();
            return;
          }
          audioUrl = URL.createObjectURL(audioBlob);
          audio.src = audioUrl;
          audio.style.display = "block";
          audio.load();
          ensureAudioDuration(audio);
          setMode("recorded");
          stopTracks();
        };
        recorder.start(500);
        setMode("recording");
      } catch (err) {
        setError("Microphone access denied or unavailable.");
        stopTracks();
        setMode("idle");
      }
    };

    const handleStop = () => {
      log("Audio stop");
      if (recorder && (mode === "recording" || mode === "paused")) {
        try {
          recorder.requestData();
        } catch (error) {
          log("Audio requestData failed", error);
        }
        recorder.stop();
      }
    };

    const handleTogglePause = () => {
      log("Audio toggle pause", mode);
      if (!recorder) {
        return;
      }
      if (mode === "recording") {
        recorder.pause();
        setMode("paused");
      } else if (mode === "paused") {
        recorder.resume();
        setMode("recording");
      }
    };

    const handleRestart = () => {
      log("Audio restart");
      if (mode === "recording" || mode === "paused") {
        handleStop();
      }
      stopTracks();
      resetAudio();
      setMode("idle");
    };

    const handleClear = () => {
      log("Audio clear");
      resetAudio();
      clearSelection();
      hideActionMenu();
      setMode("idle");
    };

    const handleUpload = async () => {
      log("Audio upload");
      if (!audioBlob) {
        return;
      }
      if (audioBlob.size === 0) {
        log("Audio upload blocked: empty blob");
        setError("Recording is empty. Try again.");
        setMode("recorded");
        return;
      }
      setMode("uploading");
      setError("");

      try {
        const mime = audioBlob.type || "audio/webm";
        log("Audio upload blob", { size: audioBlob.size, mime });
        const result = await uploadAudioBlob(audioBlob, mime);
        if (!result.ok) {
          console.warn("[ReaderExt] Audio upload failed", result);
          const debug = await sendBackgroundMessage("reader:debugApiBase", {});
          log("Audio upload debug", debug);
          throw new Error(result.error || "Upload failed");
        }
        const data = result.data;
        await saveAudio(data);
        hideActionMenu();
        hideAudioModal();
      } catch (err) {
        setError("Upload failed. Please try again.");
        setMode("recorded");
      }
    };

    const handleClose = () => {
      log("Audio close");
      resetModal();
      hideAudioModal();
    };

    record.addEventListener("click", handleStart);
    pause.addEventListener("click", handleTogglePause);
    stop.addEventListener("click", handleStop);
    restart.addEventListener("click", handleRestart);
    clear.addEventListener("click", handleClear);
    save.addEventListener("click", handleUpload);
    close.addEventListener("click", handleClose);

    const resetModal = () => {
      if (recorder && (mode === "recording" || mode === "paused")) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.stop();
      }
      recorder = null;
      stopTracks();
      if (timerId) {
        window.clearInterval(timerId);
        timerId = null;
      }
      setError("");
      resetAudio();
      setMode("idle");
    };

    return { el, resetModal, markers };
  }

  function buildExploreModal() {
    const el = document.createElement("div");
    el.className = "explore-chat-modal";

    const panel = document.createElement("div");
    panel.className = "explore-chat-modal__panel";

    const header = document.createElement("div");
    header.className = "explore-chat-modal__header";

    const title = document.createElement("div");
    title.className = "explore-chat-modal__title";
    title.textContent = "Explore";

    const headerActions = document.createElement("div");
    headerActions.className = "explore-chat-modal__actions";

    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "explore-chat-modal__settings";
    settings.innerHTML = iconSettings();

    const close = document.createElement("button");
    close.type = "button";
    close.className = "explore-chat-modal__close";
    close.innerHTML = iconClose();

    headerActions.appendChild(settings);
    headerActions.appendChild(close);

    header.appendChild(title);
    header.appendChild(headerActions);

    const badge = document.createElement("div");
    badge.className = "explore-chat-modal__badge";
    badge.style.display = "none";

    const settingsPanel = document.createElement("div");
    settingsPanel.className = "explore-settings";
    settingsPanel.style.display = "none";

    const promptField = document.createElement("div");
    promptField.className = "explore-settings__field";
    const promptLabel = document.createElement("label");
    promptLabel.textContent = "System prompt";
    const promptInput = document.createElement("textarea");
    promptInput.className = "explore-settings__textarea";
    promptField.appendChild(promptLabel);
    promptField.appendChild(promptInput);

    const modelField = document.createElement("div");
    modelField.className = "explore-settings__field";
    const modelLabel = document.createElement("label");
    modelLabel.textContent = "Model";
    const modelSelect = document.createElement("select");
    modelSelect.className = "explore-settings__select";
    modelField.appendChild(modelLabel);
    modelField.appendChild(modelSelect);

    const reasoningField = document.createElement("div");
    reasoningField.className = "explore-settings__field";
    const reasoningLabel = document.createElement("label");
    reasoningLabel.textContent = "Reasoning level";
    const reasoningSelect = document.createElement("select");
    reasoningSelect.className = "explore-settings__select";
    reasoningField.appendChild(reasoningLabel);
    reasoningField.appendChild(reasoningSelect);

    const settingsActions = document.createElement("div");
    settingsActions.className = "explore-settings__actions";
    const settingsCancel = document.createElement("button");
    settingsCancel.type = "button";
    settingsCancel.className = "secondary";
    settingsCancel.textContent = "Cancel";
    const settingsSave = document.createElement("button");
    settingsSave.type = "button";
    settingsSave.textContent = "Save settings";
    settingsActions.appendChild(settingsCancel);
    settingsActions.appendChild(settingsSave);

    settingsPanel.appendChild(promptField);
    settingsPanel.appendChild(modelField);
    settingsPanel.appendChild(reasoningField);
    settingsPanel.appendChild(settingsActions);

    const context = document.createElement("div");
    context.className = "explore-chat-modal__context";

    const contextLabel = document.createElement("div");
    contextLabel.className = "explore-chat-modal__context-label";
    contextLabel.textContent = "Context";

    const contextText = document.createElement("div");
    contextText.className = "explore-chat-modal__context-text";

    const contextClear = document.createElement("button");
    contextClear.type = "button";
    contextClear.className = "explore-chat-modal__context-clear";
    contextClear.textContent = "Clear";

    context.appendChild(contextLabel);
    context.appendChild(contextText);
    context.appendChild(contextClear);

    const messages = document.createElement("div");
    messages.className = "chat-messages";

    const error = document.createElement("div");
    error.className = "explore-chat-modal__error";
    error.style.display = "none";

    const quoteRow = document.createElement("div");
    quoteRow.className = "explore-quote";
    quoteRow.style.display = "none";

    const quotePill = document.createElement("div");
    quotePill.className = "explore-quote__pill";

    const quoteLabel = document.createElement("span");
    quoteLabel.className = "explore-quote__label";
    quoteLabel.textContent = "Quote";

    const quoteText = document.createElement("span");
    quoteText.className = "explore-quote__text";

    quotePill.appendChild(quoteLabel);
    quotePill.appendChild(quoteText);

    const quoteClear = document.createElement("button");
    quoteClear.type = "button";
    quoteClear.className = "explore-quote__clear";
    quoteClear.innerHTML = iconClose();

    quoteRow.appendChild(quotePill);
    quoteRow.appendChild(quoteClear);

    const form = document.createElement("form");
    form.className = "chat-input";

    const textarea = document.createElement("textarea");
    textarea.className = "chat-textarea";
    textarea.placeholder = "Ask a question";
    textarea.rows = 1;
    textarea.setAttribute("aria-label", "Explore message");

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "explore-chat-modal__submit";
    submit.title = "Send";
    submit.setAttribute("aria-label", "Send message");
    submit.innerHTML = iconSend();

    form.appendChild(textarea);
    form.appendChild(submit);

    panel.appendChild(header);
    panel.appendChild(badge);
    panel.appendChild(settingsPanel);
    panel.appendChild(context);
    panel.appendChild(messages);
    panel.appendChild(error);
    panel.appendChild(quoteRow);
    panel.appendChild(form);

    el.appendChild(panel);

    const zoom = document.createElement("div");
    zoom.className = "explore-chat-modal__zoom";
    zoom.style.display = "none";

    const zoomImg = document.createElement("img");
    zoomImg.alt = "Explore image";

    const zoomClose = document.createElement("button");
    zoomClose.type = "button";
    zoomClose.className = "explore-chat-modal__zoom-close";
    zoomClose.innerHTML = iconClose();

    zoom.appendChild(zoomImg);
    zoom.appendChild(zoomClose);
    el.appendChild(zoom);

    el.addEventListener("click", () => {
      closeExploreModal();
    });
    panel.addEventListener("click", stopPropagation);

    close.addEventListener("click", () => {
      closeExploreModal();
    });

    settings.addEventListener("click", () => {
      toggleExploreSettingsPanel();
    });

    contextClear.addEventListener("click", () => {
      exploreState.contextText = "";
      renderExploreContext();
    });

    textarea.addEventListener("input", (event) => {
      exploreState.draft = event.target.value;
      updateExploreSubmit();
      persistExploreSession();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
        return;
      }
      event.preventDefault();
      if (!exploreState.isSubmitting && exploreState.draft.trim()) {
        void handleExploreSubmit();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void handleExploreSubmit();
    });

    quoteClear.addEventListener("click", () => {
      clearExploreQuote();
    });

    promptInput.addEventListener("input", (event) => {
      if (!exploreSettings.draft) {
        return;
      }
      exploreSettings.draft.systemPrompt = event.target.value;
    });

    modelSelect.addEventListener("change", (event) => {
      if (!exploreSettings.draft) {
        return;
      }
      exploreSettings.draft.model = event.target.value;
      const allowed = getExploreReasoningLevels(exploreSettings.draft.model);
      if (allowed.length && !allowed.some((level) => level.value === exploreSettings.draft.reasoning)) {
        exploreSettings.draft.reasoning = getExploreDefaultReasoning(exploreSettings.draft.model);
      }
      renderExploreSettingsPanel();
    });

    reasoningSelect.addEventListener("change", (event) => {
      if (!exploreSettings.draft) {
        return;
      }
      exploreSettings.draft.reasoning = event.target.value;
    });

    settingsCancel.addEventListener("click", () => {
      toggleExploreSettingsPanel(false);
    });

    settingsSave.addEventListener("click", () => {
      void handleExploreSettingsSave();
    });

    zoomClose.addEventListener("click", () => {
      hideExploreZoom();
    });
    zoom.addEventListener("click", (event) => {
      if (event.target === zoom) {
        hideExploreZoom();
      }
    });

    return {
      el,
      panel,
      badge,
      settingsPanel,
      settingsButton: settings,
      settingsPrompt: promptInput,
      settingsModel: modelSelect,
      settingsReasoning: reasoningSelect,
      settingsSave,
      settingsCancel,
      context,
      contextText,
      contextClear,
      messages,
      error,
      textarea,
      submit,
      quoteRow,
      quoteText,
      quoteClear,
      zoom,
      zoomImg,
      zoomClose,
    };
  }

  function buildMobileNav() {
    const el = document.createElement("div");
    el.className = "mobile-nav";

    const buttons = {
      note: createNavButton(iconNote(), "Note"),
      audio: createNavButton(iconAudio(), "Audio"),
      explore: createNavButton(iconExplore(), "Explore"),
      highlights: createNavButton(iconHighlights(), "Highlights"),
    };

    Object.values(buttons).forEach((button) => el.appendChild(button));

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("click", stopPropagation);

    buttons.note.addEventListener("click", () => {
      openNoteModal();
    });

    buttons.highlights.addEventListener("click", async () => {
      toggleHighlightsPanel();
    });

    buttons.audio.addEventListener("click", () => {
      openAudioModal();
    });

    buttons.explore.addEventListener("click", () => {
      openExploreModal();
    });

    return { el, buttons };
  }

  function buildHighlightsPanel() {
    const el = document.createElement("div");
    el.className = "highlights-panel";

    const header = document.createElement("div");
    header.className = "highlights-panel__header";

    const title = document.createElement("div");
    title.className = "highlights-panel__title";
    title.textContent = "Highlights";

    const headerActions = document.createElement("div");
    headerActions.className = "highlights-panel__header-actions";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "highlights-panel__toggle";

    const close = document.createElement("button");
    close.type = "button";
    close.className = "highlights-panel__close";
    close.title = "Close";
    close.innerHTML = iconClose();

    headerActions.appendChild(toggle);
    headerActions.appendChild(close);
    header.appendChild(title);
    header.appendChild(headerActions);

    const tabs = document.createElement("div");
    tabs.className = "highlights-panel__tabs";

    const tabButtons = {
      selections: buildTabButton("Selections"),
      additions: buildTabButton("Additions"),
      markers: buildTabButton("Markers"),
    };

    Object.entries(tabButtons).forEach(([key, entry]) => {
      entry.button.addEventListener("click", () => {
        setHighlightsTab(key);
      });
      tabs.appendChild(entry.button);
    });

    const content = document.createElement("div");
    content.className = "highlights-panel__content";

    el.appendChild(header);
    el.appendChild(tabs);
    el.appendChild(content);

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("click", stopPropagation);

    toggle.addEventListener("click", () => {
      state.showHighlightsOnPage = !state.showHighlightsOnPage;
      updateHighlightsToggle();
      if (state.showHighlightsOnPage && state.highlightsData.bundles.length === 0) {
        refreshHighlightsData({ silent: true });
      } else {
        refreshHighlightsOverlay();
      }
    });

    close.addEventListener("click", () => {
      hideHighlightsPanel();
    });

    const updateToggle = () => {
      toggle.textContent = state.showHighlightsOnPage
        ? "Hide on page"
        : "Show on page";
      toggle.classList.toggle("is-active", state.showHighlightsOnPage);
    };

    const updateTabs = (counts) => {
      Object.entries(tabButtons).forEach(([key, entry]) => {
        entry.count.textContent = String(counts[key] ?? 0);
        entry.button.classList.toggle("is-active", state.highlightsTab === key);
      });
    };

    return { el, content, updateToggle, updateTabs };
  }

  function buildHighlightDetailModal() {
    const el = document.createElement("div");
    el.className = "modal-backdrop highlight-detail";

    const card = document.createElement("div");
    card.className = "modal-card highlight-detail__card";

    const header = document.createElement("div");
    header.className = "modal-header highlight-detail__header";

    const title = document.createElement("h2");
    title.textContent = "Highlight";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";

    header.appendChild(title);
    header.appendChild(close);

    const body = document.createElement("div");
    body.className = "highlight-detail__body";

    card.appendChild(header);
    card.appendChild(body);
    el.appendChild(card);

    el.addEventListener("mousedown", stopPropagation);
    el.addEventListener("click", stopPropagation);

    close.addEventListener("click", () => {
      hideHighlightDetailModal();
    });

    return { el, body, title };
  }

  function buildTabButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "highlights-panel__tab";
    const text = document.createElement("span");
    text.className = "highlights-panel__tab-label";
    text.textContent = label;
    const count = document.createElement("span");
    count.className = "highlights-panel__tab-count";
    count.textContent = "0";
    button.appendChild(text);
    button.appendChild(count);
    return { button, count };
  }

  function showHighlightsPanel() {
    state.highlightsPanelOpen = true;
    highlightsPanel.el.style.display = "flex";
    if (state.navOpen) {
      hideMobileNav();
    }
    updateHighlightsNavState();
    updateHighlightsToggle();
    refreshHighlightsData();
  }

  function hideHighlightsPanel() {
    state.highlightsPanelOpen = false;
    highlightsPanel.el.style.display = "none";
    updateHighlightsNavState();
  }

  function toggleHighlightsPanel() {
    if (state.highlightsPanelOpen) {
      hideHighlightsPanel();
    } else {
      showHighlightsPanel();
    }
  }

  function updateHighlightsToggle() {
    if (highlightsPanel?.updateToggle) {
      highlightsPanel.updateToggle();
    }
  }

  function hideHighlightDetailModal() {
    highlightDetailModal.el.style.display = "none";
    state.highlightDetail = null;
  }

  function showHighlightDetailModal() {
    highlightDetailModal.el.style.display = "flex";
  }

  function setHighlightsTab(tabKey) {
    if (state.highlightsTab === tabKey) {
      return;
    }
    state.highlightsTab = tabKey;
    renderHighlightsPanel();
  }

  function buildMarkerToggle(compact) {
    const toggle = document.createElement("div");
    toggle.className = compact ? "marker-toggle marker-toggle--compact" : "marker-toggle";

    toggle.appendChild(buildMarkerButton("like", "Like", iconLike()));
    toggle.appendChild(buildMarkerButton("highlight", "Highlight", iconHighlight()));
    toggle.appendChild(buildMarkerButton("todo", "Todo", iconTodo()));
    toggle.appendChild(buildMarkerButton("laugh", "Laugh", iconLaugh()));
    toggle.appendChild(buildMarkerButton("pending", "Pending", iconPending()));

    return toggle;
  }

  function buildMarkerButton(kind, title, iconHtml) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "marker-button";
    button.setAttribute("data-kind", kind);
    button.title = title;
    button.innerHTML = iconHtml;

    button.addEventListener("click", async () => {
      log("Marker toggle clicked", kind);
      await toggleMarker(kind);
    });

    return button;
  }

  function createActionButton(iconHtml, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.title = title;
    button.innerHTML = iconHtml;
    return button;
  }

  function createNavButton(iconHtml, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `${iconHtml}<span>${label}</span>`;
    return button;
  }

  function createModalIconButton(iconHtml, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "modal-icon-button";
    button.title = title;
    button.setAttribute("aria-label", title);
    button.innerHTML = iconHtml;
    return button;
  }

  function createAudioControl(iconHtml, title, ariaLabel, variant) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = variant ? `audio-control ${variant}` : "audio-control";
    button.title = title;
    button.setAttribute("aria-label", ariaLabel || title);
    button.innerHTML = iconHtml;
    return button;
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function getSelectionTextRaw() {
    return state.selection ? state.selection.text : "";
  }

  function getSelectionTextTrimmed() {
    return (state.selection ? state.selection.text : "").trim();
  }

  function buildLookupUrl(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return null;
    }
    const query = encodeURIComponent(trimmed);
    return `https://www.google.com/search?q=define+${query}`;
  }

  function updateMarkerButtons() {
    overlay.root.querySelectorAll(".marker-button").forEach((button) => {
      const kind = button.getAttribute("data-kind");
      if (!kind) {
        return;
      }
      if (state.markerIds.has(kind)) {
        button.classList.add("is-active");
      } else {
        button.classList.remove("is-active");
      }
    });
  }

  function updateHighlightsNavState() {
    if (mobileNav?.buttons?.highlights) {
      mobileNav.buttons.highlights.classList.toggle(
        "is-active",
        state.highlightsPanelOpen
      );
    }
  }

  function updateNavButtons() {
    if (mobileNav?.buttons?.note) {
      mobileNav.buttons.note.disabled = false;
      mobileNav.buttons.note.title = "Note";
    }
    if (mobileNav?.buttons?.audio) {
      mobileNav.buttons.audio.disabled = false;
      mobileNav.buttons.audio.title = "Audio";
    }
  }

  function updateActionMenuStatus() {
    const status = state.isSaving ? "Saving..." : state.isCommitted ? "Saved" : "Not saved";
    actionMenu.status.textContent = status;
    actionMenu.commit.disabled = state.isSaving || state.isCommitted;
  }

  function showActionMenu(rect) {
    updateActionMenuStatus();
    actionMenu.el.style.display = "block";
    actionMenu.el.style.visibility = "hidden";

    requestAnimationFrame(() => {
      const menuRect = actionMenu.el.getBoundingClientRect();
      const padding = 12;
      let top = rect.top - menuRect.height - padding;
      if (top < padding) {
        top = rect.bottom + padding;
      }
      let left = rect.left;
      if (left + menuRect.width > window.innerWidth - padding) {
        left = window.innerWidth - menuRect.width - padding;
      }
      if (left < padding) {
        left = padding;
      }
      actionMenu.el.style.top = `${Math.round(top)}px`;
      actionMenu.el.style.left = `${Math.round(left)}px`;
      actionMenu.el.style.visibility = "visible";
      log("Action menu shown", { top: Math.round(top), left: Math.round(left) });
    });
  }

  function hideActionMenu() {
    actionMenu.el.style.display = "none";
  }

  function showNoteModal() {
    noteModal.el.style.display = "flex";
    noteModal.textarea.focus();
  }

  function hideNoteModal() {
    noteModal.el.style.display = "none";
    clearModalOverrides();
    if (state.navOpen) {
      hideMobileNav();
    }
  }

  function showGrammarModal() {
    grammarModal.el.style.display = "flex";
  }

  function hideGrammarModal() {
    grammarModal.el.style.display = "none";
  }

  function showAudioModal() {
    audioModal.el.style.display = "flex";
  }

  function hideAudioModal() {
    audioModal.el.style.display = "none";
    clearModalOverrides();
    if (state.navOpen) {
      hideMobileNav();
    }
  }

  function showExploreModal() {
    exploreModal.el.style.display = "flex";
    exploreModal.el.classList.add("is-open");
    exploreState.open = true;
  }

  function hideExploreModal() {
    exploreModal.el.classList.remove("is-open");
    exploreModal.el.style.display = "none";
    exploreState.open = false;
  }

  function openExploreModal(options = {}) {
    const { contextText = "", anchorSelectionId = null } = options;
    const anchor = resolveExploreAnchor();
    exploreState.anchorSelectionId =
      typeof anchorSelectionId === "number"
        ? anchorSelectionId
        : anchor?.selectionId ?? null;
    exploreState.anchorSelector = anchor?.selector ?? null;
    exploreState.anchorText = anchor?.text ?? "";
    exploreState.anchorUrl = getNormalizedPageUrl();
    exploreState.anchorTitle = document.title || "";
    const resolvedContext = contextText?.trim()
      ? contextText.trim()
      : anchor?.text ?? "";
    exploreState.contextText = resolvedContext;
    exploreState.error = "";
    exploreState.isSubmitting = false;
    exploreState.storageKey = getExploreStorageKey();
    void loadExploreSettings();
    loadExploreSession();
    exploreModal.textarea.value = exploreState.draft;
    renderExploreModal();
    showExploreModal();
    exploreModal.textarea.focus();
    hideActionMenu();
    hideArtifactMenu();
    if (state.navOpen) {
      hideMobileNav();
    }
    clearSelection();
  }

  function closeExploreModal() {
    hideExploreZoom();
    hideArtifactMenu();
    toggleExploreSettingsPanel(false);
    hideExploreModal();
  }

  function resolveExploreAnchor() {
    if (state.selection) {
      return {
        selectionId: state.isCommitted ? state.selectionId : null,
        selector: state.selection.selector,
        text: state.selection.text,
      };
    }
    const point = state.lastInteraction || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const range = getCaretRangeFromPoint(point.x, point.y);
    if (!range) {
      return null;
    }
    range.collapse(true);
    return {
      selectionId: null,
      selector: buildSelector(range, ""),
      text: "",
    };
  }

  function getExploreStorageKey() {
    const url = getNormalizedPageUrl() || window.location.href;
    return `reader-ext-explore:${url}`;
  }

  function loadExploreSession() {
    const key = exploreState.storageKey;
    if (!key) {
      exploreState.messages = [];
      exploreState.threadId = null;
      exploreState.draft = "";
      return;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        exploreState.messages = [];
        exploreState.threadId = null;
        exploreState.draft = "";
        return;
      }
      const parsed = JSON.parse(raw);
      exploreState.messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      exploreState.threadId = typeof parsed.threadId === "number" ? parsed.threadId : null;
      exploreState.draft = typeof parsed.draftMessage === "string" ? parsed.draftMessage : "";
    } catch (error) {
      exploreState.messages = [];
      exploreState.threadId = null;
      exploreState.draft = "";
    }
  }

  function persistExploreSession() {
    const key = exploreState.storageKey;
    if (!key) {
      return;
    }
    try {
      const payload = {
        threadId: exploreState.threadId,
        messages: exploreState.messages,
        draftMessage: exploreState.draft,
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch (error) {
      // ignore storage errors
    }
  }

  async function loadExploreSettings() {
    if (exploreSettings.loaded) {
      return;
    }
    let settings = null;
    let models = null;
    try {
      const settingsResult = await apiRequest({ path: "/explore/settings" });
      if (settingsResult.ok && settingsResult.data?.settings) {
        settings = settingsResult.data.settings;
      }
    } catch (error) {
      settings = null;
    }
    try {
      const modelsResult = await apiRequest({ path: "/explore/models" });
      if (modelsResult.ok && modelsResult.data) {
        models = modelsResult.data;
      }
    } catch (error) {
      models = null;
    }

    exploreSettings.systemPrompt =
      settings?.system_prompt || exploreSettings.systemPrompt || "";
    exploreSettings.model =
      settings?.model || exploreSettings.model || EXPLORE_DEFAULT_MODEL;
    exploreSettings.reasoning =
      settings?.reasoning_effort || exploreSettings.reasoning || EXPLORE_DEFAULT_REASONING;

    exploreSettings.availableModels = Array.isArray(models?.models)
      ? models.models
      : EXPLORE_MODEL_OPTIONS;
    exploreSettings.reasoningLevels = Array.isArray(models?.reasoning_levels)
      ? models.reasoning_levels
      : EXPLORE_REASONING_LEVELS;

    exploreSettings.loaded = true;
    renderExploreSettingsPanel();
  }

  function getReasoningLabel(value) {
    const option =
      exploreSettings.reasoningLevels.find((level) => level.value === value) ||
      EXPLORE_REASONING_LEVELS.find((level) => level.value === value);
    return option ? option.label : value;
  }

  function renderExploreSettingsPanel() {
    const panel = exploreModal.settingsPanel;
    if (!panel) {
      return;
    }
    const draft =
      exploreSettings.draft || {
        systemPrompt: exploreSettings.systemPrompt || "",
        model: exploreSettings.model || EXPLORE_DEFAULT_MODEL,
        reasoning: exploreSettings.reasoning || EXPLORE_DEFAULT_REASONING,
      };
    exploreSettings.draft = draft;

    exploreModal.settingsPrompt.value = draft.systemPrompt || "";

    const modelSelect = exploreModal.settingsModel;
    modelSelect.innerHTML = "";
    (exploreSettings.availableModels.length
      ? exploreSettings.availableModels
      : EXPLORE_MODEL_OPTIONS
    ).forEach((model) => {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.label || model.id;
      if (model.id === draft.model) {
        option.selected = true;
      }
      modelSelect.appendChild(option);
    });

    const reasoningSelect = exploreModal.settingsReasoning;
    const allowedLevels = getExploreReasoningLevels(draft.model);
    if (allowedLevels.length && !allowedLevels.includes(draft.reasoning)) {
      const defaultLevel = getExploreDefaultReasoning(draft.model);
      draft.reasoning = defaultLevel;
    }
    reasoningSelect.innerHTML = "";
    allowedLevels.forEach((level) => {
      const option = document.createElement("option");
      option.value = level.value;
      option.textContent = level.label;
      if (level.value === draft.reasoning) {
        option.selected = true;
      }
      reasoningSelect.appendChild(option);
    });

    exploreModal.settingsSave.disabled = !exploreSettings.loaded;
  }

  function getExploreModelConfig(modelId) {
    const models = exploreSettings.availableModels.length
      ? exploreSettings.availableModels
      : EXPLORE_MODEL_OPTIONS;
    return models.find((model) => model.id === modelId) || null;
  }

  function getExploreReasoningLevels(modelId) {
    const model = getExploreModelConfig(modelId);
    const allowed = Array.isArray(model?.reasoning_levels) ? model.reasoning_levels : null;
    const options = exploreSettings.reasoningLevels.length
      ? exploreSettings.reasoningLevels
      : EXPLORE_REASONING_LEVELS;
    if (!allowed || allowed.length === 0) {
      return options;
    }
    return options.filter((level) => allowed.includes(level.value));
  }

  function getExploreDefaultReasoning(modelId) {
    const model = getExploreModelConfig(modelId);
    if (model?.default_reasoning) {
      return model.default_reasoning;
    }
    const allowed = getExploreReasoningLevels(modelId);
    if (allowed.length) {
      return allowed[0].value;
    }
    return EXPLORE_DEFAULT_REASONING;
  }

  function toggleExploreSettingsPanel(force) {
    const shouldOpen = typeof force === "boolean" ? force : !exploreSettings.showPanel;
    exploreSettings.showPanel = shouldOpen;
    if (shouldOpen) {
      exploreSettings.draft = {
        systemPrompt: exploreSettings.systemPrompt || "",
        model: exploreSettings.model || EXPLORE_DEFAULT_MODEL,
        reasoning: exploreSettings.reasoning || EXPLORE_DEFAULT_REASONING,
      };
      renderExploreSettingsPanel();
      exploreModal.settingsPanel.style.display = "block";
    } else {
      exploreSettings.draft = null;
      exploreModal.settingsPanel.style.display = "none";
    }
  }

  function showExploreBadge(text) {
    if (!text) {
      return;
    }
    exploreSettings.badgeText = text;
    exploreModal.badge.textContent = text;
    exploreModal.badge.style.display = "inline-flex";
    if (exploreSettings.badgeTimeout) {
      window.clearTimeout(exploreSettings.badgeTimeout);
    }
    exploreSettings.badgeTimeout = window.setTimeout(() => {
      exploreModal.badge.style.display = "none";
      exploreModal.badge.textContent = "";
      exploreSettings.badgeText = "";
    }, 2600);
  }

  async function handleExploreSettingsSave() {
    if (!exploreSettings.draft) {
      return;
    }
    const draft = exploreSettings.draft;
    const allowedLevels = getExploreReasoningLevels(draft.model);
    if (allowedLevels.length && !allowedLevels.some((level) => level.value === draft.reasoning)) {
      draft.reasoning = getExploreDefaultReasoning(draft.model);
    }
    const previousReasoning = exploreSettings.reasoning;
    const previousModel = exploreSettings.model;
    const previousPrompt = exploreSettings.systemPrompt;

    const result = await apiRequest({
      path: "/explore/settings",
      method: "PUT",
      json: {
        system_prompt: draft.systemPrompt,
        model: draft.model,
        reasoning_effort: draft.reasoning,
      },
    });
    if (!result.ok) {
      exploreState.error = result.error || "Failed to save settings.";
      renderExploreError();
      return;
    }
    exploreSettings.systemPrompt = draft.systemPrompt;
    exploreSettings.model = draft.model;
    exploreSettings.reasoning = draft.reasoning;
    exploreSettings.forceNewThread = true;

    const changes = [];
    if (previousReasoning !== draft.reasoning) {
      changes.push(
        `Reasoning: ${getReasoningLabel(previousReasoning)} → ${getReasoningLabel(
          draft.reasoning
        )}`
      );
    }
    if (previousModel !== draft.model) {
      changes.push(`Model: ${previousModel || "default"} → ${draft.model}`);
    }
    if (previousPrompt !== draft.systemPrompt) {
      changes.push("Prompt updated");
    }
    if (changes.length) {
      showExploreBadge(changes.join(" · "));
    }

    toggleExploreSettingsPanel(false);
  }

  function renderExploreModal() {
    renderExploreContext();
    renderExploreMessages();
    renderExploreError();
    renderExploreQuote();
    updateExploreSubmit();
    renderExploreSettingsPanel();
  }

  function renderExploreContext() {
    const text = exploreState.contextText || "";
    if (text.trim()) {
      exploreModal.context.style.display = "flex";
      exploreModal.contextText.textContent = truncateContext(text);
      exploreModal.contextText.title = text;
    } else {
      exploreModal.context.style.display = "none";
      exploreModal.contextText.textContent = "";
      exploreModal.contextText.title = "";
    }
  }

  function renderExploreMessages() {
    const container = exploreModal.messages;
    const wasNearBottom = isNearBottom(container);
    const prevScrollTop = container.scrollTop;
    container.innerHTML = "";
    if (!exploreState.messages.length) {
      const empty = document.createElement("div");
      empty.className = "explore-chat-modal__empty";
      empty.textContent = "Ask something about this passage.";
      container.appendChild(empty);
    } else {
      exploreState.messages.forEach((message) => {
        const card = document.createElement("div");
        card.className = `chat-message chat-message--${message.role}`;
        if (message.role === "assistant" && message.additionId && message.selectionId) {
          card.addEventListener("dblclick", (event) => {
            event.preventDefault();
            event.stopPropagation();
            const rect = card.getBoundingClientRect();
            const menuWidth = 320;
            const padding = 16;
            const aboveTop = rect.top - 56;
            const menuTop = aboveTop > padding ? aboveTop : rect.bottom + 12;
            const menuLeft = Math.min(
              Math.max(padding, rect.left),
              window.innerWidth - menuWidth - padding
            );
            openArtifactMenu({
              top: menuTop,
              left: menuLeft,
              additionId: message.additionId,
              selectionId: message.selectionId,
              contextText: message.content,
              kind: "explore",
            });
          });
        }
        appendExploreMessageParts(card, message.content);
        if (message.role === "assistant") {
          const actions = document.createElement("div");
          actions.className = "chat-message__actions";

          const copyButton = document.createElement("button");
          copyButton.type = "button";
          copyButton.className = "chat-message__action";
          copyButton.title = "Copy";
          copyButton.setAttribute("aria-label", "Copy response");
          copyButton.innerHTML = iconCopy();
          copyButton.addEventListener("click", async (event) => {
            event.stopPropagation();
            try {
              await navigator.clipboard.writeText(message.content || "");
              showExploreBadge("Copied");
            } catch (error) {
              console.warn("Reader extension copy failed", error);
            }
          });

          const quoteButton = document.createElement("button");
          quoteButton.type = "button";
          quoteButton.className = "chat-message__action";
          quoteButton.title = "Quote";
          quoteButton.setAttribute("aria-label", "Quote response");
          quoteButton.innerHTML = iconQuote();
          quoteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            setExploreQuote(message.content || "");
          });

          const infoButton = document.createElement("button");
          infoButton.type = "button";
          infoButton.className = "chat-message__action";
          infoButton.title = buildExploreInfoTitle(message);
          infoButton.setAttribute("aria-label", "Response info");
          infoButton.innerHTML = iconInfo();

          actions.appendChild(copyButton);
          actions.appendChild(quoteButton);
          actions.appendChild(infoButton);
          card.appendChild(actions);
        }
        container.appendChild(card);
      });
    }
    if (exploreState.isSubmitting) {
      const loading = document.createElement("div");
      loading.className = "chat-message chat-message--assistant chat-message--loading";
      const spinner = document.createElement("span");
      spinner.className = "explore-spinner";
      spinner.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.textContent = "Thinking...";
      loading.appendChild(spinner);
      loading.appendChild(text);
      container.appendChild(loading);
    }
    requestAnimationFrame(() => {
      if (wasNearBottom) {
        container.scrollTop = container.scrollHeight;
        return;
      }
      const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      container.scrollTop = Math.min(prevScrollTop, maxScrollTop);
    });
  }

  function buildExploreInfoTitle(message) {
    const model = message?.meta?.model || exploreSettings.model || "unknown";
    const reasoningValue = message?.meta?.reasoning || exploreSettings.reasoning || "unknown";
    const reasoning = getReasoningLabel(reasoningValue) || reasoningValue;
    return `Model: ${model} | Reasoning: ${reasoning}`;
  }

  function renderExploreError() {
    if (exploreState.error) {
      exploreModal.error.style.display = "block";
      exploreModal.error.textContent = exploreState.error;
    } else {
      exploreModal.error.style.display = "none";
      exploreModal.error.textContent = "";
    }
  }

  function renderExploreQuote() {
    const quote = exploreState.quoteText || "";
    if (!quote.trim()) {
      exploreModal.quoteRow.style.display = "none";
      exploreModal.quoteText.textContent = "";
      exploreModal.quoteText.title = "";
      return;
    }
    exploreModal.quoteRow.style.display = "flex";
    exploreModal.quoteText.textContent = truncateContext(quote, 80);
    exploreModal.quoteText.title = quote;
  }

  function setExploreQuote(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return;
    }
    exploreState.quoteText = normalized;
    renderExploreQuote();
    exploreModal.textarea.focus();
  }

  function clearExploreQuote() {
    exploreState.quoteText = "";
    renderExploreQuote();
  }

  function updateExploreSubmit() {
    const trimmed = exploreState.draft.trim();
    exploreModal.submit.disabled = !trimmed || exploreState.isSubmitting;
    exploreModal.submit.setAttribute(
      "aria-busy",
      exploreState.isSubmitting ? "true" : "false"
    );
  }

  async function handleExploreSubmit() {
    if (exploreState.isSubmitting) {
      return;
    }
    const trimmed = exploreState.draft.trim();
    if (!trimmed) {
      return;
    }

    const userMessage = {
      id: Date.now() + exploreMessageCounter++,
      role: "user",
      content: trimmed,
    };
    exploreState.messages = [...exploreState.messages, userMessage];
    exploreState.draft = "";
    exploreState.isSubmitting = true;
    exploreState.error = "";
    exploreModal.textarea.value = "";
    renderExploreModal();
    persistExploreSession();

    const contextPrefix = exploreState.contextText
      ? `Context:\n${exploreState.contextText}\n\n`
      : "";
    const quoteText = (exploreState.quoteText || "").trim();
    const quoteBlock = quoteText
      ? `Quote (from previous response):\n<<<\n${quoteText}\n>>>\n\n`
      : "";
    const payloadMessage = `${contextPrefix}${quoteBlock}${trimmed}`;

    try {
      await loadExploreSettings();
      const forceNewThread = exploreSettings.forceNewThread;
      const threadId = forceNewThread ? null : exploreState.threadId;
      const action = threadId ? "resume" : "new";
      const result = await apiRequest({
        path: "/explore/chat",
        method: "POST",
        json: {
          thread_id: threadId,
          message: payloadMessage,
          action,
          mode: "codex-cli",
          system_prompt: exploreSettings.systemPrompt || null,
          model: exploreSettings.model || null,
          reasoning_effort: exploreSettings.reasoning || null,
          book_title: document.title || "the current page",
          document_id: null,
        },
      });

      if (!result.ok) {
        const detail = result.data?.detail || result.error || "Explore request failed.";
        throw new Error(detail);
      }
      const data = result.data || {};
      const assistantText = cleanExploreResponse(data.messages?.[0]?.content ?? "");
      if (data.thread?.id && !threadId) {
        exploreState.threadId = data.thread.id;
      }
      if (forceNewThread) {
        exploreSettings.forceNewThread = false;
      }
      if (assistantText) {
        const assistantMessage = {
          id: Date.now() + exploreMessageCounter++,
          role: "assistant",
          content: assistantText,
          meta: {
            model: exploreSettings.model || null,
            reasoning: exploreSettings.reasoning || null,
          },
        };
        exploreState.messages = [...exploreState.messages, assistantMessage];
        renderExploreMessages();
        await saveExploreAddition(assistantMessage, trimmed);
      }
      if (quoteText) {
        clearExploreQuote();
      }
      persistExploreSession();
    } catch (error) {
      exploreState.error = normalizeError(error);
    } finally {
      exploreState.isSubmitting = false;
      renderExploreMessages();
      updateExploreSubmit();
      renderExploreError();
      persistExploreSession();
    }
  }

  async function ensureExploreSelectionId() {
    if (typeof exploreState.anchorSelectionId === "number") {
      return exploreState.anchorSelectionId;
    }
    if (!exploreState.anchorSelector) {
      return null;
    }
    try {
      const result = await apiRequest({
        path: "/web/selections",
        method: "POST",
        json: {
          url: exploreState.anchorUrl || getNormalizedPageUrl(),
          title: exploreState.anchorTitle || document.title,
          selection_text: exploreState.anchorText || "",
          selector: exploreState.anchorSelector,
        },
      });
      if (!result.ok) {
        return null;
      }
      const id = result.data?.selection?.id ?? null;
      if (id) {
        exploreState.anchorSelectionId = id;
      }
      return id;
    } catch (error) {
      return null;
    }
  }

  async function saveExploreAddition(message, promptText) {
    if (!message || message.role !== "assistant") {
      return;
    }
    const selectionId = await ensureExploreSelectionId();
    if (!selectionId) {
      return;
    }
    const addition = await createWebAdditionForSelectionId(selectionId, {
      type: "explore",
      textContent: message.content,
      payload: {
        thread_id: exploreState.threadId,
        message_id: message.id,
        role: message.role,
        prompt: promptText,
        content: message.content,
        context_text: exploreState.contextText,
      },
    });
    if (addition?.id && addition?.selection_id) {
      attachExploreAddition(message.id, addition.id, addition.selection_id);
    }
  }

  function attachExploreAddition(messageId, additionId, selectionId) {
    exploreState.messages = exploreState.messages.map((message) =>
      message.id === messageId
        ? { ...message, additionId, selectionId }
        : message
    );
    persistExploreSession();
    renderExploreMessages();
  }

  function openExploreZoom(url, altText) {
    if (!url) {
      return;
    }
    exploreModal.zoomImg.src = url;
    exploreModal.zoomImg.alt = altText || "Explore image";
    exploreModal.zoom.style.display = "flex";
  }

  function hideExploreZoom() {
    exploreModal.zoom.style.display = "none";
    exploreModal.zoomImg.src = "";
  }

  function openArtifactMenu({ top, left, additionId, selectionId, contextText, kind }) {
    if (!additionId || !selectionId) {
      return;
    }
    artifactState.additionId = additionId;
    artifactState.selectionId = selectionId;
    artifactState.contextText = contextText || "";
    artifactState.kind = kind || "explore";
    artifactState.markers = [];
    artifactMenu.el.style.top = `${Math.round(top)}px`;
    artifactMenu.el.style.left = `${Math.round(left)}px`;
    renderArtifactMenu();
    artifactMenu.el.style.display = "block";
    void loadArtifactMarkers(additionId);
  }

  function hideArtifactMenu() {
    artifactMenu.el.style.display = "none";
    artifactState.additionId = null;
    artifactState.selectionId = null;
    artifactState.contextText = "";
    artifactState.kind = "explore";
    artifactState.markers = [];
  }

  function renderArtifactMenu() {
    const preview = truncateContext(artifactState.contextText || "");
    artifactMenu.label.textContent = "Explore response";
    if (preview) {
      artifactMenu.text.style.display = "block";
      artifactMenu.text.textContent = preview;
      artifactMenu.text.title = artifactState.contextText || "";
    } else {
      artifactMenu.text.style.display = "none";
      artifactMenu.text.textContent = "";
      artifactMenu.text.title = "";
    }
    renderMarkerToggle(
      artifactMenu.markers,
      artifactState.markers.map((marker) => marker.kind),
      async (kind) => {
        await toggleArtifactMarker(kind);
      }
    );
  }

  async function loadArtifactMarkers(additionId) {
    try {
      const result = await apiRequest({
        path: `/web/markers?target_type=addition&target_id=${additionId}`,
      });
      if (!result.ok) {
        return;
      }
      artifactState.markers = result.data?.markers ?? [];
      renderArtifactMenu();
    } catch (error) {
      // ignore marker errors
    }
  }

  async function toggleArtifactMarker(kind) {
    if (!artifactState.additionId) {
      return;
    }
    const existing = artifactState.markers.find((marker) => marker.kind === kind);
    if (existing) {
      await apiRequest({
        path: `/web/markers/${existing.id}`,
        method: "DELETE",
      });
    } else {
      await apiRequest({
        path: "/web/markers",
        method: "POST",
        json: {
          target_type: "addition",
          target_id: artifactState.additionId,
          kind,
          value: null,
        },
      });
    }
    await loadArtifactMarkers(artifactState.additionId);
    scheduleHighlightsRefresh();
  }

  function handleArtifactAction(action) {
    if (!artifactState.additionId || !artifactState.selectionId) {
      return;
    }
    const source = {
      additionId: artifactState.additionId,
      kind: artifactState.kind,
      previewText: artifactState.contextText,
    };
    if (action === "note") {
      openNoteModal({
        selectionIdOverride: artifactState.selectionId,
        source,
        hideMarkers: true,
      });
    } else if (action === "audio") {
      openAudioModal({
        selectionIdOverride: artifactState.selectionId,
        source,
        hideMarkers: true,
      });
    } else {
      openExploreModal({
        contextText: artifactState.contextText,
        anchorSelectionId: artifactState.selectionId,
      });
    }
    hideArtifactMenu();
  }

  function showMobileNav() {
    mobileNav.el.style.display = "grid";
    state.navOpen = true;
    log("Mobile nav shown");
  }

  function hideMobileNav() {
    mobileNav.el.style.display = "none";
    state.navOpen = false;
    log("Mobile nav hidden");
  }

  function stopPropagation(event) {
    event.stopPropagation();
  }

  function handleMouseUp(event) {
    if (isEventInOverlay(event)) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      return;
    }

    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    if (!range) {
      return;
    }

    const rect = range.getBoundingClientRect();
    log("Selection captured", text.slice(0, 80));
    setSelection(range, text);
    showActionMenu(rect);
  }

  function handleDoubleClick(event) {
    if (isEventInOverlay(event)) {
      return;
    }

    const range = getWordRangeAtPoint(event.clientX, event.clientY);
    if (!range) {
      return;
    }

    if (!state.anchorRange) {
      state.anchorRange = range.cloneRange();
      if (state.anchorTimer) {
        clearTimeout(state.anchorTimer);
      }
      log("Anchor range set");
      state.anchorTimer = window.setTimeout(() => {
        state.anchorRange = null;
        state.anchorTimer = null;
      }, DOUBLE_CLICK_WINDOW_MS);
      return;
    }

    const spanRange = buildSpanRange(state.anchorRange, range);
    state.anchorRange = null;
    if (state.anchorTimer) {
      clearTimeout(state.anchorTimer);
      state.anchorTimer = null;
    }

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(spanRange);
    }

    const text = spanRange.toString().trim();
    if (!text) {
      return;
    }

    const rect = spanRange.getBoundingClientRect();
    log("Span range selection", text.slice(0, 80));
    setSelection(spanRange, text);
    showActionMenu(rect);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      log("Escape pressed");
      hideActionMenu();
      hideNoteModal();
      hideGrammarModal();
      closeAudioModal();
      closeExploreModal();
      hideMobileNav();
      hideHighlightsPanel();
      hideHighlightDetailModal();
      hideArtifactMenu();
    }
  }

  function handleDocumentMouseDown(event) {
    log("Document mousedown", event.target);
    if (artifactMenu.el.style.display !== "none") {
      const path = event.composedPath ? event.composedPath() : [];
      const inArtifact =
        artifactMenu.el.contains(event.target) || path.includes(artifactMenu.el);
      if (!inArtifact) {
        hideArtifactMenu();
      }
    }
    if (isEventInOverlay(event)) {
      return;
    }
    recordLastInteraction(event.clientX, event.clientY);
    if (noteModal.el.style.display !== "none") {
      hideNoteModal();
      return;
    }
    if (grammarModal.el.style.display !== "none") {
      hideGrammarModal();
      return;
    }
    if (audioModal.el.style.display !== "none") {
      closeAudioModal();
      return;
    }
    if (highlightDetailModal.el.style.display !== "none") {
      hideHighlightDetailModal();
      return;
    }
    if (state.highlightsPanelOpen) {
      hideHighlightsPanel();
    }
    if (actionMenu.el.style.display !== "none") {
      hideActionMenu();
    }
    if (state.navOpen) {
      hideMobileNav();
    }
  }

  function handleTouchStart(event) {
    if (isEventInOverlay(event)) {
      return;
    }
    if (!event.touches || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
    recordLastInteraction(touch.clientX, touch.clientY);
    const yFromBottom = window.innerHeight - touch.clientY;
    if (yFromBottom > NAV_SWIPE_ZONE_HEIGHT) {
      return;
    }
    state.navSwipeStart = {
      y: touch.clientY,
      time: Date.now(),
    };
  }

  function handleTouchEnd(event) {
    if (isEventInOverlay(event)) {
      return;
    }
    if (!state.navSwipeStart) {
      return;
    }
    const touch = event.changedTouches && event.changedTouches[0];
    if (!touch) {
      state.navSwipeStart = null;
      return;
    }
    const deltaY = state.navSwipeStart.y - touch.clientY;
    const elapsed = Date.now() - state.navSwipeStart.time;
    state.navSwipeStart = null;
    if (deltaY < NAV_SWIPE_MIN_PX || elapsed > NAV_SWIPE_MAX_MS) {
      return;
    }
    if (state.navOpen) {
      hideMobileNav();
    } else {
      showMobileNav();
    }
  }

  function setSelection(range, text) {
    state.selection = {
      text,
      selector: buildSelector(range, text),
    };
    state.selectionId = null;
    state.isCommitted = false;
    state.isSaving = false;
    state.markerIds.clear();
    updateActionMenuStatus();
    updateMarkerButtons();
    updateNavButtons();
  }

  function clearSelection() {
    state.selection = null;
    state.selectionId = null;
    state.isCommitted = false;
    state.isSaving = false;
    state.markerIds.clear();
    updateActionMenuStatus();
    updateMarkerButtons();
    updateNavButtons();
  }

  async function commitSelection() {
    if (!state.selection) {
      return null;
    }
    if (state.isCommitted) {
      return state.selectionId;
    }
    state.isSaving = true;
    updateActionMenuStatus();
    try {
      log("Saving selection to API");
      const result = await apiRequest({
        path: "/web/selections",
        method: "POST",
        json: {
          url: getNormalizedPageUrl(),
          title: document.title,
          selection_text: state.selection.text,
          selector: state.selection.selector,
        },
      });

      if (!result.ok) {
        throw new Error(result.error || "Failed to save selection");
      }
      const data = result.data;
      state.selectionId = data.selection?.id ?? null;
      state.isCommitted = true;
      log("Selection saved", state.selectionId);
      scheduleHighlightsRefresh();
      return state.selectionId;
    } catch (error) {
      console.warn("Reader extension save failed", error);
    } finally {
      state.isSaving = false;
      updateActionMenuStatus();
    }
    return state.selectionId;
  }

  async function ensureSelectionId() {
    if (!state.selection) {
      return null;
    }
    if (state.selectionId && state.isCommitted) {
      return state.selectionId;
    }
    await commitSelection();
    return state.selectionId;
  }

  async function createWebAddition({
    type,
    title = null,
    textContent = null,
    payload = {},
    selectionIdOverride = null,
  }) {
    const selectionId = selectionIdOverride ?? (await ensureSelectionId());
    if (!selectionId) {
      return null;
    }
    return await createWebAdditionForSelectionId(selectionId, {
      type,
      title,
      textContent,
      payload,
    });
  }

  async function createWebAdditionForSelectionId(selectionId, { type, title, textContent, payload }) {
    try {
      const result = await apiRequest({
        path: "/web/additions",
        method: "POST",
        json: {
          selection_id: selectionId,
          type,
          title,
          text_content: textContent,
          payload,
        },
      });
      if (!result.ok) {
        return null;
      }
      const data = result.data;
      scheduleHighlightsRefresh();
      return data.addition ?? null;
    } catch (error) {
      console.warn("Reader extension addition save failed", error);
      return null;
    }
  }

  function applyModalOverrides({ selectionIdOverride = null, source = null, hideMarkers = false }) {
    state.modalSelectionOverride = selectionIdOverride;
    state.modalSource = source;
    state.modalHideMarkers = hideMarkers;
    if (noteModal?.markers) {
      noteModal.markers.style.display = hideMarkers ? "none" : "";
    }
    if (audioModal?.markers) {
      audioModal.markers.style.display = hideMarkers ? "none" : "";
    }
  }

  function clearModalOverrides() {
    applyModalOverrides({});
  }

  function getModalSelectionIdOverride() {
    return typeof state.modalSelectionOverride === "number" ? state.modalSelectionOverride : null;
  }

  function buildModalSourcePayload() {
    if (!state.modalSource) {
      return null;
    }
    return {
      type: "addition",
      id: state.modalSource.additionId,
      kind: state.modalSource.kind,
      preview_text: state.modalSource.previewText ?? null,
    };
  }

  async function ensureModalSelectionId() {
    const override = getModalSelectionIdOverride();
    if (override) {
      return override;
    }
    if (!state.selection) {
      return null;
    }
    return await ensureSelectionId();
  }

  async function saveNote(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    const selectionId = await ensureModalSelectionId();
    if (!selectionId) {
      return;
    }
    const payload = { text: trimmed };
    const source = buildModalSourcePayload();
    if (source) {
      payload.source = source;
    }
    log("Saving note addition");
    await createWebAddition({
      selectionIdOverride: selectionId,
      type: "note",
      textContent: trimmed,
      payload,
    });
  }

  async function saveGrammar(payload) {
    const textContent =
      payload.kind === "word" || payload.kind === "bars" ? payload.text ?? null : null;
    log("Saving grammar addition", payload.kind);
    await createWebAddition({
      type: "grammar",
      textContent,
      payload,
    });
  }

  async function saveAudio(audioPayload) {
    const selectionId = await ensureModalSelectionId();
    if (!selectionId) {
      return;
    }
    const payload = { audio: audioPayload };
    const source = buildModalSourcePayload();
    if (source) {
      payload.source = source;
    }
    log("Saving audio addition");
    await createWebAddition({
      selectionIdOverride: selectionId,
      type: "audio",
      payload,
    });
  }

  async function toggleMarker(kind) {
    if (!state.selection) {
      return;
    }
    const selectionId = await ensureSelectionId();
    if (!selectionId) {
      return;
    }
    try {
      if (state.markerIds.has(kind)) {
        const markerId = state.markerIds.get(kind);
        const result = await apiRequest({
          path: `/web/markers/${markerId}`,
          method: "DELETE",
        });
        if (result.ok) {
          scheduleHighlightsRefresh();
        }
        state.markerIds.delete(kind);
      } else {
        const result = await apiRequest({
          path: "/web/markers",
          method: "POST",
          json: {
            target_type: "selection",
            target_id: selectionId,
            kind,
            value: null,
          },
        });
        if (result.ok && result.data?.marker?.id) {
          state.markerIds.set(kind, result.data.marker.id);
          scheduleHighlightsRefresh();
        }
      }
    } catch (error) {
      console.warn("Reader extension marker toggle failed", error);
    } finally {
      updateMarkerButtons();
    }
  }

  function openNoteModal(options = {}) {
    const { selectionIdOverride = null, source = null, hideMarkers = false } = options;
    const hasOverride = typeof selectionIdOverride === "number";
    if (!hasOverride && !ensureSelectionForModal()) {
      log("Note modal blocked: no selection target");
      return;
    }
    applyModalOverrides({ selectionIdOverride, source, hideMarkers });
    if (state.navOpen) {
      hideMobileNav();
    }
    noteModal.textarea.value = "";
    showNoteModal();
  }

  function openGrammarModal() {
    if (!state.selection) {
      return;
    }
    grammarModal.updateButtons();
    showGrammarModal();
  }

  function openAudioModal(options = {}) {
    const { selectionIdOverride = null, source = null, hideMarkers = false } = options;
    const hasOverride = typeof selectionIdOverride === "number";
    if (!hasOverride && !ensureSelectionForModal()) {
      log("Audio modal blocked: no selection target");
      return;
    }
    applyModalOverrides({ selectionIdOverride, source, hideMarkers });
    if (state.navOpen) {
      hideMobileNav();
    }
    audioModal.resetModal();
    showAudioModal();
  }

  function closeAudioModal() {
    audioModal.resetModal();
    hideAudioModal();
  }

  async function handleMapAction() {
    if (!state.selection) {
      return;
    }
    const text = state.selection.text;
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("Reader extension map copy failed", error);
    }
    await createWebAddition({
      type: "map",
      payload: { text },
    });
    const url = new URL("https://192.168.2.34:3002/map");
    url.searchParams.set("text", text);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  function openOptionsPage() {
    if (chrome.runtime?.openOptionsPage) {
      chrome.runtime.openOptionsPage();
      return;
    }
    const url = chrome.runtime.getURL("options.html");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const TRACKING_PARAMS = new Set([
    "gclid",
    "fbclid",
    "ref",
    "igshid",
    "mc_cid",
    "mc_eid",
    "mkt_tok",
    "vero_conv",
    "vero_id",
  ]);
  let highlightsRefreshTimer = null;
  let highlightStyleEl = null;
  let activeHighlightTimer = null;
  const mediaUrlCache = new Map();

  function normalizeUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.hash = "";
      const params = [];
      url.searchParams.forEach((value, key) => {
        const normalizedKey = key.toLowerCase();
        if (normalizedKey.startsWith("utm_")) {
          return;
        }
        if (TRACKING_PARAMS.has(normalizedKey)) {
          return;
        }
        params.push([key, value]);
      });
      params.sort((a, b) => a[0].localeCompare(b[0]));
      url.search = params.length ? new URLSearchParams(params).toString() : "";
      return url.toString();
    } catch (error) {
      return rawUrl;
    }
  }

  function getNormalizedPageUrl() {
    return normalizeUrl(window.location.href);
  }

  function scheduleHighlightsRefresh(delay = 250) {
    if (highlightsRefreshTimer) {
      window.clearTimeout(highlightsRefreshTimer);
    }
    highlightsRefreshTimer = window.setTimeout(() => {
      refreshHighlightsData({ silent: !state.highlightsPanelOpen });
    }, delay);
  }

  async function refreshHighlightsData({ silent = false } = {}) {
    if (state.highlightsLoading) {
      return;
    }
    state.highlightsLoading = true;
    if (!silent) {
      renderHighlightsPanel();
    }
    try {
      const url = getNormalizedPageUrl();
      if (!url) {
        return;
      }
      const selectionsResult = await apiRequest({
        path: `/web/selections?url=${encodeURIComponent(url)}`,
      });
      const selections = selectionsResult.ok ? selectionsResult.data?.selections ?? [] : [];

      const bundles = await Promise.all(
        selections.map(async (selection) => {
          const [additionsResult, markersResult] = await Promise.all([
            apiRequest({
              path: `/web/additions?selection_id=${selection.id}`,
            }),
            apiRequest({
              path: `/web/markers?target_type=selection&target_id=${selection.id}`,
            }),
          ]);
          const additions = additionsResult.ok ? additionsResult.data?.additions ?? [] : [];
          const markers = markersResult.ok ? markersResult.data?.markers ?? [] : [];

          const additionMarkers = {};
          await Promise.all(
            additions.map(async (addition) => {
              const additionMarkersResult = await apiRequest({
                path: `/web/markers?target_type=addition&target_id=${addition.id}`,
              });
              additionMarkers[addition.id] = additionMarkersResult.ok
                ? additionMarkersResult.data?.markers ?? []
                : [];
            })
          );

          return { selection, additions, markers, additionMarkers };
        })
      );

      const nextData = buildHighlightsData(bundles);
      state.highlightsData = nextData;
      renderHighlightsPanel();
      refreshHighlightsOverlay();
    } catch (error) {
      console.warn("Reader extension highlights load failed", error);
    } finally {
      state.highlightsLoading = false;
      renderHighlightsPanel();
    }
  }

  function buildHighlightsData(bundles) {
    const selectionById = new Map();
    const additionById = new Map();
    const additions = [];
    const markers = [];

    bundles.forEach((bundle) => {
      selectionById.set(bundle.selection.id, bundle.selection);
      bundle.additions.forEach((addition) => {
        additions.push({ ...addition, selectionId: bundle.selection.id });
        additionById.set(addition.id, addition);
      });

      bundle.markers.forEach((marker) => {
        markers.push({ marker, selectionId: bundle.selection.id });
      });

      bundle.additions.forEach((addition) => {
        const additionMarkers = bundle.additionMarkers[addition.id] ?? [];
        additionMarkers.forEach((marker) => {
          markers.push({ marker, selectionId: bundle.selection.id, additionId: addition.id });
        });
      });
    });

    additions.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    markers.sort(
      (a, b) => new Date(b.marker.created_at).getTime() - new Date(a.marker.created_at).getTime()
    );
    const sortedBundles = [...bundles].sort(
      (a, b) =>
        new Date(b.selection.created_at).getTime() -
        new Date(a.selection.created_at).getTime()
    );

    return {
      bundles: sortedBundles,
      additions,
      markers,
      selectionById,
      additionById,
    };
  }

  function renderHighlightsPanel() {
    const { bundles, additions, markers } = state.highlightsData;
    const counts = {
      selections: bundles.length,
      additions: additions.length,
      markers: markers.length,
    };
    highlightsPanel.updateTabs(counts);

    if (!state.highlightsPanelOpen) {
      return;
    }

    highlightsPanel.content.innerHTML = "";

    if (state.highlightsLoading && bundles.length === 0) {
      const loading = document.createElement("div");
      loading.className = "highlights-panel__empty";
      loading.textContent = "Loading...";
      highlightsPanel.content.appendChild(loading);
      return;
    }

    if (state.highlightsTab === "selections") {
      renderSelectionsTab();
      return;
    }
    if (state.highlightsTab === "additions") {
      renderAdditionsTab();
      return;
    }
    renderMarkersTab();
  }

  function renderSelectionsTab() {
    const { bundles } = state.highlightsData;
    if (bundles.length === 0) {
      const empty = document.createElement("div");
      empty.className = "highlights-panel__empty";
      empty.textContent = "No selections yet.";
      highlightsPanel.content.appendChild(empty);
      return;
    }

    const stack = document.createElement("div");
    stack.className = "highlights-panel__stack";

    bundles.forEach((bundle) => {
      const selection = bundle.selection;
      const card = document.createElement("article");
      card.className = "highlight-card";

      const meta = document.createElement("div");
      meta.className = "highlight-card__meta";
      const metaLeft = document.createElement("span");
      metaLeft.textContent = formatRelativeTime(selection.created_at);
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "highlight-card__jump";
      jump.title = "Jump to selection";
      jump.innerHTML = iconJump();
      jump.addEventListener("click", (event) => {
        event.stopPropagation();
        jumpToSelection(selection);
      });
      meta.appendChild(metaLeft);
      meta.appendChild(jump);

      const title = document.createElement("div");
      title.className = "highlight-card__title";
      title.textContent = formatSnippet(getSelectionSnippet(selection));

      const stats = document.createElement("div");
      stats.className = "highlight-card__stats";
      stats.textContent = `${bundle.additions.length} additions · ${bundle.markers.length} markers`;

      card.appendChild(meta);
      card.appendChild(title);
      card.appendChild(stats);

      card.addEventListener("click", () => {
        openHighlightDetail({
          type: "selection",
          selectionId: selection.id,
        });
      });

      stack.appendChild(card);
    });

    highlightsPanel.content.appendChild(stack);
  }

  function renderAdditionsTab() {
    const { additions, selectionById } = state.highlightsData;
    if (additions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "highlights-panel__empty";
      empty.textContent = "No additions yet.";
      highlightsPanel.content.appendChild(empty);
      return;
    }

    const stack = document.createElement("div");
    stack.className = "highlights-panel__stack";

    additions.forEach((addition) => {
      const card = document.createElement("article");
      card.className = "highlight-card";

      const meta = document.createElement("div");
      meta.className = "highlight-card__meta";
      const type = document.createElement("span");
      type.textContent = addition.type;
      const time = document.createElement("span");
      time.textContent = formatRelativeTime(addition.created_at);
      meta.appendChild(type);
      meta.appendChild(time);

      const title = document.createElement("div");
      title.className = "highlight-card__title";
      title.textContent = formatSnippet(getAdditionLabel(addition));

      card.appendChild(meta);
      card.appendChild(title);

      if (addition.type === "audio") {
        const audioPayload = addition.payload || {};
        const url = audioPayload?.audio?.url;
        if (url) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "metadata";
          audio.addEventListener("error", () => {
            log("Audio element error", {
              code: audio.error?.code,
              message: audio.error?.message,
            });
          });
          audio.addEventListener("loadedmetadata", () => {
            log("Audio metadata loaded", { duration: audio.duration });
          });
          resolveMediaUrl(url).then((src) => {
            audio.src = src;
            audio.load();
            ensureAudioDuration(audio);
          });
          card.appendChild(audio);
        }
      }

      const selection = selectionById.get(addition.selection_id);
      if (selection) {
        const hint = document.createElement("div");
        hint.className = "highlight-card__hint";
        hint.textContent = `From: ${formatSnippet(getSelectionSnippet(selection), 80)}`;
        card.appendChild(hint);
      }

      card.addEventListener("click", () => {
        openHighlightDetail({
          type: "addition",
          selectionId: addition.selection_id,
          additionId: addition.id,
        });
      });

      stack.appendChild(card);
    });

    highlightsPanel.content.appendChild(stack);
  }

  function renderMarkersTab() {
    const { markers, selectionById, additionById } = state.highlightsData;
    if (markers.length === 0) {
      const empty = document.createElement("div");
      empty.className = "highlights-panel__empty";
      empty.textContent = "No markers yet.";
      highlightsPanel.content.appendChild(empty);
      return;
    }

    const stack = document.createElement("div");
    stack.className = "highlights-panel__stack";

    markers.forEach((item) => {
      const card = document.createElement("article");
      card.className = "highlight-card";

      const meta = document.createElement("div");
      meta.className = "highlight-card__meta";
      const kind = document.createElement("span");
      kind.className = "highlight-card__pill";
      kind.textContent = item.marker.kind;
      const time = document.createElement("span");
      time.textContent = formatRelativeTime(item.marker.created_at);
      meta.appendChild(kind);
      meta.appendChild(time);

      const title = document.createElement("div");
      title.className = "highlight-card__title";

      if (item.additionId) {
        const addition = additionById.get(item.additionId);
        title.textContent = addition
          ? `Artifact: ${formatSnippet(getAdditionLabel(addition), 90)}`
          : "Artifact marker";
      } else {
        const selection = selectionById.get(item.selectionId);
        title.textContent = selection
          ? `Selection: ${formatSnippet(getSelectionSnippet(selection), 90)}`
          : "Selection marker";
      }

      card.appendChild(meta);
      card.appendChild(title);

      card.addEventListener("click", () => {
        if (item.additionId) {
          openHighlightDetail({
            type: "addition",
            selectionId: item.selectionId,
            additionId: item.additionId,
          });
        } else {
          openHighlightDetail({
            type: "selection",
            selectionId: item.selectionId,
          });
        }
      });

      stack.appendChild(card);
    });

    highlightsPanel.content.appendChild(stack);
  }

  function openHighlightDetail(detail) {
    state.highlightDetail = detail;
    renderHighlightDetailModal();
    showHighlightDetailModal();
  }

  function renderHighlightDetailModal() {
    const detail = state.highlightDetail;
    if (!detail) {
      return;
    }
    highlightDetailModal.body.innerHTML = "";
    const { bundles } = state.highlightsData;
    const bundle = bundles.find((item) => item.selection.id === detail.selectionId);
    if (!bundle) {
      highlightDetailModal.title.textContent = "Highlight";
      const empty = document.createElement("div");
      empty.textContent = "Selection not found.";
      highlightDetailModal.body.appendChild(empty);
      return;
    }

    if (detail.type === "selection") {
      highlightDetailModal.title.textContent = "Selection";
      const snippet = document.createElement("div");
      snippet.className = "highlight-detail__snippet";
      snippet.textContent = getSelectionSnippet(bundle.selection);
      highlightDetailModal.body.appendChild(snippet);

      const meta = document.createElement("div");
      meta.className = "highlight-detail__meta";
      meta.textContent = formatRelativeTime(bundle.selection.created_at);
      highlightDetailModal.body.appendChild(meta);

      const markers = document.createElement("div");
      markers.className = "highlight-detail__markers";
      const activeKinds = bundle.markers.map((marker) => marker.kind);
      renderMarkerToggle(markers, activeKinds, async (kind) => {
        await toggleSelectionMarkerForHighlights(bundle.selection.id, kind);
        renderHighlightDetailModal();
      });
      highlightDetailModal.body.appendChild(markers);

      const actions = document.createElement("div");
      actions.className = "highlight-detail__actions";
      const jump = document.createElement("button");
      jump.type = "button";
      jump.textContent = "Jump to selection";
      jump.addEventListener("click", () => {
        jumpToSelection(bundle.selection);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "highlight-detail__danger";
      remove.textContent = "Delete selection";
      remove.addEventListener("click", async () => {
        await deleteHighlightSelection(bundle.selection.id);
      });
      actions.appendChild(jump);
      actions.appendChild(remove);
      highlightDetailModal.body.appendChild(actions);

      if (bundle.additions.length) {
        const list = document.createElement("div");
        list.className = "highlight-detail__list";
        bundle.additions.forEach((addition) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "highlight-detail__list-item";
          item.textContent = `${addition.type}: ${formatSnippet(
            getAdditionLabel(addition),
            100
          )}`;
          item.addEventListener("click", () => {
            openHighlightDetail({
              type: "addition",
              selectionId: bundle.selection.id,
              additionId: addition.id,
            });
          });
          list.appendChild(item);
        });
        highlightDetailModal.body.appendChild(list);
      }
      return;
    }

    const addition = bundle.additions.find((item) => item.id === detail.additionId);
    if (!addition) {
      highlightDetailModal.title.textContent = "Addition";
      const empty = document.createElement("div");
      empty.textContent = "Addition not found.";
      highlightDetailModal.body.appendChild(empty);
      return;
    }

    highlightDetailModal.title.textContent = "Addition";
    const type = document.createElement("div");
    type.className = "highlight-detail__meta";
    type.textContent = `${addition.type} · ${formatRelativeTime(addition.created_at)}`;
    highlightDetailModal.body.appendChild(type);

    const body = document.createElement("div");
    body.className = "highlight-detail__snippet";
    body.textContent = getAdditionLabel(addition);
    highlightDetailModal.body.appendChild(body);

    if (addition.type === "audio") {
      const audioPayload = addition.payload || {};
      const url = audioPayload?.audio?.url;
      if (url) {
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "metadata";
        resolveMediaUrl(url).then((src) => {
          audio.src = src;
          audio.load();
          ensureAudioDuration(audio);
        });
        highlightDetailModal.body.appendChild(audio);
      }
    }

    if (addition.type === "explore") {
      const payload = addition.payload || {};
      const prompt = payload?.prompt ?? "";
      const response = payload?.content ?? addition.text_content ?? "";
      const chat = document.createElement("div");
      chat.className = "highlight-detail__chat chat-messages";
      const messages = [
        { role: "user", content: prompt || "Prompt unavailable." },
        { role: "assistant", content: response || "Response unavailable." },
      ];
      messages.forEach((message) => {
        const card = document.createElement("div");
        card.className = `chat-message chat-message--${message.role}`;
        appendExploreMessageParts(card, message.content, { enableZoom: false });
        chat.appendChild(card);
      });
      highlightDetailModal.body.appendChild(chat);
    }

    const additionMarkers = bundle.additionMarkers[addition.id] ?? [];
    const markerKinds = additionMarkers.map((marker) => marker.kind);
    const markers = document.createElement("div");
    markers.className = "highlight-detail__markers";
    renderMarkerToggle(markers, markerKinds, async (kind) => {
      await toggleAdditionMarkerForHighlights(addition.id, bundle.selection.id, kind);
      renderHighlightDetailModal();
    });
    highlightDetailModal.body.appendChild(markers);
  }

  function renderMarkerToggle(container, activeKinds, onToggle) {
    container.innerHTML = "";
    const kinds = ["highlight", "like", "todo", "laugh", "pending"];
    kinds.forEach((kind) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "marker-button";
      button.setAttribute("data-kind", kind);
      button.innerHTML = markerIconForKind(kind);
      if (activeKinds.includes(kind)) {
        button.classList.add("is-active");
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onToggle(kind);
      });
      container.appendChild(button);
    });
  }

  async function toggleSelectionMarkerForHighlights(selectionId, kind) {
    const bundle = state.highlightsData.bundles.find((item) => item.selection.id === selectionId);
    if (!bundle) {
      return;
    }
    const existing = bundle.markers.find((marker) => marker.kind === kind);
    if (existing) {
      await apiRequest({
        path: `/web/markers/${existing.id}`,
        method: "DELETE",
      });
    } else {
      await apiRequest({
        path: "/web/markers",
        method: "POST",
        json: {
          target_type: "selection",
          target_id: selectionId,
          kind,
        },
      });
    }
    await refreshHighlightsData({ silent: true });
  }

  async function toggleAdditionMarkerForHighlights(additionId, selectionId, kind) {
    const bundle = state.highlightsData.bundles.find((item) => item.selection.id === selectionId);
    if (!bundle) {
      return;
    }
    const additionMarkers = bundle.additionMarkers[additionId] ?? [];
    const existing = additionMarkers.find((marker) => marker.kind === kind);
    if (existing) {
      await apiRequest({
        path: `/web/markers/${existing.id}`,
        method: "DELETE",
      });
    } else {
      await apiRequest({
        path: "/web/markers",
        method: "POST",
        json: {
          target_type: "addition",
          target_id: additionId,
          kind,
        },
      });
    }
    await refreshHighlightsData({ silent: true });
  }

  async function deleteHighlightSelection(selectionId) {
    const result = await apiRequest({
      path: `/web/selections/${selectionId}`,
      method: "DELETE",
    });
    if (result.ok) {
      hideHighlightDetailModal();
      await refreshHighlightsData({ silent: true });
    }
  }

  async function resolveMediaUrl(url) {
    if (!url) {
      return "";
    }
    if (url.startsWith("http") || url.startsWith("blob:")) {
      return url;
    }
    if (mediaUrlCache.has(url)) {
      return mediaUrlCache.get(url);
    }
    const result = await sendBackgroundMessage("reader:fetchMedia", { path: url });
    if (result?.ok && result?.dataUrl) {
      log("Audio fetch ok", {
        url,
        size: result.size || 0,
        type: result.contentType,
      });
      mediaUrlCache.set(url, result.dataUrl);
      return result.dataUrl;
    }
    log("Audio fetch failed", { url, status: result?.status, error: result?.error });
    const apiBase = await getApiBaseFromBackground();
    if (!apiBase) {
      return url;
    }
    return `${apiBase}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  function ensureAudioDuration(audio) {
    let probed = false;
    const probe = () => {
      if (probed) {
        return;
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        return;
      }
      probed = true;
      const handleSeeked = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          try {
            audio.currentTime = 0;
          } catch (error) {
            log("Audio duration reset failed", error);
          }
        }
      };
      audio.addEventListener("seeked", handleSeeked, { once: true });
      try {
        audio.currentTime = 1e101;
      } catch (error) {
        log("Audio duration probe failed", error);
      }
    };
    audio.addEventListener("loadedmetadata", probe);
    audio.addEventListener("durationchange", () => {
      if (!Number.isFinite(audio.duration) || audio.duration === 0) {
        probe();
      }
    });
  }

  function getSelectionSnippet(selection) {
    const quote = selection?.selector?.quote || {};
    const exact = quote.exact || selection?.selection_text || "";
    if (exact && exact.trim()) {
      return exact;
    }
    const prefix = quote.prefix || "";
    const suffix = quote.suffix || "";
    const combined = `${prefix}${prefix && suffix ? " | " : ""}${suffix}`.trim();
    return combined || "Selection";
  }

  function getAdditionLabel(addition) {
    if (addition.type === "audio") {
      return "Audio recording";
    }
    if (addition.type === "explore") {
      return addition.text_content || "Explore response";
    }
    return addition.text_content || addition.title || addition.type || "Addition";
  }

  function formatSnippet(value, limit = 160) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "Untitled";
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit).trimEnd()}...`;
  }

  function truncateContext(text, limit = 160) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit).trimEnd()}...`;
  }

  function splitMarkdownImages(text) {
    const parts = [];
    let lastIndex = 0;
    for (const match of text.matchAll(EXPLORE_MARKDOWN_IMAGE_REGEX)) {
      const matchIndex = match.index ?? 0;
      if (matchIndex > lastIndex) {
        parts.push({ type: "text", value: text.slice(lastIndex, matchIndex) });
      }
      const alt = (match[1] || "Image").trim() || "Image";
      parts.push({ type: "image", url: match[2], alt });
      lastIndex = matchIndex + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ type: "text", value: text.slice(lastIndex) });
    }
    return parts;
  }

  function splitImageUrls(text) {
    const parts = [];
    let lastIndex = 0;
    for (const match of text.matchAll(EXPLORE_IMAGE_URL_REGEX)) {
      const matchIndex = match.index ?? 0;
      if (matchIndex > lastIndex) {
        parts.push({ type: "text", value: text.slice(lastIndex, matchIndex) });
      }
      parts.push({ type: "image", url: match[0], alt: "Image" });
      lastIndex = matchIndex + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push({ type: "text", value: text.slice(lastIndex) });
    }
    return parts;
  }

  function parseExploreMessageParts(text) {
    const withMarkdown = splitMarkdownImages(text);
    const merged = [];
    withMarkdown.forEach((part) => {
      if (part.type === "text") {
        merged.push(...splitImageUrls(part.value));
      } else {
        merged.push(part);
      }
    });
    return merged;
  }

  function appendExploreMessageParts(container, text, options = {}) {
    const enableZoom = options.enableZoom !== false;
    const parts = parseExploreMessageParts(text || "");
    if (!parts.length) {
      const span = document.createElement("span");
      span.className = "chat-message__text";
      span.textContent = text || "";
      container.appendChild(span);
      return;
    }
    parts.forEach((part, index) => {
      if (part.type === "image") {
        const wrapper = document.createElement("div");
        wrapper.className = "chat-message__image";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-message__image-button";
        const img = document.createElement("img");
        img.src = part.url;
        img.alt = part.alt || "Image";
        img.loading = "lazy";
        button.appendChild(img);
        if (enableZoom) {
          button.addEventListener("click", () => {
            openExploreZoom(part.url, part.alt);
          });
        } else {
          button.addEventListener("click", () => {
            window.open(part.url, "_blank", "noopener,noreferrer");
          });
        }
        wrapper.appendChild(button);
        container.appendChild(wrapper);
      } else {
        const span = document.createElement("span");
        span.className = "chat-message__text";
        span.textContent = part.value;
        span.dataset.index = `${index}`;
        container.appendChild(span);
      }
    });
  }

  function normalizeError(error) {
    if (!error) {
      return "Explore request failed.";
    }
    if (typeof error === "string") {
      return error;
    }
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
    return "Explore request failed.";
  }

  function cleanExploreResponse(text) {
    return String(text || "").trim();
  }

  function formatRelativeTime(value) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) {
      return "";
    }
    const diff = Date.now() - timestamp;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < minute) {
      return "Just now";
    }
    if (diff < hour) {
      return `${Math.round(diff / minute)}m ago`;
    }
    if (diff < day) {
      return `${Math.round(diff / hour)}h ago`;
    }
    return new Date(value).toLocaleDateString();
  }

  function isNearBottom(container, threshold = 80) {
    if (!container) {
      return true;
    }
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    return remaining <= threshold;
  }

  function jumpToSelection(selection) {
    const range = buildRangeFromSelector(selection.selector);
    if (!range) {
      return;
    }
    const rect = range.getBoundingClientRect();
    const scrollTop = rect.top + window.scrollY - window.innerHeight * 0.35;
    window.scrollTo({ top: Math.max(0, scrollTop), behavior: "smooth" });
    flashHighlightRange(range);
  }

  function refreshHighlightsOverlay() {
    if (!state.showHighlightsOnPage) {
      clearHighlightsOverlay();
      return;
    }
    const selections = state.highlightsData.bundles.map((bundle) => bundle.selection);
    applyHighlightsOverlay(selections);
  }

  function applyHighlightsOverlay(selections) {
    if (!supportsCssHighlights()) {
      return;
    }
    ensureHighlightStyles();
    const ranges = [];
    selections.forEach((selection) => {
      const range = buildRangeFromSelector(selection.selector);
      if (range) {
        ranges.push(range);
      }
    });
    if (ranges.length) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set("reader-ext", highlight);
    } else {
      CSS.highlights.delete("reader-ext");
    }
  }

  function clearHighlightsOverlay() {
    if (!supportsCssHighlights()) {
      return;
    }
    CSS.highlights.delete("reader-ext");
    CSS.highlights.delete("reader-ext-active");
  }

  function flashHighlightRange(range) {
    if (!supportsCssHighlights()) {
      return;
    }
    if (activeHighlightTimer) {
      window.clearTimeout(activeHighlightTimer);
    }
    const highlight = new Highlight(range);
    CSS.highlights.set("reader-ext-active", highlight);
    activeHighlightTimer = window.setTimeout(() => {
      CSS.highlights.delete("reader-ext-active");
      activeHighlightTimer = null;
    }, 1200);
  }

  function ensureHighlightStyles() {
    if (highlightStyleEl) {
      return;
    }
    highlightStyleEl = document.createElement("style");
    highlightStyleEl.id = "reader-ext-highlight-styles";
    highlightStyleEl.textContent = `
      ::highlight(reader-ext) {
        background: rgba(217, 102, 63, 0.2);
      }
      ::highlight(reader-ext-active) {
        background: rgba(217, 102, 63, 0.4);
      }
    `;
    document.head.appendChild(highlightStyleEl);
  }

  function supportsCssHighlights() {
    return typeof CSS !== "undefined" && CSS.highlights && typeof Highlight !== "undefined";
  }

  function buildRangeFromSelector(selector) {
    if (!selector?.range) {
      return null;
    }
    const startNode = getNodeFromPath(selector.range.start?.path);
    const endNode = getNodeFromPath(selector.range.end?.path);
    if (!startNode || !endNode) {
      return null;
    }
    const startInfo = resolveTextNode(startNode, selector.range.start?.offset || 0);
    const endInfo = resolveTextNode(endNode, selector.range.end?.offset || 0);
    if (!startInfo || !endInfo) {
      return null;
    }
    const range = document.createRange();
    range.setStart(startInfo.node, clampOffset(startInfo.node, startInfo.offset));
    range.setEnd(endInfo.node, clampOffset(endInfo.node, endInfo.offset));
    return range;
  }

  function clampOffset(node, offset) {
    if (!node || node.nodeType !== Node.TEXT_NODE) {
      return 0;
    }
    const length = node.data?.length ?? 0;
    return Math.min(Math.max(offset, 0), length);
  }

  function getNodeFromPath(path) {
    if (!Array.isArray(path)) {
      return null;
    }
    let current = document.body;
    for (const index of path) {
      if (!current || !current.childNodes || !current.childNodes[index]) {
        return null;
      }
      current = current.childNodes[index];
    }
    return current;
  }

  function markerIconForKind(kind) {
    switch (kind) {
      case "highlight":
        return iconHighlight();
      case "todo":
        return iconTodo();
      case "laugh":
        return iconLaugh();
      case "pending":
        return iconPending();
      case "like":
      default:
        return iconLike();
    }
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  }

  function recordLastInteraction(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    state.lastInteraction = { x, y, time: Date.now() };
  }

  function ensureSelectionForModal() {
    if (state.selection) {
      return true;
    }
    const point = state.lastInteraction || {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const range = getCaretRangeFromPoint(point.x, point.y);
    if (!range) {
      return false;
    }
    range.collapse(true);
    setSelection(range, "");
    log("Draft selection created from position", point);
    return true;
  }

  function buildSelector(range, text) {
    const startInfo = resolveTextNode(range.startContainer, range.startOffset);
    const endInfo = resolveTextNode(range.endContainer, range.endOffset);

    const startPath = startInfo ? getNodePath(startInfo.node) : getNodePath(range.startContainer);
    const endPath = endInfo ? getNodePath(endInfo.node) : getNodePath(range.endContainer);

    const prefix = startInfo ? getTextPrefix(startInfo.node, startInfo.offset) : "";
    const suffix = endInfo ? getTextSuffix(endInfo.node, endInfo.offset) : "";

    return {
      quote: {
        exact: text,
        prefix,
        suffix,
      },
      range: {
        start: {
          path: startPath,
          offset: startInfo ? startInfo.offset : range.startOffset,
        },
        end: {
          path: endPath,
          offset: endInfo ? endInfo.offset : range.endOffset,
        },
      },
    };
  }

  function getTextPrefix(node, offset) {
    const text = node.data ?? "";
    return text.slice(Math.max(0, offset - 32), offset);
  }

  function getTextSuffix(node, offset) {
    const text = node.data ?? "";
    return text.slice(offset, Math.min(text.length, offset + 32));
  }

  function getNodePath(node) {
    const path = [];
    let current = node;
    while (current && current !== document.body && current.parentNode) {
      const parent = current.parentNode;
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      path.unshift(index);
      current = parent;
    }
    return path;
  }

  function resolveTextNode(node, offset) {
    if (node.nodeType === Node.TEXT_NODE) {
      return { node, offset };
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }
    const element = node;
    const childNodes = element.childNodes;
    const candidateIndex =
      childNodes.length === 0 ? -1 : Math.min(Math.max(offset, 0), childNodes.length - 1);
    const candidate = candidateIndex >= 0 ? childNodes[candidateIndex] : null;

    const findTextNode = (root) => {
      if (!root) {
        return null;
      }
      if (root.nodeType === Node.TEXT_NODE) {
        return root;
      }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      return walker.nextNode();
    };

    const directText = findTextNode(candidate);
    if (directText) {
      return { node: directText, offset: 0 };
    }

    const fallbackText = findTextNode(element);
    if (fallbackText) {
      return { node: fallbackText, offset: 0 };
    }
    return null;
  }

  function getWordRangeAtPoint(x, y) {
    const caret = getCaretRangeFromPoint(x, y);
    if (!caret) {
      return null;
    }
    const resolved = resolveTextNode(caret.startContainer, caret.startOffset);
    if (!resolved) {
      return null;
    }
    const bounds = getWordBoundsAtOffset(resolved.node.data ?? "", resolved.offset);
    if (!bounds) {
      return null;
    }
    const range = document.createRange();
    range.setStart(resolved.node, bounds.start);
    range.setEnd(resolved.node, bounds.end);
    return range;
  }

  function getWordBoundsAtOffset(text, offset) {
    if (!text) {
      return null;
    }
    let index = Math.min(Math.max(offset, 0), text.length - 1);
    if (!isWordChar(text[index]) && index > 0 && isWordChar(text[index - 1])) {
      index -= 1;
    }
    if (!isWordChar(text[index]) && index + 1 < text.length && isWordChar(text[index + 1])) {
      index += 1;
    }
    if (!isWordChar(text[index])) {
      return null;
    }
    let start = index;
    let end = index + 1;
    while (start > 0 && isWordChar(text[start - 1])) {
      start -= 1;
    }
    while (end < text.length && isWordChar(text[end])) {
      end += 1;
    }
    return { start, end };
  }

  function isWordChar(value) {
    return /[A-Za-z0-9']/u.test(value);
  }

  function getCaretRangeFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(x, y);
    }
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (!position) {
        return null;
      }
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  function buildSpanRange(first, second) {
    const range = document.createRange();
    const comparison = first.compareBoundaryPoints(Range.START_TO_START, second);
    if (comparison <= 0) {
      range.setStart(first.startContainer, first.startOffset);
      range.setEnd(second.endContainer, second.endOffset);
    } else {
      range.setStart(second.startContainer, second.startOffset);
      range.setEnd(first.endContainer, first.endOffset);
    }
    return range;
  }

  function isEventInOverlay(event) {
    const target = event.target;
    if (overlay.root.contains(target)) {
      return true;
    }
    const path = event.composedPath ? event.composedPath() : [];
    if (
      path.includes(overlay.root) ||
      (overlay.host && path.includes(overlay.host))
    ) {
      return true;
    }
    for (const node of path) {
      if (node && node.classList) {
        if (
          node.classList.contains("action-menu") ||
          node.classList.contains("modal-backdrop") ||
          node.classList.contains("mobile-nav") ||
          node.classList.contains("highlights-panel") ||
          node.classList.contains("highlight-detail")
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function iconCheck() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10" /></svg>';
  }

  function iconClose() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6l-12 12" /></svg>';
  }

  function iconNote() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 16l9-9 3 3-9 9H6v-3z" /></svg>';
  }

  function iconAudio() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10" /><path d="M8 7v6" /><path d="M16 7v6" /><path d="M5 11a7 7 0 0014 0" /></svg>';
  }

  function iconGrammar() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 10h10M4 14h16M4 18h8" /></svg>';
  }

  function iconWord() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h6M4 12h10M4 17h14" /></svg>';
  }

  function iconBars() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5v14M12 5v14M18 5v14" /></svg>';
  }

  function iconStructure() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 12h10M7 17h12" /></svg>';
  }

  function iconLookup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></svg>';
  }

  function iconExplore() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7l4 8-8-4 4-4z" /></svg>';
  }

  function iconSettings() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 100 8 4 4 0 000-8z" /><path d="M4 12a8 8 0 011.2-4.1l2 1.2a6 6 0 000 5.8l-2 1.2A8 8 0 014 12z" /><path d="M20 12a8 8 0 01-1.2 4.1l-2-1.2a6 6 0 000-5.8l2-1.2A8 8 0 0120 12z" /><path d="M12 4a8 8 0 014.1 1.2l-1.2 2a6 6 0 00-5.8 0l-1.2-2A8 8 0 0112 4z" /><path d="M12 20a8 8 0 01-4.1-1.2l1.2-2a6 6 0 005.8 0l1.2 2A8 8 0 0112 20z" /></svg>';
  }

  function iconJump() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h10" /><path d="M11 7l5 5-5 5" /><path d="M14 4h5v16h-5" /></svg>';
  }

  function iconMap() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l6-2 6 2 4-1v13l-4 1-6-2-6 2-4-1V5l4 1z" /><path d="M10 4v14M16 6v14" /></svg>';
  }

  function iconCopy() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="11" height="11" rx="2" /><path d="M6 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1" /></svg>';
  }

  function iconMore() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>';
  }

  function iconRecord() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /></svg>';
  }

  function iconStop() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1" /></svg>';
  }

  function iconPause() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12" /></svg>';
  }

  function iconPlay() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7V5z" /></svg>';
  }

  function iconRestart() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 108-8" /><path d="M4 4v6h6" /></svg>';
  }

  function iconClear() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14" /><path d="M9 7l1 12h4l1-12" /><path d="M9 7l1-2h4l1 2" /></svg>';
  }

  function iconSave() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10" /></svg>';
  }

  function iconHighlights() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" /><path d="M8 9h8" /><path d="M8 13h6" /></svg>';
  }

  function iconQuote() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h5v6H6z" /><path d="M13 8h5v6h-5z" /></svg>';
  }

  function iconInfo() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10v6" /><path d="M12 7h.01" /></svg>';
  }

  function iconSend() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-7-4 7 4 7-16-7z" /><path d="M8.5 12h7" /></svg>';
  }

  function iconLike() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6-4.4-8.5-7.3C1.2 11.2 2 7.8 4.9 6.7 6.7 6 9 6.6 10.2 8.3L12 10.4l1.8-2.1C15 6.6 17.3 6 19.1 6.7c2.9 1.1 3.7 4.5 1.4 7-2.5 2.9-8.5 7.3-8.5 7.3z" /></svg>';
  }

  function iconHighlight() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16" /><path d="M7 15l7-7 3 3-7 7H7v-3z" /></svg>';
  }

  function iconTodo() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 12l2 2 4-4" /></svg>';
  }

  function iconLaugh() {
    return '<span class="marker-emoji" role="img" aria-label="Laugh">&#128514;</span>';
  }

  function iconPending() {
    return '<span class="marker-emoji" role="img" aria-label="Pending">&#9203;</span>';
  }
})();
