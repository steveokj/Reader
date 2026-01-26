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
    lastPreview: null,
    fullPreviewMode: "slice-in-page",
    scrollLock: null,
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
    const exclude = createButton("Exclude");
    const preview = createButton("Preview");
    const library = createButton("Library");
    const save = createButton("Save");
    const reset = createButton("Reset");
    const close = createButton("Close");
    
    

    left.appendChild(pick);
    left.appendChild(slice);
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
    exclude.addEventListener("click", () => setMode("exclude"));
    preview.addEventListener("click", () => togglePreview());
    library.addEventListener("click", () => toggleLibrary());
    reset.addEventListener("click", () => resetState());
    close.addEventListener("click", () => hideToolbar());
    save.addEventListener("click", () => saveSlice());

    return { el, status, pick, slice, exclude, preview, library, save, reset, close };
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

    const actions = document.createElement("div");
    actions.className = "slicer-full__actions";
    const modeSlice = createButton("Slice only");
    const modeSliceInPage = createButton("Slice in page");
    const modePage = createButton("Page");
    actions.appendChild(modeSlice);
    actions.appendChild(modeSliceInPage);
    actions.appendChild(modePage);

    const close = createButton("X");
    close.classList.add("slicer-full__close");
    close.setAttribute("aria-label", "Close full preview");

    header.appendChild(title);
    header.appendChild(actions);
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
    close.addEventListener("click", () => hideFullPreview());
    el.addEventListener("click", (event) => {
      if (event.target === el) {
        hideFullPreview();
      }
    });

    return { el, iframe, title, modeSlice, modeSliceInPage, modePage };
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
      hideSliceLines();
    } else {
      state.mode = "slice";
      state.startElement = null;
      state.lastPickedElement = null;
      state.sliceStartY = null;
      hideHighlight();
    }
    updateStatus();
  }

  function resetState() {
    state.mode = "idle";
    state.startElement = null;
    state.lastPickedElement = null;
    state.sliceStartY = null;
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

  function toggleToolbar() {
    if (state.visible) {
      hideToolbar();
    } else {
      showToolbar({ startPick: true });
    }
  }

  function showToolbar(options = {}) {
    state.visible = true;
    overlay.uiRoot.style.display = "block";
    toolbar.el.style.display = "flex";
    if (options.startPick) {
      state.mode = "pick";
      state.startElement = null;
      state.lastPickedElement = null;
      state.sliceStartY = null;
      hideSliceLines();
    }
    updateStatus();
    renderSegmentHighlights();
  }

  function hideToolbar() {
    state.visible = false;
    state.mode = "idle";
    state.startElement = null;
    state.lastPickedElement = null;
    state.sliceStartY = null;
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
    setPreviewContent({
      text: snapshot.text,
      html: snapshot.html,
      mode: "html",
      baseUrl: window.location.href,
      title: document.title,
      pageHtml,
      sliceRanges,
    });
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
    }
    unlockScroll();
  }

  function setFullPreviewMode(mode) {
    state.fullPreviewMode = mode;
    if (!state.lastPreview) {
      return;
    }
    openFullPreview({ ...state.lastPreview, mode });
  }

  function setPreviewMode(mode) {
    previewPanel.mode = mode;
    previewPanel.text.style.display = mode === "text" ? "block" : "none";
    previewPanel.html.style.display = mode === "html" ? "block" : "none";
    previewPanel.showText.disabled = mode === "text";
    previewPanel.showHtml.disabled = mode === "html";
  }

  function setPreviewContent({ text, html, mode, baseUrl, title, pageHtml, sliceRanges }) {
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
    const pageHtml = await fetchPageHtml(item.page_id);
    const sliceRanges = getSliceRangesFromRecipe(item.recipe);
    const baseUrl = item.url || window.location.href;
    const title = item.slice_title || item.page_title || item.url || "Slice Preview";
    state.lastPreview = {
      html: item.html || "",
      text: item.text || "",
      baseUrl,
      title,
      pageHtml: pageHtml || "",
      sliceRanges,
    };
    openFullPreview({
      html: item.html || "",
      pageHtml,
      baseUrl,
      title,
      mode: "slice-in-page",
      sliceRanges,
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
        state.sliceStartY = y;
        showSliceStartLine(y);
        updateStatus("Slice start set");
        return;
      }
      const start = Math.min(state.sliceStartY, y);
      const end = Math.max(state.sliceStartY, y);
      const segment = buildSliceSegment(start, end);
      if (segment) {
        pushUndo();
        state.segments.push(segment);
        renderSegmentHighlights();
        updateStatus("Slice added");
      } else {
        updateStatus("Could not create slice");
      }
      state.sliceStartY = null;
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
          Number.isFinite(segment.yStart) &&
          Number.isFinite(segment.yEnd)
      )
      .map((segment) => ({
        yStart: segment.yStart,
        yEnd: segment.yEnd,
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

  function buildSliceSegment(yStart, yEnd) {
    if (yStart === null || yEnd === null) {
      return null;
    }
    return {
      type: "slice",
      yStart,
      yEnd,
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
      },
    };
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
    updateStatus("Saving...");
    const payload = {
      url: window.location.href,
      page_title: document.title,
      slice_title: null,
      recipe: snapshot.recipe,
      html: snapshot.html,
      text: snapshot.text,
      page_html: pageHtml,
      page_html_refresh: false,
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

  function openFullPreview({ html, pageHtml, baseUrl, title, mode, sliceRanges }) {
    const safeTitle = escapeHtml(title || "Slice Preview");
    const displayTitle = title || "Slice Preview";
    const safeBase = escapeHtml(baseUrl || window.location.href);
    const resolvedMode = mode || "page";
    state.fullPreviewMode = resolvedMode;
    updateFullPreviewButtons();

    let doc = "";
    const sliceHtml = html || "";
    if (resolvedMode === "slice-only" || !pageHtml) {
      doc = buildSliceDocument(sliceHtml, safeTitle, safeBase);
    } else if (resolvedMode === "slice-in-page") {
      doc = buildPageDocument(pageHtml, safeTitle, safeBase, sliceRanges || []);
    } else {
      doc = buildPageDocument(pageHtml, safeTitle, safeBase, []);
    }

    fullPreview.title.textContent = displayTitle;
    fullPreview.iframe.srcdoc = doc;
    fullPreview.iframe.onload = () => {
      if (state.fullPreviewMode !== "slice-in-page") {
        return;
      }
      if (!Array.isArray(sliceRanges) || sliceRanges.length === 0) {
        return;
      }
      const firstTop = Math.min(
        ...sliceRanges.map((range) => Math.min(range.yStart, range.yEnd))
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
