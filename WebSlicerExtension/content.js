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
    lastPickedElement: null,
  };

  const overlay = mountOverlay();
  const toolbar = buildToolbar();
  const previewPanel = buildPreviewPanel();
  const libraryPanel = buildLibraryPanel();
  const segmentLayer = buildSegmentLayer();
  const highlight = buildHighlight();

  overlay.uiRoot.appendChild(toolbar.el);
  overlay.uiRoot.appendChild(previewPanel.el);
  overlay.uiRoot.appendChild(libraryPanel.el);
  overlay.uiRoot.appendChild(segmentLayer.el);
  overlay.uiRoot.appendChild(highlight.el);

  updateStatus();

  hideToolbar();
  hidePreview();
  hideLibrary();
  hideHighlight();

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
    const exclude = createButton("Exclude");
    const preview = createButton("Preview");
    const library = createButton("Library");
    const save = createButton("Save");
    const reset = createButton("Reset");
    const close = createButton("Close");
    
    

    left.appendChild(pick);
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
    exclude.addEventListener("click", () => setMode("exclude"));
    preview.addEventListener("click", () => togglePreview());
    library.addEventListener("click", () => toggleLibrary());
    reset.addEventListener("click", () => resetState());
    close.addEventListener("click", () => hideToolbar());
    save.addEventListener("click", () => saveSlice());

    return { el, status, pick, exclude, preview, library, save, reset, close };
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
    const close = createButton("X");
    close.classList.add("slicer-preview__close");
    close.setAttribute("aria-label", "Close preview");
    actions.appendChild(showText);
    actions.appendChild(showHtml);
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
    close.addEventListener("click", () => hidePreview());

    return { el, text, html, showText, showHtml, mode: "text" };
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
    const refresh = createButton("Refresh");
    const close = createButton("Close");
    headerActions.appendChild(filter);
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
    refresh.addEventListener("click", () => loadLibrary());
    close.addEventListener("click", () => hideLibrary());

    return { el, list, filter };
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
    }
    updateStatus();
  }

  function resetState() {
    state.mode = "idle";
    state.startElement = null;
    state.lastPickedElement = null;
    state.segments = [];
    state.excludes = [];
    hidePreview();
    hideLibrary();
    clearSegmentHighlights();
    updateStatus();
  }

  function updateStatus(message = "") {
    const base = `Segments: ${state.segments.length} - Excludes: ${state.excludes.length}`;
    const mode = state.mode !== "idle" ? ` - ${state.mode}` : "";
    toolbar.status.textContent = message ? `${message} - ${base}${mode}` : `${base}${mode}`;
    if (toolbar.pick) {
      toolbar.pick.classList.toggle("active", state.mode === "pick");
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
    }
    updateStatus();
    renderSegmentHighlights();
  }

  function hideToolbar() {
    state.visible = false;
    state.mode = "idle";
    state.startElement = null;
    state.lastPickedElement = null;
    overlay.uiRoot.style.display = "none";
    toolbar.el.style.display = "none";
    hidePreview();
    hideLibrary();
    hideHighlight();
    clearSegmentHighlights();
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
    setPreviewContent({
      text: snapshot.text,
      html: snapshot.html,
      mode: "html",
    });
  }

  function hidePreview() {
    previewPanel.el.style.display = "none";
  }

  function setPreviewMode(mode) {
    previewPanel.mode = mode;
    previewPanel.text.style.display = mode === "text" ? "block" : "none";
    previewPanel.html.style.display = mode === "html" ? "block" : "none";
    previewPanel.showText.disabled = mode === "text";
    previewPanel.showHtml.disabled = mode === "html";
  }

  function setPreviewContent({ text, html, mode }) {
    previewPanel.text.textContent = text || "(no text)";
    previewPanel.html.innerHTML = html || "";
    setPreviewMode(mode || "text");
    previewPanel.el.style.display = "block";
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
      renderLibrary(response.slices || []);
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

      const title = document.createElement("div");
      title.className = "slicer-library__title";
      title.textContent = item.slice_title || item.page_title || item.url;

      const meta = document.createElement("div");
      meta.className = "slicer-library__meta";
      meta.textContent = `${item.url} - ${formatDate(item.created_at)}`;

      const actions = document.createElement("div");
      actions.className = "slicer-library__item-actions";

      const preview = createButton("Preview");
      const copyHtml = createButton("Copy HTML");
      const copyText = createButton("Copy text");
      const remove = createButton("Delete");

      preview.addEventListener("click", () => {
        setPreviewContent({
          text: item.text,
          html: item.html,
          mode: "html",
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

      actions.appendChild(preview);
      actions.appendChild(copyHtml);
      actions.appendChild(copyText);
      actions.appendChild(remove);

      row.appendChild(title);
      row.appendChild(meta);
      row.appendChild(actions);
      libraryPanel.list.appendChild(row);
    });
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
      return;
    }
    if (isEventInOverlay(event)) {
      hideHighlight();
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      hideHighlight();
      return;
    }
    state.highlightTarget = target;
    showHighlight(target);
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
      const segment = event.shiftKey && state.lastPickedElement
        ? buildSegment(state.lastPickedElement, target)
        : buildSegment(target, target);
      if (segment) {
        state.segments.push(segment);
        state.lastPickedElement = target;
        renderSegmentHighlights();
        updateStatus("Segment added");
      } else {
        updateStatus("Could not create segment");
      }
      return;
    }

    if (state.mode === "exclude") {
      addExclude(target);
      updateStatus("Exclude added");
      return;
    }
  }

  function handleKeyDown(event) {
    if (!state.visible) {
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
      start: buildLocator(startEl),
      end: buildLocator(endEl),
    };
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

  async function saveSlice() {
    const snapshot = buildSnapshot();
    if (!snapshot) {
      updateStatus("Nothing to save");
      return;
    }
    updateStatus("Saving...");
    const payload = {
      url: window.location.href,
      page_title: document.title,
      slice_title: null,
      recipe: snapshot.recipe,
      html: snapshot.html,
      text: snapshot.text,
    };
    try {
      const response = await chrome.runtime.sendMessage({
        type: "slicer-save",
        payload,
      });
      if (!response?.ok) {
        throw new Error(response?.error || "Save failed");
      }
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
})();
