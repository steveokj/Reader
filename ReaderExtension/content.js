(() => {
  const DEFAULT_API_BASE = "https://192.168.2.34:8002";
  const STORAGE_KEY = "reader_api_base";
  const NAV_SWIPE_ZONE_HEIGHT = 120;
  const NAV_SWIPE_MIN_PX = 60;
  const NAV_SWIPE_MAX_MS = 1200;
  const DOUBLE_CLICK_WINDOW_MS = 4000;

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
    navSwipeStart: null,
  };

  const overlay = mountOverlay();
  const actionMenu = buildActionMenu();
  const noteModal = buildNoteModal();
  const grammarModal = buildGrammarModal();
  const audioModal = buildAudioModal();
  const mobileNav = buildMobileNav();

  overlay.layer.appendChild(actionMenu.el);
  overlay.layer.appendChild(noteModal.el);
  overlay.layer.appendChild(mobileNav.el);
  overlay.layer.appendChild(grammarModal.el);
  overlay.layer.appendChild(audioModal.el);

  hideActionMenu();
  hideNoteModal();
  hideMobileNav();
  hideGrammarModal();
  hideAudioModal();

  document.addEventListener("mouseup", handleMouseUp, true);
  document.addEventListener("dblclick", handleDoubleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("mousedown", handleDocumentMouseDown, true);
  document.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
  document.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });

  function mountOverlay() {
    const host = document.createElement("div");
    host.id = "reader-extension-root";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = "";
    shadow.appendChild(style);

    fetch(chrome.runtime.getURL("overlay.css"))
      .then((response) => response.text())
      .then((css) => {
        style.textContent = css;
      })
      .catch((error) => {
        console.warn("Reader extension failed to load CSS", error);
      });

    const container = document.createElement("div");
    container.className = "reader-extension";

    const layer = document.createElement("div");
    layer.className = "reader-extension__layer";
    container.appendChild(layer);

    shadow.appendChild(container);
    document.documentElement.appendChild(host);

    return { host, shadow, container, layer };
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

    el.addEventListener("mousedown", stopPropagation, true);
    el.addEventListener("mouseup", stopPropagation, true);
    el.addEventListener("click", stopPropagation, true);

    commit.addEventListener("click", async () => {
      await commitSelection();
    });

    close.addEventListener("click", () => {
      clearSelection();
      hideActionMenu();
    });

    actionButtons.note.addEventListener("click", () => {
      openNoteModal();
    });

    actionButtons.copy.addEventListener("click", async () => {
      if (state.selection) {
        try {
          await navigator.clipboard.writeText(state.selection.text);
        } catch (error) {
          console.warn("Reader extension copy failed", error);
        }
      }
    });

    actionButtons.explore.addEventListener("click", () => {
      if (!state.selection) {
        return;
      }
      const url = new URL("https://192.168.2.34:3002/explore");
      url.searchParams.set("text", state.selection.text);
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    });

    actionButtons.audio.addEventListener("click", () => {
      openAudioModal();
    });

    actionButtons.grammar.addEventListener("click", () => {
      openGrammarModal();
    });

    actionButtons.map.addEventListener("click", () => {
      handleMapAction();
    });

    actionButtons.more.addEventListener("click", () => {
      openOptionsPage();
    });

    return { el, commit, status, markers, actionButtons };
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

    el.addEventListener("mousedown", stopPropagation, true);
    el.addEventListener("click", stopPropagation, true);

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

    return { el, textarea, title };
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

    el.addEventListener("mousedown", stopPropagation, true);
    el.addEventListener("click", stopPropagation, true);

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

    el.addEventListener("mousedown", stopPropagation, true);
    el.addEventListener("click", stopPropagation, true);

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

    const handleStart = async () => {
      setError("");
      resetAudio();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onstop = () => {
          audioBlob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
          audioUrl = URL.createObjectURL(audioBlob);
          audio.src = audioUrl;
          audio.style.display = "block";
          setMode("recorded");
          stopTracks();
        };
        recorder.start();
        setMode("recording");
      } catch (err) {
        setError("Microphone access denied or unavailable.");
        stopTracks();
        setMode("idle");
      }
    };

    const handleStop = () => {
      if (recorder && (mode === "recording" || mode === "paused")) {
        recorder.stop();
      }
    };

    const handleTogglePause = () => {
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
      if (mode === "recording" || mode === "paused") {
        handleStop();
      }
      stopTracks();
      resetAudio();
      setMode("idle");
    };

    const handleClear = () => {
      resetAudio();
      clearSelection();
      hideActionMenu();
      setMode("idle");
    };

    const handleUpload = async () => {
      if (!audioBlob) {
        return;
      }
      setMode("uploading");
      setError("");

      const mime = audioBlob.type || "audio/webm";
      const formData = new FormData();
      formData.append("file", audioBlob, "recording.webm");
      formData.append("mime", mime);

      try {
        const apiBase = await getApiBase();
        const response = await fetch(`${apiBase}/media/audio`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error("Upload failed");
        }
        const data = await response.json();
        await saveAudio(data);
        hideAudioModal();
      } catch (err) {
        setError("Upload failed. Please try again.");
        setMode("recorded");
      }
    };

    const handleClose = () => {
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

    return { el, resetModal };
  }

  function buildMobileNav() {
    const el = document.createElement("div");
    el.className = "mobile-nav";

    const buttons = {
      note: createNavButton(iconNote(), "Note"),
      audio: createNavButton(iconAudio(), "Audio"),
      explore: createNavButton(iconExplore(), "Explore"),
      grammar: createNavButton(iconGrammar(), "Grammar"),
      highlights: createNavButton(iconHighlights(), "Highlights"),
    };

    Object.values(buttons).forEach((button) => el.appendChild(button));

    el.addEventListener("mousedown", stopPropagation, true);
    el.addEventListener("click", stopPropagation, true);

    buttons.note.addEventListener("click", () => {
      openNoteModal();
    });

    buttons.highlights.addEventListener("click", async () => {
      await commitSelection();
    });

    buttons.audio.addEventListener("click", () => {
      openAudioModal();
    });

    buttons.grammar.addEventListener("click", () => {
      openGrammarModal();
    });

    buttons.explore.addEventListener("click", () => {
      if (!state.selection) {
        return;
      }
      const url = new URL("https://192.168.2.34:3002/explore");
      url.searchParams.set("text", state.selection.text);
      window.open(url.toString(), "_blank", "noopener,noreferrer");
    });

    return { el, buttons };
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
    overlay.shadow.querySelectorAll(".marker-button").forEach((button) => {
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
  }

  function showMobileNav() {
    mobileNav.el.style.display = "grid";
    state.navOpen = true;
  }

  function hideMobileNav() {
    mobileNav.el.style.display = "none";
    state.navOpen = false;
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
    setSelection(spanRange, text);
    showActionMenu(rect);
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      hideActionMenu();
      hideNoteModal();
      hideGrammarModal();
      closeAudioModal();
      hideMobileNav();
    }
  }

  function handleDocumentMouseDown(event) {
    if (isEventInOverlay(event)) {
      return;
    }
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
    if (actionMenu.el.style.display !== "none") {
      hideActionMenu();
    }
    if (state.navOpen) {
      hideMobileNav();
    }
  }

  function handleTouchStart(event) {
    if (!event.touches || event.touches.length !== 1) {
      return;
    }
    const touch = event.touches[0];
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
  }

  function clearSelection() {
    state.selection = null;
    state.selectionId = null;
    state.isCommitted = false;
    state.isSaving = false;
    state.markerIds.clear();
    updateActionMenuStatus();
    updateMarkerButtons();
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
      const apiBase = await getApiBase();
      const response = await fetch(`${apiBase}/web/selections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: window.location.href,
          title: document.title,
          selection_text: state.selection.text,
          selector: state.selection.selector,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save selection");
      }
      const data = await response.json();
      state.selectionId = data.selection?.id ?? null;
      state.isCommitted = true;
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

  async function createWebAddition({ type, title = null, textContent = null, payload = {} }) {
    const selectionId = await ensureSelectionId();
    if (!selectionId) {
      return null;
    }
    try {
      const apiBase = await getApiBase();
      const response = await fetch(`${apiBase}/web/additions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selection_id: selectionId,
          type,
          title,
          text_content: textContent,
          payload,
        }),
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return data.addition ?? null;
    } catch (error) {
      console.warn("Reader extension addition save failed", error);
      return null;
    }
  }

  async function saveNote(text) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    if (!state.selection) {
      return;
    }
    await createWebAddition({
      type: "note",
      textContent: trimmed,
      payload: { text: trimmed },
    });
  }

  async function saveGrammar(payload) {
    const textContent =
      payload.kind === "word" || payload.kind === "bars" ? payload.text ?? null : null;
    await createWebAddition({
      type: "grammar",
      textContent,
      payload,
    });
  }

  async function saveAudio(audioPayload) {
    await createWebAddition({
      type: "audio",
      payload: { audio: audioPayload },
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
      const apiBase = await getApiBase();
      if (state.markerIds.has(kind)) {
        const markerId = state.markerIds.get(kind);
        await fetch(`${apiBase}/web/markers/${markerId}`, { method: "DELETE" });
        state.markerIds.delete(kind);
      } else {
        const response = await fetch(`${apiBase}/web/markers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            target_type: "selection",
            target_id: selectionId,
            kind,
            value: null,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.marker?.id) {
            state.markerIds.set(kind, data.marker.id);
          }
        }
      }
    } catch (error) {
      console.warn("Reader extension marker toggle failed", error);
    } finally {
      updateMarkerButtons();
    }
  }

  function openNoteModal() {
    if (!state.selection) {
      return;
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

  function openAudioModal() {
    if (!state.selection) {
      return;
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
    const path = event.composedPath ? event.composedPath() : [];
    return path.includes(overlay.host) || path.includes(overlay.container);
  }

  let apiBasePromise = null;
  function getApiBase() {
    if (apiBasePromise) {
      return apiBasePromise;
    }
    apiBasePromise = new Promise((resolve) => {
      try {
        chrome.storage.sync.get([STORAGE_KEY], (data) => {
          resolve(data[STORAGE_KEY] || DEFAULT_API_BASE);
        });
      } catch (error) {
        resolve(DEFAULT_API_BASE);
      }
    });
    return apiBasePromise;
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
