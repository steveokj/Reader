(() => {
  if (window.__webSlicerInitialized) {
    return;
  }
  window.__webSlicerInitialized = true;

  const state = {
    visible: false,
    mode: "idle",
    startElement: null,
    segments: [],
    excludes: [],
    highlightTarget: null,
    libraryOpen: false,
    libraryFilter: "page",
    libraryType: "all",
    lastPickedElement: null,
    undoStack: [],
    redoStack: [],
    sliceStartY: null,
    sliceStartAnchor: null,
    sliceStartOffsetRatio: null,
    lastPreview: null,
    fullPreviewMode: "slice-in-page",
    sliceOnlyMode: "mask",
    pageSnapshotUrl: null,
    lastPageSave: null,
    scrollLock: null,
  };

  const SETTINGS_KEYS = {
    defaultMode: "slicer_default_mode",
    doubleClickLibrary: "slicer_double_click_library",
    hotkeySave: "slicer_hotkey_save",
    autoSaveOnEnd: "slicer_auto_save_on_end",
  };

  const overlay = mountOverlay();
  const toolbar = buildToolbar();
  const previewPanel = buildPreviewPanel();
  const libraryPanel = buildLibraryPanel();
  const segmentLayer = buildSegmentLayer();
  const sliceLine = buildSliceLine("slicer-slice-line");
  const sliceStartLine = buildSliceLine("slicer-slice-start");
  const fullPreview = buildFullPreview();
  const highlight = buildHighlight();

  overlay.uiRoot.appendChild(toolbar.el);
  overlay.uiRoot.appendChild(previewPanel.el);
  overlay.uiRoot.appendChild(libraryPanel.el);
  overlay.uiRoot.appendChild(segmentLayer.el);
  overlay.uiRoot.appendChild(sliceLine.el);
  overlay.uiRoot.appendChild(sliceStartLine.el);
  overlay.uiRoot.appendChild(fullPreview.el);
  overlay.uiRoot.appendChild(highlight.el);

  updateStatus();

  hideToolbar();
  hidePreview();
  hideLibrary();
  hideHighlight();
  hideFullPreview();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "slicer-toggle") {
      toggleToolbar();
    }
    if (message?.type === "slicer-open-library") {
      handleToggleToolbar({ openLibrary: true });
    }
    if (message?.type === "slicer-save-now") {
      saveSlice();
    }
  });

  document.addEventListener("mousemove", handleHover, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("mousedown", handleMouseDown, true);
  document.addEventListener("selectstart", handleSelectStart, true);
  document.addEventListener("keydown", handleKeyDown, true);
  window.addEventListener("scroll", handleViewportChange, { passive: true });
  window.addEventListener("resize", handleViewportChange);

  function mountOverlay() {
    const host = document.createElement("div");
    host.id = "web-slicer-root";
    const shadow = host.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("overlay.css");
    shadow.appendChild(link);

    const uiRoot = document.createElement("div");
    uiRoot.className = "slicer-ui";
    shadow.appendChild(uiRoot);

    document.documentElement.appendChild(host);
    return { host, shadow, uiRoot };
  }

  function buildToolbar() {
    const el = document.createElement("div");
    el.className = "slicer-toolbar";

    const left = document.createElement("div");
    left.className = "slicer-toolbar__left";

    const right = document.createElement("div");
    right.className = "slicer-toolbar__right";

    const status = document.createElement("div");
    status.className = "slicer-status";

    const pick = createButton("Pick");
    const slice = createButton("Slice");
    const page = createButton("Page");
    const exclude = createButton("Exclude");
    const preview = createButton("Preview");
    const library = createButton("Library");
    const save = createButton("Save");
    const reset = createButton("Reset");
    const close = createButton("Close");
    
    

    left.appendChild(pick);
    left.appendChild(slice);
    left.appendChild(page);
    left.appendChild(exclude);
    left.appendChild(preview);
    left.appendChild(library);

    right.appendChild(save);
    right.appendChild(reset);
    right.appendChild(close);

    el.appendChild(left);
    el.appendChild(status);
    el.appendChild(right);

    el.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    pick.addEventListener("click", () => togglePickMode());
    slice.addEventListener("click", () => toggleSliceMode());
    page.addEventListener("click", () => capturePageSnapshot());
    exclude.addEventListener("click", () => setMode("exclude"));
    preview.addEventListener("click", () => togglePreview());
    library.addEventListener("click", () => toggleLibrary());
    reset.addEventListener("click", () => resetState());
    close.addEventListener("click", () => hideToolbar());
    save.addEventListener("click", () => saveSlice());

    return {
      el,
      status,
      pick,
      slice,
      page,
      exclude,
      preview,
      library,
      save,
      reset,
      close,
    };
  }

  function buildPreviewPanel() {
    const el = document.createElement("div");
    el.className = "slicer-preview";

    const header = document.createElement("div");
    header.className = "slicer-preview__header";
    const title = document.createElement("div");
    title.textContent = "Preview";

    const actions = document.createElement("div");
    actions.className = "slicer-preview__actions";
    const showText = createButton("Text");
    const showHtml = createButton("HTML");
    const full = createButton("Full");
    const close = createButton("X");
    close.classList.add("slicer-preview__close");
    close.setAttribute("aria-label", "Close preview");
    actions.appendChild(showText);
    actions.appendChild(showHtml);
    actions.appendChild(full);
    actions.appendChild(close);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement("div");
    body.className = "slicer-preview__body";

    const text = document.createElement("pre");
    text.className = "slicer-preview__text";

    const html = document.createElement("div");
    html.className = "slicer-preview__html";
    html.style.display = "none";

    body.appendChild(text);
    body.appendChild(html);
    el.appendChild(header);
    el.appendChild(body);

    showText.addEventListener("click", () => setPreviewMode("text"));
    showHtml.addEventListener("click", () => setPreviewMode("html"));
    full.addEventListener("click", () => showFullPreview());
    close.addEventListener("click", () => hidePreview());
    el.addEventListener("wheel", handlePreviewWheel, { passive: false });

    return { el, text, html, showText, showHtml, full, mode: "text" };
  }

  function buildLibraryPanel() {
    const el = document.createElement("div");
    el.className = "slicer-library";

    const header = document.createElement("div");
    header.className = "slicer-library__header";

    const title = document.createElement("div");
    title.textContent = "Saved slices";

    const headerActions = document.createElement("div");
    headerActions.className = "slicer-library__actions";

    const filter = createButton("This page");
    const typeAll = createButton("All");
    const typePicks = createButton("Picks");
    const typeSlices = createButton("Slices");
    const refreshPage = createButton("Refresh page");
    const refresh = createButton("Refresh");
    const close = createButton("Close");
    headerActions.appendChild(filter);
    headerActions.appendChild(typeAll);
    headerActions.appendChild(typePicks);
    headerActions.appendChild(typeSlices);
    headerActions.appendChild(refreshPage);
    headerActions.appendChild(refresh);
    headerActions.appendChild(close);

    header.appendChild(title);
    header.appendChild(headerActions);

    const body = document.createElement("div");
    body.className = "slicer-library__body";

    const list = document.createElement("div");
    list.className = "slicer-library__list";
    body.appendChild(list);

    el.appendChild(header);
    el.appendChild(body);

    el.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    filter.addEventListener("click", () => toggleLibraryFilter());
    typeAll.addEventListener("click", () => setLibraryType("all"));
    typePicks.addEventListener("click", () => setLibraryType("pick"));
    typeSlices.addEventListener("click", () => setLibraryType("slice"));
    refreshPage.addEventListener("click", () => refreshPageHtml());
    refresh.addEventListener("click", () => loadLibrary());
    close.addEventListener("click", () => hideLibrary());

    return { el, list, filter, typeAll, typePicks, typeSlices, refreshPage };
  }

  function buildFullPreview() {
    const el = document.createElement("div");
    el.className = "slicer-full";

    const card = document.createElement("div");
    card.className = "slicer-full__card";

    const header = document.createElement("div");
    header.className = "slicer-full__header";

    const title = document.createElement("div");
    title.className = "slicer-full__title";
    title.textContent = "Slice Preview";

    const saved = document.createElement("div");
    saved.className = "slicer-full__saved";

    const actions = document.createElement("div");
    actions.className = "slicer-full__actions";
    const modeSlice = createButton("Slice only");
    const modeSliceInPage = createButton("Slice in page");
    const modePage = createButton("Page");
    actions.appendChild(modeSlice);
    actions.appendChild(modeSliceInPage);
    actions.appendChild(modePage);

    const sliceOnlyActions = document.createElement("div");
    sliceOnlyActions.className = "slicer-full__slice-actions";
    const sliceMask = createButton("Mask");
    const sliceFragment = createButton("Fragment + head");
    const sliceClip = createButton("Clip");
    const sliceInline = createButton("Inline styles");
    sliceOnlyActions.appendChild(sliceMask);
    sliceOnlyActions.appendChild(sliceFragment);
    sliceOnlyActions.appendChild(sliceClip);
    sliceOnlyActions.appendChild(sliceInline);

    const close = createButton("X");
    close.classList.add("slicer-full__close");
    close.setAttribute("aria-label", "Close full preview");

    header.appendChild(title);
    header.appendChild(saved);
    header.appendChild(actions);
    header.appendChild(sliceOnlyActions);
    header.appendChild(close);

    const iframe = document.createElement("iframe");
    iframe.className = "slicer-full__frame";
    iframe.setAttribute("sandbox", "allow-same-origin allow-popups allow-forms");

    card.appendChild(header);
    card.appendChild(iframe);
    el.appendChild(card);

    modeSlice.addEventListener("click", () => setFullPreviewMode("slice-only"));
    modeSliceInPage.addEventListener("click", () => setFullPreviewMode("slice-in-page"));
    modePage.addEventListener("click", () => setFullPreviewMode("page"));
    sliceMask.addEventListener("click", () => setSliceOnlyMode("mask"));
    sliceFragment.addEventListener("click", () => setSliceOnlyMode("fragment"));
    sliceClip.addEventListener("click", () => setSliceOnlyMode("clip"));
    sliceInline.addEventListener("click", () => setSliceOnlyMode("inline"));
    close.addEventListener("click", () => hideFullPreview());
    el.addEventListener("click", (event) => {
      if (event.target === el) {
        hideFullPreview();
      }
    });

    return {
      el,
      iframe,
      title,
      saved,
      modeSlice,
      modeSliceInPage,
      modePage,
      sliceOnlyActions,
      sliceMask,
      sliceFragment,
      sliceClip,
      sliceInline,
    };
  }

  function buildSliceLine(className) {
    const el = document.createElement("div");
    el.className = className;
    el.style.display = "none";
    return { el };
  }

  function buildSegmentLayer() {
    const el = document.createElement("div");
    el.className = "slicer-segments";
    return { el };
  }

  function buildHighlight() {
    const el = document.createElement("div");
    el.className = "slicer-highlight";
    return { el };
  }

  function createButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    return button;
  }

  function setMode(mode) {
    state.mode = mode;
    updateStatus();
  }

  function togglePickMode() {
    if (state.mode === "pick") {
      state.mode = "idle";
      state.startElement = null;
      state.lastPickedElement = null;
    } else {
      state.mode = "pick";
      state.startElement = null;
      state.lastPickedElement = null;
      state.sliceStartY = null;
      hideSliceLines();
    }
    updateStatus();
  }

  function toggleSliceMode() {
    if (state.mode === "slice") {
      state.mode = "idle";
      state.sliceStartY = null;
      state.sliceStartAnchor = null;
      state.sliceStartOffsetRatio = null;
      hideSliceLines();
    } else {
      state.mode = "slice";
      state.startElement = null;
      state.lastPickedElement = null;
      state.sliceStartY = null;
      state.sliceStartAnchor = null;
      state.sliceStartOffsetRatio = null;
      hideHighlight();
    }
    updateStatus();
  }

  function resetState() {
    state.mode = "idle";
    state.startElement = null;
    state.lastPickedElement = null;
    state.sliceStartY = null;
    state.sliceStartAnchor = null;
    state.sliceStartOffsetRatio = null;
    state.segments = [];
    state.excludes = [];
    state.undoStack = [];
    state.redoStack = [];
    state.lastPreview = null;
    state.libraryType = "all";
    hidePreview();
    hideLibrary();
    hideFullPreview();
    clearSegmentHighlights();
    hideSliceLines();
    updateStatus();
  }

  function updateStatus(message = "") {
    const base = `Segments: ${state.segments.length} - Excludes: ${state.excludes.length}`;
    const mode = state.mode !== "idle" ? ` - ${state.mode}` : "";
    toolbar.status.textContent = message ? `${message} - ${base}${mode}` : `${base}${mode}`;
    if (toolbar.pick) {
      toolbar.pick.classList.toggle("active", state.mode === "pick");
    }
    if (toolbar.slice) {
      toolbar.slice.classList.toggle("active", state.mode === "slice");
    }
  }

  async function getExtensionSettings() {
    const data = await chrome.storage.sync.get(Object.values(SETTINGS_KEYS));
    return {
      defaultMode: data[SETTINGS_KEYS.defaultMode] || "pick",
      autoSaveOnEnd:
        typeof data[SETTINGS_KEYS.autoSaveOnEnd] === "boolean"
          ? data[SETTINGS_KEYS.autoSaveOnEnd]
          : true,
    };
  }

  async function toggleToolbar() {
    await handleToggleToolbar();
  }

  async function handleToggleToolbar(options = {}) {
    if (options.openLibrary) {
      if (!state.visible) {
        const settings = await getExtensionSettings();
        showToolbar({ startMode: settings.defaultMode });
      }
      showLibrary();
      return;
    }
    if (state.visible) {
      hideToolbar();
      return;
    }
    const settings = await getExtensionSettings();
    showToolbar({ startMode: settings.defaultMode });
  }

  function showToolbar(options = {}) {
    state.visible = true;
    overlay.uiRoot.style.display = "block";
    toolbar.el.style.display = "flex";
    if (options.startMode) {
      applyStartMode(options.startMode);
    }
    updateStatus();
    renderSegmentHighlights();
  }

  function applyStartMode(mode) {
    state.startElement = null;
    state.lastPickedElement = null;
    state.sliceStartY = null;
    hideSliceLines();
    if (mode === "slice") {
      state.mode = "slice";
      hideHighlight();
    } else if (mode === "none" || mode === "idle") {
      state.mode = "idle";
    } else {
      state.mode = "pick";
    }
  }

  function hideToolbar() {
    state.visible = false;
    state.mode = "idle";
    state.startElement = null;
    state.lastPickedElement = null;
    state.sliceStartY = null;
    state.sliceStartAnchor = null;
    state.sliceStartOffsetRatio = null;
    state.undoStack = [];
    state.redoStack = [];
    state.lastPreview = null;
    state.libraryType = "all";
    overlay.uiRoot.style.display = "none";
    toolbar.el.style.display = "none";
    hidePreview();
    hideLibrary();
    hideFullPreview();
    hideHighlight();
    clearSegmentHighlights();
    hideSliceLines();
  }

  function togglePreview() {
    if (previewPanel.el.style.display === "block") {
      hidePreview();
    } else {
      showPreview();
    }
  }

  function showPreview() {
    const snapshot = buildSnapshot();
    if (!snapshot) {
      updateStatus("Nothing to preview");
      return;
    }
    const pageHtml = buildCleanPageHtml();
    const sliceRanges = getSliceRangesFromSegments(state.segments);
    const pageMetrics = buildPageMetrics();
    setPreviewContent({
      text: snapshot.text,
      html: snapshot.html,
      mode: "html",
      baseUrl: window.location.href,
      title: document.title,
      pageHtml,
      sliceRanges,
      pageMetrics,
    });
  }

  async function capturePageSnapshot() {
    updateStatus("Capturing page...");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-capture-page",
        saveToDisk: true,
        title: document.title || "",
        url: window.location.href,
      });
      console.info("[WebSlicer] capture response", response);
      if (!response?.ok) {
        throw new Error(response?.error || "Capture failed");
      }
      const data = response.data;
      if (!data || !data.byteLength) {
        throw new Error("Empty snapshot");
      }
      const blob = new Blob([data], {
        type: response.mime || "multipart/related",
      });
      const url = URL.createObjectURL(blob);
      state.lastPageSave = {
        saved: !!response.saved,
        fileName: response.fileName || "",
        folderName: response.folderName || "",
        saveError: response.saveError || "",
      };
      openPageSnapshot(url, document.title || window.location.href);
      if (response.saved) {
        updateStatus("Page captured and saved");
      } else if (response.saveError) {
        console.warn("Page save failed", response.saveError);
        updateStatus("Page captured (save failed)");
      } else {
        updateStatus("Page captured");
      }
    } catch (error) {
      console.warn("Page capture failed", error);
      updateStatus("Page capture failed");
    }
  }

  function hidePreview() {
    previewPanel.el.style.display = "none";
  }

  function showFullPreview() {
    if (!state.lastPreview) {
      updateStatus("Nothing to open");
      return;
    }
    const defaultMode = state.lastPreview.sliceRanges?.length ? "slice-in-page" : "page";
    openFullPreview({ ...state.lastPreview, mode: defaultMode });
  }

  function hideFullPreview() {
    fullPreview.el.style.display = "none";
    if (fullPreview.iframe) {
      fullPreview.iframe.srcdoc = "";
      fullPreview.iframe.removeAttribute("srcdoc");
      fullPreview.iframe.src = "about:blank";
    }
    clearPageSnapshot();
    state.lastPageSave = null;
    if (fullPreview.saved) {
      fullPreview.saved.innerHTML = "";
    }
    unlockScroll();
  }

  function clearPageSnapshot() {
    if (!state.pageSnapshotUrl) {
      return;
    }
    try {
      URL.revokeObjectURL(state.pageSnapshotUrl);
    } catch (error) {
      console.warn("Page snapshot revoke failed", error);
    }
    state.pageSnapshotUrl = null;
  }

  function openPageSnapshot(url, title) {
    clearPageSnapshot();
    state.pageSnapshotUrl = url;
    state.fullPreviewMode = "page";
    updateFullPreviewButtons();
    fullPreview.title.textContent = title || "Page Snapshot";
    updateFullPreviewSavedInfo();
    if (fullPreview.iframe) {
      fullPreview.iframe.onload = null;
      fullPreview.iframe.removeAttribute("srcdoc");
      fullPreview.iframe.setAttribute(
        "sandbox",
        "allow-same-origin allow-popups allow-forms allow-downloads"
      );
      fullPreview.iframe.src = url;
      fullPreview.iframe.style.width = "100%";
      fullPreview.iframe.style.maxWidth = "";
      fullPreview.iframe.style.margin = "0";
      fullPreview.iframe.style.display = "block";
    }
    fullPreview.el.style.display = "flex";
    lockScroll();
  }

  async function openSavedMhtml(fileName) {
    if (!fileName) {
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-open-saved-mhtml",
        fileName,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Open failed");
      }
      const blob = new Blob([response.data], {
        type: response.mime || "multipart/related",
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.warn("Open saved MHTML failed", error);
      updateStatus("Open saved file failed");
    }
  }

  function updateFullPreviewSavedInfo() {
    if (!fullPreview.saved) {
      return;
    }
    fullPreview.saved.innerHTML = "";
    const info = state.lastPageSave;
    if (!info) {
      return;
    }
    if (info.saved) {
      const text = document.createElement("span");
      const location = info.folderName ? `${info.folderName}/${info.fileName}` : info.fileName;
      text.textContent = `Saved: ${location}`;
      fullPreview.saved.appendChild(text);
      if (info.fileName) {
        const link = document.createElement("button");
        link.type = "button";
        link.textContent = "Open saved";
        link.addEventListener("click", () => openSavedMhtml(info.fileName));
        fullPreview.saved.appendChild(link);
      }
      return;
    }
    if (info.saveError) {
      const errorText = document.createElement("span");
      errorText.textContent = `Save failed: ${info.saveError}`;
      fullPreview.saved.appendChild(errorText);
      return;
    }
    const pending = document.createElement("span");
    pending.textContent = "Not saved";
    fullPreview.saved.appendChild(pending);
  }

  function setFullPreviewMode(mode) {
    state.fullPreviewMode = mode;
    if (!state.lastPreview) {
      return;
    }
    openFullPreview({ ...state.lastPreview, mode });
  }

  function setSliceOnlyMode(mode) {
    state.sliceOnlyMode = mode;
    updateFullPreviewButtons();
    if (!state.lastPreview || state.fullPreviewMode !== "slice-only") {
      return;
    }
    openFullPreview({ ...state.lastPreview, mode: "slice-only" });
  }

  function setPreviewMode(mode) {
    previewPanel.mode = mode;
    previewPanel.text.style.display = mode === "text" ? "block" : "none";
    previewPanel.html.style.display = mode === "html" ? "block" : "none";
    previewPanel.showText.disabled = mode === "text";
    previewPanel.showHtml.disabled = mode === "html";
  }

  function setPreviewContent({
    text,
    html,
    mode,
    baseUrl,
    title,
    pageHtml,
    sliceRanges,
    pageMetrics,
  }) {
    previewPanel.text.textContent = text || "(no text)";
    previewPanel.html.innerHTML = html || "";
    setPreviewMode(mode || "text");
    previewPanel.el.style.display = "block";
    state.lastPreview = {
      html: html || "",
      text: text || "",
      baseUrl: baseUrl || window.location.href,
      title: title || "Slice Preview",
      pageHtml: pageHtml || "",
      sliceRanges: Array.isArray(sliceRanges) ? sliceRanges : [],
      pageMetrics: pageMetrics || null,
    };
  }

  function toggleLibrary() {
    if (libraryPanel.el.style.display === "block") {
      hideLibrary();
    } else {
      showLibrary();
    }
  }

  function showLibrary() {
    libraryPanel.el.style.display = "block";
    state.libraryOpen = true;
    updateLibraryFilterButton();
    updateLibraryTypeButtons();
    loadLibrary();
  }

  function hideLibrary() {
    libraryPanel.el.style.display = "none";
    state.libraryOpen = false;
  }

  function toggleLibraryFilter() {
    state.libraryFilter = state.libraryFilter === "page" ? "all" : "page";
    updateLibraryFilterButton();
    loadLibrary();
  }

  function setLibraryType(type) {
    state.libraryType = type;
    updateLibraryTypeButtons();
    loadLibrary();
  }

  function updateLibraryFilterButton() {
    if (!libraryPanel.filter) {
      return;
    }
    if (state.libraryFilter === "page") {
      libraryPanel.filter.textContent = "This page";
      libraryPanel.filter.classList.add("active");
    } else {
      libraryPanel.filter.textContent = "All pages";
      libraryPanel.filter.classList.remove("active");
    }
  }

  async function loadLibrary() {
    libraryPanel.list.innerHTML = "";
    const loading = document.createElement("div");
    loading.className = "slicer-library__empty";
    loading.textContent = "Loading...";
    libraryPanel.list.appendChild(loading);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-list",
        url: state.libraryFilter === "page" ? window.location.href : null,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Failed to load");
      }
      const filtered = filterLibraryItems(response.slices || []);
      renderLibrary(filtered);
    } catch (error) {
      libraryPanel.list.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = "slicer-library__empty";
      fallback.textContent = "Failed to load saved slices.";
      libraryPanel.list.appendChild(fallback);
    }
  }

  function renderLibrary(items) {
    libraryPanel.list.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "slicer-library__empty";
      empty.textContent = "No saved slices yet.";
      libraryPanel.list.appendChild(empty);
      return;
    }
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "slicer-library__item";

      const type = getItemType(item);
      const title = document.createElement("div");
      title.className = "slicer-library__title";
      title.textContent = item.slice_title || item.page_title || item.url;

      const meta = document.createElement("div");
      meta.className = "slicer-library__meta";
      meta.textContent = `${type.toUpperCase()} - ${item.url} - ${formatDate(item.created_at)}`;

      const actions = document.createElement("div");
      actions.className = "slicer-library__item-actions";

      const preview = createButton(type === "slice" ? "Full" : "Preview");
      const copyHtml = createButton("Copy HTML");
      const copyText = createButton("Copy text");
      const remove = createButton("Delete");
      const openFull = createButton("Full");

      preview.addEventListener("click", () => {
        if (type === "slice") {
          openSliceFromLibrary(item);
          return;
        }
        setPreviewContent({
          text: item.text,
          html: item.html,
          mode: "html",
          baseUrl: item.url || window.location.href,
          title: item.slice_title || item.page_title || item.url || "Slice Preview",
        });
      });
      copyHtml.addEventListener("click", async () => {
        await copyToClipboard(item.html || "");
      });
      copyText.addEventListener("click", async () => {
        await copyToClipboard(item.text || "");
      });
      remove.addEventListener("click", async () => {
        await deleteSlice(item.id);
      });
      openFull.addEventListener("click", () => {
        const baseUrl = item.url || window.location.href;
        const title = item.slice_title || item.page_title || item.url || "Slice Preview";
        state.lastPreview = {
          html: item.html || "",
          text: item.text || "",
          baseUrl,
          title,
          pageHtml: "",
          sliceRanges: [],
        };
        openFullPreview({
          html: item.html || "",
          baseUrl,
          title,
        });
      });

      actions.appendChild(preview);
      actions.appendChild(copyHtml);
      actions.appendChild(copyText);
      if (type === "pick") {
        actions.appendChild(openFull);
      }
      actions.appendChild(remove);

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(actions);
      libraryPanel.list.appendChild(row);
    });
  }

  async function openSliceFromLibrary(item) {
    const snapshot = item.snapshot_id ? await fetchSnapshotHtml(item.snapshot_id) : null;
    const pageHtml = snapshot?.html || (await fetchPageHtml(item.page_id));
    const sliceRanges = getSliceRangesFromRecipe(item.recipe);
    const pageMetrics = item?.recipe?.page_metrics || null;
    const baseUrl = item.url || window.location.href;
    const title = item.slice_title || item.page_title || item.url || "Slice Preview";
    state.lastPreview = {
      html: item.html || "",
      text: item.text || "",
      baseUrl,
      title,
      pageHtml: pageHtml || "",
      sliceRanges,
      snapshotViewportWidth: snapshot?.viewport_width || null,
      pageMetrics,
    };
    openFullPreview({
      html: item.html || "",
      pageHtml,
      baseUrl,
      title,
      mode: "slice-in-page",
      sliceRanges,
      snapshotViewportWidth: snapshot?.viewport_width || null,
      pageMetrics,
    });
    if (!pageHtml) {
      updateStatus("Saved page HTML missing; showing slice only");
    }
  }

  async function deleteSlice(sliceId) {
    if (!sliceId) {
      return;
    }
    if (!window.confirm("Delete this slice?")) {
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-delete",
        id: sliceId,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Delete failed");
      }
      loadLibrary();
    } catch (error) {
      console.warn("Delete slice failed", error);
      updateStatus("Delete failed");
    }
  }

  function handleHover(event) {
    if (!state.visible) {
      return;
    }
    if (state.mode === "idle") {
      hideHighlight();
      hideSliceLine();
      return;
    }
    if (isEventInOverlay(event)) {
      hideHighlight();
      hideSliceLine();
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      hideHighlight();
      hideSliceLine();
      return;
    }
    if (state.mode === "slice") {
      showSliceLine(event.clientY + window.scrollY);
      return;
    }
    state.highlightTarget = target;
    showHighlight(target);
  }

  function updateLibraryTypeButtons() {
    if (!libraryPanel.typeAll) {
      return;
    }
    libraryPanel.typeAll.classList.toggle("active", state.libraryType === "all");
    libraryPanel.typePicks.classList.toggle("active", state.libraryType === "pick");
    libraryPanel.typeSlices.classList.toggle("active", state.libraryType === "slice");
  }

  function handleClick(event) {
    if (!state.visible || state.mode === "idle") {
      return;
    }
    if (isEventInOverlay(event)) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    if (state.mode === "pick") {
      const useRange = event.shiftKey && state.lastPickedElement;
      const segment = useRange
        ? buildSegment(state.lastPickedElement, target)
        : buildSegment(target, target);
      if (segment) {
        pushUndo();
        if (useRange && shouldReplaceLastSegmentWithRange(segment)) {
          state.segments[state.segments.length - 1] = segment;
        } else {
          state.segments.push(segment);
        }
        state.lastPickedElement = target;
        renderSegmentHighlights();
        updateStatus("Segment added");
      } else {
        updateStatus("Could not create segment");
      }
      return;
    }

    if (state.mode === "slice") {
      const y = event.clientY + window.scrollY;
      if (state.sliceStartY === null) {
        const rect = target.getBoundingClientRect();
        const elementTop = rect.top + window.scrollY;
        const elementHeight = rect.height || 1;
        const offset = y - elementTop;
        const offsetRatio = offset / elementHeight;
        state.sliceStartY = y;
        state.sliceStartAnchor = target ? buildLocator(target) : null;
        state.sliceStartOffsetRatio = Number.isFinite(offsetRatio)
          ? Math.min(1, Math.max(0, offsetRatio))
          : null;
        showSliceStartLine(y);
        updateStatus("Slice start set");
        return;
      }
      const start = Math.min(state.sliceStartY, y);
      const end = Math.max(state.sliceStartY, y);
      const endAnchor = target ? buildLocator(target) : null;
      const endRect = target.getBoundingClientRect();
      const endTop = endRect.top + window.scrollY;
      const endHeight = endRect.height || 1;
      const endOffset = y - endTop;
      const endOffsetRatio = endOffset / endHeight;
      const segment = buildSliceSegment(
        start,
        end,
        state.sliceStartAnchor,
        endAnchor,
        state.sliceStartOffsetRatio,
        Number.isFinite(endOffsetRatio) ? Math.min(1, Math.max(0, endOffsetRatio)) : null
      );
      if (segment) {
        pushUndo();
        state.segments.push(segment);
        renderSegmentHighlights();
        updateStatus("Slice added");
        getExtensionSettings()
          .then((settings) => {
            if (settings.autoSaveOnEnd) {
              saveSlice();
            }
          })
          .catch((error) => {
            console.warn("Web Slicer auto-save settings failed", error);
          });
      } else {
        updateStatus("Could not create slice");
      }
      state.sliceStartY = null;
      state.sliceStartAnchor = null;
      state.sliceStartOffsetRatio = null;
      hideSliceStartLine();
      return;
    }

    if (state.mode === "exclude") {
      addExclude(target);
      updateStatus("Exclude added");
      return;
    }
  }

  async function refreshPageHtml() {
    updateStatus("Refreshing page HTML...");
    const html = buildCleanPageHtml();
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-page-html-refresh",
        payload: {
          url: window.location.href,
          title: document.title,
          html,
        },
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Refresh failed");
      }
      if (state.lastPreview && state.lastPreview.baseUrl === window.location.href) {
        state.lastPreview.pageHtml = html;
      }
      updateStatus("Page HTML refreshed");
    } catch (error) {
      console.warn("Page HTML refresh failed", error);
      updateStatus("Page refresh failed");
    }
  }

  async function fetchPageHtml(pageId) {
    if (!pageId) {
      return null;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-page-html",
        pageId,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Failed to load page html");
      }
      return response.page?.html || null;
    } catch (error) {
      console.warn("Page HTML fetch failed", error);
      return null;
    }
  }

  async function fetchSnapshotHtml(snapshotId) {
    if (!snapshotId) {
      return null;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-snapshot-html",
        snapshotId,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Failed to load snapshot html");
      }
      return response.snapshot || null;
    } catch (error) {
      console.warn("Snapshot HTML fetch failed", error);
      return null;
    }
  }

  function filterLibraryItems(items) {
    if (state.libraryType === "all") {
      return items;
    }
    return items.filter((item) => getItemType(item) === state.libraryType);
  }

  function getItemType(item) {
    const segments = item?.recipe?.segments;
    if (!Array.isArray(segments)) {
      return "pick";
    }
    const hasSlice = segments.some((segment) => segment?.type === "slice");
    return hasSlice ? "slice" : "pick";
  }

  function getSliceRangesFromSegments(segments) {
    if (!Array.isArray(segments)) {
      return [];
    }
    return segments
      .filter(
        (segment) =>
          segment?.type === "slice" &&
          (Number.isFinite(segment.cleaned_yStart) ||
            Number.isFinite(segment.yStart)) &&
          (Number.isFinite(segment.cleaned_yEnd) ||
            Number.isFinite(segment.yEnd))
      )
      .map((segment) => ({
        yStart: Number.isFinite(segment.cleaned_yStart)
          ? segment.cleaned_yStart
          : segment.yStart,
        yEnd: Number.isFinite(segment.cleaned_yEnd) ? segment.cleaned_yEnd : segment.yEnd,
        source: Number.isFinite(segment.cleaned_yStart) ? "cleaned" : "raw",
      }));
  }

  function getSliceRangesFromRecipe(recipe) {
    return getSliceRangesFromSegments(recipe?.segments);
  }

  function handleKeyDown(event) {
    if (!state.visible) {
      return;
    }
    const key = event.key.toLowerCase();
    if (event.ctrlKey && event.shiftKey && !event.altKey && key === "z") {
      event.preventDefault();
      redoLastSegment();
      return;
    }
    if (event.ctrlKey && !event.shiftKey && !event.altKey && key === "z") {
      event.preventDefault();
      undoLastSegment();
      return;
    }
    if (event.key === "Escape") {
      hideToolbar();
    }
  }

  function handleMouseDown(event) {
    if (!state.visible) {
      return;
    }
    if (isEventInOverlay(event)) {
      return;
    }
    if (event.shiftKey) {
      event.preventDefault();
    }
  }

  function handleSelectStart(event) {
    if (!state.visible) {
      return;
    }
    if (isEventInOverlay(event)) {
      return;
    }
    event.preventDefault();
  }

  let viewportTicking = false;
  function handleViewportChange() {
    if (!state.visible || state.segments.length === 0) {
      return;
    }
    if (viewportTicking) {
      return;
    }
    viewportTicking = true;
    window.requestAnimationFrame(() => {
      renderSegmentHighlights();
      viewportTicking = false;
    });
  }

  function buildSegment(startEl, endEl) {
    if (!startEl || !endEl) {
      return null;
    }
    return {
      type: "element",
      start: buildLocator(startEl),
      end: buildLocator(endEl),
    };
  }

  function buildSliceSegment(
    yStart,
    yEnd,
    startAnchor,
    endAnchor,
    startOffsetRatio,
    endOffsetRatio
  ) {
    if (yStart === null || yEnd === null) {
      return null;
    }
    return {
      type: "slice",
      yStart,
      yEnd,
      anchorStart: startAnchor || null,
      anchorEnd: endAnchor || null,
      anchorStartOffsetRatio:
        Number.isFinite(startOffsetRatio) ? startOffsetRatio : null,
      anchorEndOffsetRatio: Number.isFinite(endOffsetRatio) ? endOffsetRatio : null,
    };
  }

  function shouldReplaceLastSegmentWithRange(nextSegment) {
    if (!nextSegment || state.segments.length === 0) {
      return false;
    }
    const last = state.segments[state.segments.length - 1];
    if (!last) {
      return false;
    }
    if (!isSingleElementSegment(last)) {
      return false;
    }
    return locatorsEqual(last.start, nextSegment.start);
  }

  function isSingleElementSegment(segment) {
    if (!segment || segment.type === "slice") {
      return false;
    }
    return locatorsEqual(segment.start, segment.end);
  }

  function locatorsEqual(a, b) {
    if (!a || !b) {
      return false;
    }
    if (a.selector && b.selector && a.selector === b.selector) {
      return true;
    }
    if (!Array.isArray(a.path) || !Array.isArray(b.path)) {
      return false;
    }
    if (a.path.length !== b.path.length) {
      return false;
    }
    for (let i = 0; i < a.path.length; i += 1) {
      if (a.path[i] !== b.path[i]) {
        return false;
      }
    }
    return true;
  }

  function getRangeForSegment(segment) {
    const startEl = resolveByLocator(segment.start);
    const endEl = resolveByLocator(segment.end);
    if (!startEl || !endEl) {
      return null;
    }
    const range = document.createRange();
    range.setStartBefore(startEl);
    range.setEndAfter(endEl);
    return range;
  }

  function clearSegmentHighlights() {
    segmentLayer.el.innerHTML = "";
  }

  function renderSegmentHighlights() {
    clearSegmentHighlights();
    if (!state.visible) {
      return;
    }
    state.segments.forEach((segment) => {
      if (segment.type === "slice") {
        const top = Math.min(segment.yStart, segment.yEnd);
        const height = Math.max(0, Math.abs(segment.yEnd - segment.yStart));
        if (height <= 0) {
          return;
        }
        const box = document.createElement("div");
        box.className = "slicer-segment-highlight";
        box.style.top = `${top}px`;
        box.style.left = "0px";
        box.style.width = `${Math.max(document.documentElement.scrollWidth, window.innerWidth)}px`;
        box.style.height = `${height}px`;
        segmentLayer.el.appendChild(box);
        return;
      }
      const range = getRangeForSegment(segment);
      if (!range) {
        return;
      }
      const rects = Array.from(range.getClientRects());
      rects.forEach((rect) => {
        if (!rect.width || !rect.height) {
          return;
        }
        const box = document.createElement("div");
        box.className = "slicer-segment-highlight";
        box.style.top = `${rect.top + window.scrollY}px`;
        box.style.left = `${rect.left + window.scrollX}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;
        segmentLayer.el.appendChild(box);
      });
    });
  }

  function cloneSegments(segments) {
    return segments.map((segment) => {
      if (segment.type === "slice") {
        return {
          type: "slice",
          yStart: segment.yStart,
          yEnd: segment.yEnd,
        };
      }
      return {
        type: "element",
        start: segment.start,
        end: segment.end,
      };
    });
  }

  function pushUndo() {
    state.undoStack.push(cloneSegments(state.segments));
    state.redoStack = [];
  }

  function undoLastSegment() {
    if (!state.undoStack.length) {
      updateStatus("Nothing to undo");
      return;
    }
    state.redoStack.push(cloneSegments(state.segments));
    const previous = state.undoStack.pop();
    state.segments = previous;
    const last = state.segments[state.segments.length - 1];
    state.lastPickedElement =
      last && last.type !== "slice" ? resolveByLocator(last.end) : null;
    renderSegmentHighlights();
    updateStatus("Undo");
  }

  function redoLastSegment() {
    if (!state.redoStack.length) {
      updateStatus("Nothing to redo");
      return;
    }
    state.undoStack.push(cloneSegments(state.segments));
    const next = state.redoStack.pop();
    state.segments = next;
    const last = state.segments[state.segments.length - 1];
    state.lastPickedElement =
      last && last.type !== "slice" ? resolveByLocator(last.end) : null;
    renderSegmentHighlights();
    updateStatus("Redo");
  }

  function addExclude(element) {
    const entry = buildLocator(element);
    state.excludes.push({ ...entry, element });
  }

  function buildLocator(element) {
    return {
      selector: buildCssSelector(element),
      path: buildElementPath(element),
      tag: element.tagName.toLowerCase(),
    };
  }

  function buildElementPath(element) {
    const path = [];
    let current = element;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) {
        break;
      }
      const index = Array.prototype.indexOf.call(parent.children, current);
      path.unshift(index);
      current = parent;
    }
    return path;
  }

  function resolveByLocator(locator) {
    if (!locator) {
      return null;
    }
    if (locator.selector) {
      const found = document.querySelector(locator.selector);
      if (found) {
        return found;
      }
    }
    if (locator.path && locator.path.length > 0) {
      let current = document.body;
      for (const index of locator.path) {
        if (!current || !current.children || !current.children[index]) {
          return null;
        }
        current = current.children[index];
      }
      return current;
    }
    return null;
  }

  function buildCssSelector(element) {
    if (element.id) {
      return `#${cssEscape(element.id)}`;
    }
    const parts = [];
    let current = element;
    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        break;
      }
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName.toLowerCase() === tag
      );
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      current = parent;
    }
    return parts.length ? parts.join(" > ") : element.tagName.toLowerCase();
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function buildSelectorVariants(element) {
    const variants = [];
    if (element.id) {
      variants.push(`#${cssEscape(element.id)}`);
    }
    const parts = [];
    let current = element;
    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) {
        break;
      }
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName.toLowerCase() === tag
      );
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      current = parent;
    }
    for (let i = 0; i < parts.length; i += 1) {
      variants.push(parts.slice(i).join(" > "));
    }
    return variants;
  }

  function pickSelectorForContainer(element, container) {
    const variants = buildSelectorVariants(element);
    for (const selector of variants) {
      const matches = container.querySelectorAll(selector);
      if (matches.length === 1) {
        return selector;
      }
    }
    return null;
  }

  function buildSnapshot() {
    if (state.segments.length === 0) {
      return null;
    }
    const htmlParts = [];
    const textParts = [];
    const segmentRecipes = [];

    for (const segment of state.segments) {
      if (segment.type === "slice") {
        const slice = buildSliceSnapshot(segment);
        if (!slice) {
          continue;
        }
        if (slice.html) {
          htmlParts.push(slice.html);
        }
        if (slice.text) {
          textParts.push(slice.text);
        }
      segmentRecipes.push({
        type: "slice",
        yStart: segment.yStart,
        yEnd: segment.yEnd,
        anchor_start: segment.anchorStart || null,
        anchor_end: segment.anchorEnd || null,
        anchor_start_offset_ratio:
          Number.isFinite(segment.anchorStartOffsetRatio)
            ? segment.anchorStartOffsetRatio
            : null,
        anchor_end_offset_ratio:
          Number.isFinite(segment.anchorEndOffsetRatio) ? segment.anchorEndOffsetRatio : null,
        excludes: slice.excludesApplied || [],
      });
        continue;
      }

      const startEl = resolveByLocator(segment.start);
      const endEl = resolveByLocator(segment.end);
      if (!startEl || !endEl) {
        continue;
      }
      const range = document.createRange();
      range.setStartBefore(startEl);
      range.setEndAfter(endEl);

      const fragment = range.cloneContents();
      const container = document.createElement("div");
      container.appendChild(fragment);
      container.querySelectorAll("script").forEach((node) => node.remove());

      const excludesApplied = [];
      for (const exclude of state.excludes) {
        if (!exclude.element || !range.intersectsNode(exclude.element)) {
          continue;
        }
        const selector = pickSelectorForContainer(exclude.element, container);
        if (!selector) {
          continue;
        }
        container.querySelectorAll(selector).forEach((node) => node.remove());
        excludesApplied.push({
          selector,
          path: exclude.path,
          tag: exclude.tag,
        });
      }

      const html = container.innerHTML.trim();
      const text = container.innerText.trim();
      if (html) {
        htmlParts.push(html);
      }
      if (text) {
        textParts.push(text);
      }
      segmentRecipes.push({
        type: "element",
        start: segment.start,
        end: segment.end,
        excludes: excludesApplied,
      });
    }

    return {
      html: htmlParts.join("\n"),
      text: textParts.join("\n\n"),
      recipe: {
        segments: segmentRecipes,
        page_metrics: buildPageMetrics(),
      },
    };
  }

  function buildPageMetrics() {
    return {
      scrollHeight:
        document.documentElement.scrollHeight ||
        document.body.scrollHeight ||
        0,
      scrollWidth:
        document.documentElement.scrollWidth ||
        document.body.scrollWidth ||
        0,
    };
  }

  async function applyCleanedSliceSnapshot(recipe, pageHtml, snapshot) {
    if (!recipe || !Array.isArray(recipe.segments) || !pageHtml) {
      return {
        recipe,
        html: snapshot?.html || "",
        text: snapshot?.text || "",
      };
    }
    const cleaned = await computeCleanedSliceSnapshot(
      recipe.segments,
      pageHtml,
      recipe.page_metrics
    );
    if (!cleaned) {
      return {
        recipe,
        html: snapshot?.html || "",
        text: snapshot?.text || "",
      };
    }
    const updatedSegments = recipe.segments.map((segment, index) => {
      if (segment.type !== "slice") {
        return segment;
      }
      const cleanedRange = cleaned.ranges[index];
      if (!cleanedRange) {
        return segment;
      }
      return {
        ...segment,
        cleaned_yStart: cleanedRange.yStart,
        cleaned_yEnd: cleanedRange.yEnd,
        cleaned_source: cleanedRange._source || null,
      };
    });
    return {
      recipe: {
        ...recipe,
        segments: updatedSegments,
      },
      html: cleaned.html || snapshot?.html || "",
      text: cleaned.text || snapshot?.text || "",
    };
  }

  async function computeCleanedSliceSnapshot(segments, pageHtml, pageMetrics) {
    const sliceSegments = Array.isArray(segments)
      ? segments.map((segment) => (segment?.type === "slice" ? segment : null))
      : [];
    if (!sliceSegments.some(Boolean)) {
      return null;
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = `${window.innerWidth}px`;
    iframe.style.height = `${window.innerHeight}px`;
    iframe.style.left = "-99999px";
    iframe.style.top = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.setAttribute("aria-hidden", "true");
    iframe.srcdoc = pageHtml;
    document.body.appendChild(iframe);

    const cleaned = await new Promise((resolve) => {
      const cleanup = () => {
        iframe.removeEventListener("load", onLoad);
      };
      const onLoad = () => {
        cleanup();
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        if (!doc || !win) {
          resolve(null);
          return;
        }
        const debug = {
          pageHeight: pageMetrics?.scrollHeight || 0,
          cleanedHeight: doc.documentElement.scrollHeight || 0,
        };
        const results = segments.map((segment) => {
          if (segment?.type !== "slice") {
            return null;
          }
          const anchorStart = segment.anchor_start || segment.anchorStart;
          const anchorEnd = segment.anchor_end || segment.anchorEnd;
          const startEl = resolveByLocatorInDocument(anchorStart, doc);
          const endEl = resolveByLocatorInDocument(anchorEnd, doc);
          if (startEl && endEl) {
            const startRect = startEl.getBoundingClientRect();
            const endRect = endEl.getBoundingClientRect();
            const startRatio =
              typeof segment.anchor_start_offset_ratio === "number"
                ? segment.anchor_start_offset_ratio
                : segment.anchorStartOffsetRatio;
            const endRatio =
              typeof segment.anchor_end_offset_ratio === "number"
                ? segment.anchor_end_offset_ratio
                : segment.anchorEndOffsetRatio;
            const startOffset = Number.isFinite(startRatio)
              ? startRect.height * startRatio
              : 0;
            const endOffset = Number.isFinite(endRatio) ? endRect.height * endRatio : 0;
            return {
              yStart: startRect.top + win.scrollY + startOffset,
              yEnd: endRect.top + win.scrollY + endOffset,
              _source: "anchor",
            };
          }
          const pageHeight = pageMetrics?.scrollHeight || 0;
          const docHeight = doc.documentElement.scrollHeight || 0;
          if (pageHeight && docHeight) {
            const ratio = docHeight / pageHeight;
            return {
              yStart: segment.yStart * ratio,
              yEnd: segment.yEnd * ratio,
              _source: "ratio",
            };
          }
          return {
            yStart: segment.yStart,
            yEnd: segment.yEnd,
            _source: "raw",
          };
        });
        console.info("WebSlicer cleaned slice ranges", {
          ...debug,
          ranges: results.filter(Boolean),
        });
        const snapshot = buildSnapshotFromCleanedDocument(segments, results, doc);
        resolve({ ranges: results, html: snapshot.html, text: snapshot.text });
      };
      iframe.addEventListener("load", onLoad, { once: true });
      setTimeout(() => {
        resolve(null);
      }, 1200);
    });

    iframe.remove();
    return cleaned;
  }

  function resolveByLocatorInDocument(locator, doc) {
    if (!locator || !doc) {
      return null;
    }
    if (locator.selector) {
      const found = doc.querySelector(locator.selector);
      if (found) {
        return found;
      }
    }
    if (locator.path && locator.path.length > 0) {
      let current = doc.body;
      for (const index of locator.path) {
        if (!current || !current.children || !current.children[index]) {
          return null;
        }
        current = current.children[index];
      }
      return current;
    }
    return null;
  }

  function buildSnapshotFromCleanedDocument(segments, cleanedRanges, doc) {
    const htmlParts = [];
    const textParts = [];
    const ranges = Array.isArray(cleanedRanges) ? cleanedRanges : [];
    segments.forEach((segment, index) => {
      if (!segment) {
        return;
      }
      if (segment.type === "slice") {
        const range = ranges[index];
        const yStart = range ? range.yStart : segment.yStart;
        const yEnd = range ? range.yEnd : segment.yEnd;
        const slice = buildSliceSnapshotInDocument(yStart, yEnd, segment, doc);
        if (slice?.html) {
          htmlParts.push(slice.html);
        }
        if (slice?.text) {
          textParts.push(slice.text);
        }
        return;
      }
      const element = buildElementSnapshotInDocument(segment, doc);
      if (element?.html) {
        htmlParts.push(element.html);
      }
      if (element?.text) {
        textParts.push(element.text);
      }
    });
    return {
      html: htmlParts.join("\n"),
      text: textParts.join("\n\n"),
    };
  }

  function buildElementSnapshotInDocument(segment, doc) {
    const startEl = resolveByLocatorInDocument(segment.start, doc);
    const endEl = resolveByLocatorInDocument(segment.end, doc);
    if (!startEl || !endEl) {
      return null;
    }
    const range = doc.createRange();
    range.setStartBefore(startEl);
    range.setEndAfter(endEl);
    const fragment = range.cloneContents();
    const container = doc.createElement("div");
    container.appendChild(fragment);
    container.querySelectorAll("script").forEach((node) => node.remove());
    if (Array.isArray(segment.excludes)) {
      segment.excludes.forEach((exclude) => {
        if (!exclude?.selector) {
          return;
        }
        container.querySelectorAll(exclude.selector).forEach((node) => node.remove());
      });
    }
    return {
      html: container.innerHTML.trim(),
      text: container.innerText.trim(),
    };
  }

  function buildSliceSnapshotInDocument(yStart, yEnd, segment, doc) {
    const start = Math.min(yStart, yEnd);
    const end = Math.max(yStart, yEnd);
    if (end <= start) {
      return null;
    }
    const candidates = collectSliceElementsInDocument(start, end, doc);
    if (!candidates.length) {
      const spacer = doc.createElement("div");
      spacer.style.height = `${end - start}px`;
      spacer.style.width = "100%";
      spacer.style.background = "transparent";
      return { html: spacer.outerHTML, text: "" };
    }
    const container = doc.createElement("div");
    const sorted = candidates.sort((a, b) => a.top - b.top);
    const firstTop = sorted[0].top;
    const lastBottom = sorted[sorted.length - 1].bottom;
    if (firstTop > start) {
      const spacer = doc.createElement("div");
      spacer.style.height = `${firstTop - start}px`;
      spacer.style.width = "100%";
      spacer.style.background = "transparent";
      container.appendChild(spacer);
    }
    sorted.forEach((item) => {
      const clone = item.el.cloneNode(true);
      container.appendChild(clone);
    });
    if (end > lastBottom) {
      const spacer = doc.createElement("div");
      spacer.style.height = `${end - lastBottom}px`;
      spacer.style.width = "100%";
      spacer.style.background = "transparent";
      container.appendChild(spacer);
    }
    container.querySelectorAll("script").forEach((node) => node.remove());
    if (Array.isArray(segment?.excludes)) {
      segment.excludes.forEach((exclude) => {
        if (!exclude?.selector) {
          return;
        }
        container.querySelectorAll(exclude.selector).forEach((node) => node.remove());
      });
    }
    return {
      html: container.innerHTML.trim(),
      text: container.innerText.trim(),
    };
  }

  function collectSliceElementsInDocument(yStart, yEnd, doc) {
    const selector = [
      "article",
      "section",
      "div",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "figure",
      "figcaption",
      "header",
      "footer",
      "main",
      "aside",
    ].join(",");
    const win = doc.defaultView;
    const sliceHeight = Math.max(1, yEnd - yStart);
    const docHeight =
      doc.documentElement.scrollHeight || doc.body.scrollHeight || sliceHeight;
    const elements = Array.from(doc.body.querySelectorAll(selector));
    const intersecting = [];
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const top = rect.top + (win?.scrollY || 0);
      const bottom = rect.bottom + (win?.scrollY || 0);
      if (bottom < yStart || top > yEnd) {
        return;
      }
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      if (rect.height > sliceHeight * 1.4 && rect.height > docHeight * 0.6) {
        return;
      }
      intersecting.push({ el, top, bottom });
    });
    if (!intersecting.length) {
      return [];
    }
    const intersectingSet = new Set(intersecting.map((item) => item.el));
    return intersecting.filter((item) => {
      let parent = item.el.parentElement;
      while (parent) {
        if (intersectingSet.has(parent)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });
  }

  function buildSliceSnapshot(segment) {
    const yStart = Math.min(segment.yStart, segment.yEnd);
    const yEnd = Math.max(segment.yStart, segment.yEnd);
    if (yEnd <= yStart) {
      return null;
    }

    const candidates = collectSliceElements(yStart, yEnd);
    if (!candidates.length) {
      const spacer = document.createElement("div");
      spacer.style.height = `${yEnd - yStart}px`;
      spacer.style.width = "100%";
      spacer.style.background = "transparent";
      return {
        html: spacer.outerHTML,
        text: "",
        excludesApplied: [],
      };
    }

    const container = document.createElement("div");
    const sorted = candidates.sort((a, b) => a.top - b.top);

    const firstTop = sorted[0].top;
    const lastBottom = sorted[sorted.length - 1].bottom;
    if (firstTop > yStart) {
      const spacer = document.createElement("div");
      spacer.style.height = `${firstTop - yStart}px`;
      spacer.style.width = "100%";
      spacer.style.background = "transparent";
      container.appendChild(spacer);
    }

    sorted.forEach((item) => {
      const clone = item.el.cloneNode(true);
      container.appendChild(clone);
    });

    if (yEnd > lastBottom) {
      const spacer = document.createElement("div");
      spacer.style.height = `${yEnd - lastBottom}px`;
      spacer.style.width = "100%";
      spacer.style.background = "transparent";
      container.appendChild(spacer);
    }

    const excludesApplied = [];
    for (const exclude of state.excludes) {
      if (!exclude.element) {
        continue;
      }
      const rect = exclude.element.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      if (bottom < yStart || top > yEnd) {
        continue;
      }
      const selector = pickSelectorForContainer(exclude.element, container);
      if (!selector) {
        continue;
      }
      container.querySelectorAll(selector).forEach((node) => node.remove());
      excludesApplied.push({
        selector,
        path: exclude.path,
        tag: exclude.tag,
      });
    }

    container.querySelectorAll("script").forEach((node) => node.remove());
    const html = container.innerHTML.trim();
    const text = container.innerText.trim();
    return { html, text, excludesApplied };
  }

  function collectSliceElements(yStart, yEnd) {
    const selector = [
      "article",
      "section",
      "div",
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "figure",
      "figcaption",
      "header",
      "footer",
      "main",
      "aside",
    ].join(",");

    const elements = Array.from(document.body.querySelectorAll(selector));
    const intersecting = [];
    elements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      if (bottom < yStart || top > yEnd) {
        return;
      }
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      intersecting.push({ el, top, bottom });
    });

    if (!intersecting.length) {
      return [];
    }

    const intersectingSet = new Set(intersecting.map((item) => item.el));
    return intersecting.filter((item) => {
      let parent = item.el.parentElement;
      while (parent) {
        if (intersectingSet.has(parent)) {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });
  }

  function buildCleanPageHtml() {
    const clone = document.documentElement.cloneNode(true);
    const overlayRoot = clone.querySelector("#web-slicer-root");
    if (overlayRoot) {
      overlayRoot.remove();
    }
    clone
      .querySelectorAll("script,noscript,iframe,object,embed")
      .forEach((node) => node.remove());
    clone.querySelectorAll("meta[http-equiv]").forEach((meta) => {
      const httpEquiv = meta.getAttribute("http-equiv") || "";
      if (httpEquiv.toLowerCase() === "refresh") {
        meta.remove();
      }
    });
    clone.querySelectorAll("base").forEach((node) => node.remove());
    clone.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        if (attr.name.toLowerCase().startsWith("on")) {
          node.removeAttribute(attr.name);
        }
      });
    });
    return `<!doctype html>\n${clone.outerHTML}`;
  }

  async function saveSlice() {
    const snapshot = buildSnapshot();
    if (!snapshot) {
      updateStatus("Nothing to save");
      return;
    }
    const pageHtml = buildCleanPageHtml();
    const nativeRanges = (snapshot.recipe.segments || [])
      .filter((segment) => segment?.type === "slice")
      .map((segment) => ({
        yStart: segment.yStart,
        yEnd: segment.yEnd,
        anchorStart: segment.anchor_start || segment.anchorStart || null,
        anchorEnd: segment.anchor_end || segment.anchorEnd || null,
      }));
    console.info("WebSlicer native slice ranges", {
      pageHeight: snapshot.recipe.page_metrics?.scrollHeight || 0,
      ranges: nativeRanges,
    });
    const cleaned = await applyCleanedSliceSnapshot(snapshot.recipe, pageHtml, snapshot);
    updateStatus("Saving...");
    const payload = {
      url: window.location.href,
      page_title: document.title,
      slice_title: null,
      recipe: cleaned.recipe,
      html: cleaned.html,
      text: cleaned.text,
      page_html: pageHtml,
      page_html_refresh: false,
      page_viewport_width: window.innerWidth,
    };
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-save",
        payload,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Save failed");
      }
      hidePreview();
      updateStatus("Saved");
    } catch (error) {
      updateStatus("Save failed");
      console.warn("Web Slicer save error", error);
    }
  }

  async function copyToClipboard(text) {
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.warn("Clipboard write failed", error);
    }
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  }

  function isEventInOverlay(event) {
    const path = event.composedPath ? event.composedPath() : [];
    return path.includes(overlay.host) || path.includes(overlay.uiRoot);
  }

  function handlePreviewWheel(event) {
    if (!state.visible) {
      return;
    }
    window.scrollBy({
      top: event.deltaY,
      left: event.deltaX,
      behavior: "auto",
    });
    event.preventDefault();
  }

  function lockScroll() {
    if (state.scrollLock) {
      return;
    }
    state.scrollLock = {
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }

  function unlockScroll() {
    if (!state.scrollLock) {
      return;
    }
    document.documentElement.style.overflow = state.scrollLock.htmlOverflow || "";
    document.body.style.overflow = state.scrollLock.bodyOverflow || "";
    state.scrollLock = null;
  }

  function openFullPreview({
    html,
    pageHtml,
    baseUrl,
    title,
    mode,
    sliceRanges,
    pageMetrics,
    snapshotViewportWidth,
  }) {
    clearPageSnapshot();
    if (fullPreview.iframe) {
      fullPreview.iframe.removeAttribute("src");
    }
    const safeTitle = escapeHtml(title || "Slice Preview");
    const displayTitle = title || "Slice Preview";
    const safeBase = escapeHtml(baseUrl || window.location.href);
    const resolvedMode = mode || "page";
    state.fullPreviewMode = resolvedMode;
    updateFullPreviewButtons();

    let doc = "";
    const sliceHtml = html || "";
    if (resolvedMode === "slice-only") {
      if (state.sliceOnlyMode === "fragment" || state.sliceOnlyMode === "inline") {
        doc = buildFragmentDocument(sliceHtml, pageHtml, safeTitle, safeBase);
      } else {
        doc = pageHtml
          ? buildPlainPageDocument(pageHtml, safeTitle, safeBase)
          : buildSliceDocument(sliceHtml, safeTitle, safeBase);
      }
    } else if (resolvedMode === "slice-in-page") {
      if (!pageHtml) {
        doc = buildSliceDocument(sliceHtml, safeTitle, safeBase);
      } else {
        doc = buildPageDocument(pageHtml, safeTitle, safeBase, sliceRanges || []);
      }
    } else if (pageHtml) {
      doc = buildPlainPageDocument(pageHtml, safeTitle, safeBase);
    } else {
      doc = buildSliceDocument(sliceHtml, safeTitle, safeBase);
    }

    fullPreview.title.textContent = displayTitle;
    if (snapshotViewportWidth) {
      fullPreview.iframe.style.width = `${snapshotViewportWidth}px`;
      fullPreview.iframe.style.maxWidth = "100%";
      fullPreview.iframe.style.margin = "0 auto";
      fullPreview.iframe.style.display = "block";
    } else {
      fullPreview.iframe.style.width = "100%";
      fullPreview.iframe.style.maxWidth = "";
      fullPreview.iframe.style.margin = "0";
      fullPreview.iframe.style.display = "block";
    }
    fullPreview.iframe.srcdoc = doc;
    fullPreview.iframe.onload = () => {
      const mode = state.fullPreviewMode;
      const rawRanges = Array.isArray(sliceRanges) ? sliceRanges : [];
      const scaledRanges =
        mode === "slice-in-page" || mode === "slice-only"
          ? scaleSliceRanges(rawRanges, pageMetrics, fullPreview.iframe)
          : rawRanges;
      if (mode === "slice-in-page") {
        applyOverlayRanges(fullPreview.iframe, scaledRanges);
      } else if (mode === "slice-only") {
        if (state.sliceOnlyMode === "mask") {
          scrollIframeToSlice(fullPreview.iframe, scaledRanges);
          applySliceOnlyMask(fullPreview.iframe, scaledRanges);
        } else if (state.sliceOnlyMode === "clip") {
          scrollIframeToSlice(fullPreview.iframe, scaledRanges);
          applySliceOnlyClip(fullPreview.iframe, scaledRanges);
        } else if (state.sliceOnlyMode === "inline") {
          applyInlineStyles(fullPreview.iframe);
        }
      }
      if (mode !== "slice-in-page" || !scaledRanges.length) {
        return;
      }
      const firstTop = Math.min(
        ...scaledRanges.map((range) => Math.min(range.yStart, range.yEnd))
      );
      try {
        fullPreview.iframe.contentWindow?.scrollTo({
          top: Math.max(0, firstTop - 40),
          behavior: "auto",
        });
      } catch (error) {
        console.warn("Preview scroll failed", error);
      }
    };
    fullPreview.el.style.display = "flex";
    lockScroll();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildSliceDocument(html, safeTitle, safeBase) {
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${safeTitle}</title>
    <base href="${safeBase}">
    <style>
      body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: #111; }
      .slice-preview { padding: 40px 48px; max-width: 960px; margin: 0 auto; }
      img, video { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    <div class="slice-preview">${html || ""}</div>
  </body>
</html>`;
  }

  function buildPlainPageDocument(pageHtml, safeTitle, safeBase) {
    let doc = pageHtml || "";
    const baseTag = `<base href="${safeBase}">`;
    if (doc.includes("<head")) {
      doc = doc.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}`);
    } else {
      doc = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>${baseTag}</head>${doc}</html>`;
    }

    if (!doc.toLowerCase().includes("<title")) {
      doc = doc.replace(/<head[^>]*>/i, (match) => `${match}<title>${safeTitle}</title>`);
    }
    return doc;
  }

  function buildFragmentDocument(sliceHtml, pageHtml, safeTitle, safeBase) {
    const headContent = extractHeadContent(pageHtml || "");
    const baseTag = `<base href="${safeBase}">`;
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${safeTitle}</title>
    ${baseTag}
    ${headContent}
    <style>
      body { margin: 0; padding: 24px; }
      .slice-preview { width: 100%; margin: 0; }
      img, video { max-width: 100%; height: auto; }
    </style>
  </head>
  <body>
    <div class="slice-preview">${sliceHtml || ""}</div>
  </body>
</html>`;
  }

  function extractHeadContent(pageHtml) {
    const match = pageHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (!match) {
      return "";
    }
    const raw = match[1] || "";
    return raw.replace(/<script[\s\S]*?<\/script>/gi, "");
  }

  function scaleSliceRanges(sliceRanges, pageMetrics, iframe) {
    if (!Array.isArray(sliceRanges) || sliceRanges.length === 0) {
      return [];
    }
    if (sliceRanges.every((range) => range.source === "cleaned")) {
      return sliceRanges;
    }
    if (!pageMetrics?.scrollHeight || !iframe?.contentDocument) {
      return sliceRanges;
    }
    const actualHeight = iframe.contentDocument.documentElement.scrollHeight || 0;
    if (!actualHeight || !Number.isFinite(actualHeight)) {
      return sliceRanges;
    }
    const ratio = actualHeight / pageMetrics.scrollHeight;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      return sliceRanges;
    }
    if (Math.abs(ratio - 1) < 0.01) {
      return sliceRanges;
    }
    return sliceRanges.map((range) => ({
      yStart: range.yStart * ratio,
      yEnd: range.yEnd * ratio,
    }));
  }

  function applyOverlayRanges(iframe, sliceRanges) {
    if (!iframe?.contentDocument || !Array.isArray(sliceRanges)) {
      return;
    }
    const doc = iframe.contentDocument;
    const overlay = doc.getElementById("slicer-overlay");
    if (!overlay) {
      return;
    }
    const bodyOffset = doc.body
      ? doc.body.getBoundingClientRect().top + (doc.defaultView?.scrollY || 0)
      : 0;
    const bands = overlay.querySelectorAll(".slicer-overlay-band");
    if (!bands.length) {
      return;
    }
    sliceRanges.forEach((range, index) => {
      const band = bands[index];
      if (!band) {
        return;
      }
      const top = Math.max(0, Math.min(range.yStart, range.yEnd) - bodyOffset);
      const height = Math.max(0, Math.abs(range.yEnd - range.yStart));
      band.style.top = `${top}px`;
      band.style.height = `${height}px`;
    });
  }

  function applySliceOnlyMask(iframe, sliceRanges) {
    if (!iframe?.contentDocument || !Array.isArray(sliceRanges) || !sliceRanges.length) {
      return;
    }
    const doc = iframe.contentDocument;
    const win = doc.defaultView;
    const existing = doc.getElementById("slicer-slice-mask");
    if (existing) {
      existing.remove();
    }
    if (doc.documentElement) {
      doc.documentElement.style.position = "relative";
    }
    if (doc.body) {
      doc.body.style.position = "relative";
    }

    const bodyOffset = doc.body
      ? doc.body.getBoundingClientRect().top + (win?.scrollY || 0)
      : 0;
    const docHeight =
      Math.max(
        doc.documentElement.scrollHeight || 0,
        doc.body?.scrollHeight || 0
      ) - Math.max(0, bodyOffset);
    let ranges = getOverlayRanges(doc, sliceRanges)
      .filter((range) => range.bottom > range.top)
      .sort((a, b) => a.top - b.top);

    if (!ranges.length || docHeight <= 0) {
      return;
    }

    const mask = doc.createElement("div");
    mask.id = "slicer-slice-mask";
    mask.style.position = "absolute";
    mask.style.left = "0";
    mask.style.right = "0";
    mask.style.top = "0";
    mask.style.height = `${docHeight}px`;
    mask.style.pointerEvents = "none";
    mask.style.zIndex = "2147483646";

    const bodyBg = doc.body ? win?.getComputedStyle(doc.body).backgroundColor : "";
    const htmlBg = doc.documentElement
      ? win?.getComputedStyle(doc.documentElement).backgroundColor
      : "";
    const background = pickMaskBackground(bodyBg, htmlBg);

    let cursor = 0;
    ranges.forEach((range) => {
      if (range.top > cursor) {
        mask.appendChild(buildMaskBlock(doc, background, cursor, range.top - cursor));
      }
      cursor = Math.max(cursor, range.bottom);
    });
    if (cursor < docHeight) {
      mask.appendChild(buildMaskBlock(doc, background, cursor, docHeight - cursor));
    }

    if (doc.body) {
      doc.body.appendChild(mask);
    } else {
      doc.documentElement.appendChild(mask);
    }

    lockIframeScroll(iframe, { preserveScroll: true });
  }

  function applySliceOnlyClip(iframe, sliceRanges) {
    if (!iframe?.contentDocument || !Array.isArray(sliceRanges) || !sliceRanges.length) {
      return;
    }
    const doc = iframe.contentDocument;
    const win = doc.defaultView;
    const ranges = getOverlayRanges(doc, sliceRanges)
      .filter((range) => range.bottom > range.top)
      .sort((a, b) => a.top - b.top);
    if (!ranges.length) {
      return;
    }
    const rootId = "slicer-clip-root";
    let root = doc.getElementById(rootId);
    if (!root && doc.body) {
      root = doc.createElement("div");
      root.id = rootId;
      while (doc.body.firstChild) {
        root.appendChild(doc.body.firstChild);
      }
      doc.body.appendChild(root);
    }
    if (!root) {
      return;
    }
    const existingMask = doc.getElementById("slicer-clip-mask");
    if (existingMask) {
      existingMask.remove();
    }
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "slicer-clip-mask");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    const mask = doc.createElementNS("http://www.w3.org/2000/svg", "mask");
    mask.setAttribute("id", "slicer-mask-shape");
    const bg = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", "100%");
    bg.setAttribute("height", "100%");
    bg.setAttribute("fill", "black");
    mask.appendChild(bg);
    ranges.forEach((range) => {
      const rect = doc.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", "0");
      rect.setAttribute("y", `${range.top}`);
      rect.setAttribute("width", "100%");
      rect.setAttribute("height", `${Math.max(0, range.bottom - range.top)}`);
      rect.setAttribute("fill", "white");
      mask.appendChild(rect);
    });
    svg.appendChild(mask);
    doc.body.appendChild(svg);
    root.style.webkitMask = "url(#slicer-mask-shape)";
    root.style.mask = "url(#slicer-mask-shape)";
    root.style.webkitMaskRepeat = "no-repeat";
    root.style.maskRepeat = "no-repeat";
    root.style.webkitMaskSize = "100% 100%";
    root.style.maskSize = "100% 100%";
    lockIframeScroll(iframe, { preserveScroll: true });
    if (win) {
      win.scrollTo({ top: Math.max(0, ranges[0].top - 40), behavior: "auto" });
    }
  }

  function applyInlineStyles(iframe) {
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!doc || !win || !doc.body) {
      return;
    }
    inlineStylesForNode(doc.body, win);
  }

  function inlineStylesForNode(node, win) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const element = node;
    const computed = win.getComputedStyle(element);
    if (computed) {
      let cssText = "";
      for (let i = 0; i < computed.length; i += 1) {
        const prop = computed[i];
        cssText += `${prop}:${computed.getPropertyValue(prop)};`;
      }
      element.setAttribute("style", cssText);
    }
    Array.from(element.children).forEach((child) => inlineStylesForNode(child, win));
  }

  function buildMaskBlock(doc, background, top, height) {
    const block = doc.createElement("div");
    block.style.position = "absolute";
    block.style.left = "0";
    block.style.right = "0";
    block.style.top = `${top}px`;
    block.style.height = `${Math.max(0, height)}px`;
    block.style.background = background;
    return block;
  }

  function getOverlayRanges(doc, sliceRanges) {
    const bodyOffset = doc.body
      ? doc.body.getBoundingClientRect().top + (doc.defaultView?.scrollY || 0)
      : 0;
    return sliceRanges.map((range) => {
      const top = Math.max(0, Math.min(range.yStart, range.yEnd) - bodyOffset);
      const height = Math.max(0, Math.abs(range.yEnd - range.yStart));
      return {
        top,
        bottom: top + height,
      };
    });
  }

  function pickMaskBackground(bodyBg, htmlBg) {
    const resolvedBody = normalizeBackground(bodyBg);
    if (resolvedBody) {
      return resolvedBody;
    }
    const resolvedHtml = normalizeBackground(htmlBg);
    if (resolvedHtml) {
      return resolvedHtml;
    }
    return "rgba(255, 255, 255, 1)";
  }

  function normalizeBackground(value) {
    if (!value) {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed === "transparent" || trimmed === "rgba(0, 0, 0, 0)") {
      return "";
    }
    return trimmed;
  }

  function scrollIframeToSlice(iframe, sliceRanges) {
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!doc || !win || !Array.isArray(sliceRanges) || !sliceRanges.length) {
      return;
    }
    const targetTop = Math.max(0, sliceRanges[0].top ?? 0);
    try {
      win.scrollTo({ top: Math.max(0, targetTop - 40), behavior: "auto" });
    } catch (error) {
      win.scrollTo(0, Math.max(0, targetTop - 40));
    }
  }

  function lockIframeScroll(iframe, options = {}) {
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!doc || !win) {
      return;
    }
    if (!options.preserveScroll) {
      doc.documentElement.style.overflow = "hidden";
      doc.body.style.overflow = "hidden";
      doc.documentElement.style.height = "100%";
      doc.body.style.height = "100%";
    }
    if (iframe.dataset.slicerScrollLocked) {
      return;
    }
    iframe.dataset.slicerScrollLocked = "1";
    const block = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    doc.addEventListener("wheel", block, { passive: false });
    doc.addEventListener("touchmove", block, { passive: false });
    doc.addEventListener("keydown", (event) => {
      const key = event.key;
      if (
        key === "ArrowDown" ||
        key === "ArrowUp" ||
        key === "PageDown" ||
        key === "PageUp" ||
        key === "Home" ||
        key === "End" ||
        key === " " ||
        key === "Spacebar"
      ) {
        block(event);
      }
    });
  }

  

  function buildPageDocument(pageHtml, safeTitle, safeBase, sliceRanges) {
    const overlayMarkup = buildOverlayMarkup(sliceRanges || []);
    let doc = pageHtml || "";
    const baseTag = `<base href="${safeBase}">`;
    const overlayStyle = `<style>
      body { position: relative; }
      #slicer-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2147483647; }
      .slicer-overlay-band { position: absolute; left: 0; right: 0; background: rgba(90, 170, 255, 0.22); border: 1px solid rgba(90, 170, 255, 0.45); }
    </style>`;

    if (doc.includes("<head")) {
      doc = doc.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}${overlayStyle}`);
    } else {
      doc = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>${baseTag}${overlayStyle}</head>${doc}</html>`;
    }

    if (doc.includes("<body")) {
      doc = doc.replace(/<body[^>]*>/i, (match) => `${match}<div id="slicer-overlay">${overlayMarkup}</div>`);
    } else {
      doc += `<div id="slicer-overlay">${overlayMarkup}</div>`;
    }

    if (!doc.toLowerCase().includes("<title")) {
      doc = doc.replace(/<head[^>]*>/i, (match) => `${match}<title>${safeTitle}</title>`);
    }
    return doc;
  }

  function buildOverlayMarkup(sliceRanges) {
    if (!sliceRanges.length) {
      return "";
    }
    return sliceRanges
      .map((range) => {
        const top = Math.min(range.yStart, range.yEnd);
        const height = Math.max(0, Math.abs(range.yEnd - range.yStart));
        return `<div class="slicer-overlay-band" style="top:${top}px;height:${height}px"></div>`;
      })
      .join("");
  }

  function updateFullPreviewButtons() {
    if (!fullPreview.modeSlice) {
      return;
    }
    fullPreview.modeSlice.classList.toggle("active", state.fullPreviewMode === "slice-only");
    fullPreview.modeSliceInPage.classList.toggle(
      "active",
      state.fullPreviewMode === "slice-in-page"
    );
    fullPreview.modePage.classList.toggle("active", state.fullPreviewMode === "page");
    if (fullPreview.sliceOnlyActions) {
      fullPreview.sliceOnlyActions.style.display =
        state.fullPreviewMode === "slice-only" ? "flex" : "none";
    }
    if (fullPreview.sliceMask) {
      fullPreview.sliceMask.classList.toggle("active", state.sliceOnlyMode === "mask");
      fullPreview.sliceFragment.classList.toggle("active", state.sliceOnlyMode === "fragment");
      fullPreview.sliceClip.classList.toggle("active", state.sliceOnlyMode === "clip");
      fullPreview.sliceInline.classList.toggle("active", state.sliceOnlyMode === "inline");
    }
  }

  function showHighlight(target) {
    const rect = target.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      hideHighlight();
      return;
    }
    highlight.el.style.display = "block";
    highlight.el.style.top = `${rect.top + window.scrollY}px`;
    highlight.el.style.left = `${rect.left + window.scrollX}px`;
    highlight.el.style.width = `${rect.width}px`;
    highlight.el.style.height = `${rect.height}px`;
  }

  function hideHighlight() {
    highlight.el.style.display = "none";
  }

  function showSliceLine(y) {
    sliceLine.el.style.display = "block";
    sliceLine.el.style.top = `${y}px`;
  }

  function hideSliceLine() {
    sliceLine.el.style.display = "none";
  }

  function showSliceStartLine(y) {
    sliceStartLine.el.style.display = "block";
    sliceStartLine.el.style.top = `${y}px`;
  }

  function hideSliceStartLine() {
    sliceStartLine.el.style.display = "none";
  }

  function hideSliceLines() {
    hideSliceLine();
    hideSliceStartLine();
  }
})();
