"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { useRouter } from "next/navigation";

import ActionMenu from "@/components/ActionMenu";
import DocumentIngestForm from "@/components/DocumentIngestForm";
import ReaderDocument from "@/components/ReaderDocument";
import ReaderHighlightsPanel from "@/components/ReaderHighlightsPanel";
import ReaderSettingsPanel from "@/components/ReaderSettingsPanel";
import ReaderSectionPicker from "@/components/ReaderSectionPicker";
import SelectionOverlay from "@/components/SelectionOverlay";
import SidePanel from "@/components/SidePanel";
import AudioRecorderModal from "@/components/modals/AudioRecorderModal";
import GrammarModal from "@/components/modals/GrammarModal";
import NoteModal from "@/components/modals/NoteModal";
import { getClientApiBase } from "@/lib/apiBase";
import {
  defaultReaderSettings,
  getFontFamilyCss,
  getThemeTokens,
  getTextWidthStyles,
  type ReaderSettings,
  type ReaderSettingsUpdate,
} from "@/lib/reader/settings";
import { buildQuoteSelector } from "@/lib/selection/buildQuoteSelector";
import { getSelectionOffsets } from "@/lib/selection/getSelectionOffsets";
import { rangeFromOffsets } from "@/lib/selection/rangeFromOffsets";

const LONG_PRESS_MOVE_THRESHOLD = 12;
const LONG_PRESS_DELAY_MS = 1950;
const TAP_WINDOW_MS = 450;
const NAV_SWIPE_ZONE_PX = 80;
const NAV_SWIPE_MIN_PX = 60;
const NAV_SWIPE_MAX_MS = 900;
const NAV_SWIPE_HORIZONTAL_RATIO = 1.2;

function normalizeBannerText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isWordChar(value: string) {
  return /[A-Za-z0-9']/u.test(value);
}

function normalizeSearchSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildSearchSnippet(text: string, start: number, end: number) {
  const context = 42;
  const snippetStart = Math.max(0, start - context);
  const snippetEnd = Math.min(text.length, end + context);
  const raw = text.slice(snippetStart, snippetEnd);
  const normalized = normalizeSearchSnippet(raw);
  const prefix = snippetStart > 0 ? "..." : "";
  const suffix = snippetEnd < text.length ? "..." : "";
  return `${prefix}${normalized}${suffix}`;
}

type CaretPoint = { node: Node; offset: number };
type NavSwipeStart = { x: number; y: number; time: number; pointerId: number | null };

function getWordAtOffset(text: string, offset: number): string | null {
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
  return normalizeBannerText(text.slice(start, end));
}

function getWordBoundsAtOffset(
  text: string,
  offset: number
): { word: string; start: number; end: number } | null {
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
  const word = normalizeBannerText(text.slice(start, end));
  return word ? { word, start, end } : null;
}

function getWordRangeFromPointRange(pointRange: Range): Range | null {
  const resolved = resolveTextNode(pointRange.startContainer, pointRange.startOffset);
  if (!resolved) {
    return null;
  }
  const text = resolved.node.data ?? "";
  if (!text) {
    return null;
  }
  const info = getWordBoundsAtOffset(text, resolved.offset);
  if (!info) {
    return null;
  }
  const range = document.createRange();
  range.setStart(resolved.node, info.start);
  range.setEnd(resolved.node, info.end);
  return range;
}

function buildSpanRange(first: Range, second: Range): Range {
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

function getCaretPoint(x: number, y: number): CaretPoint | null {
  const caretPositionFromPoint = (
    document as unknown as {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    }
  ).caretPositionFromPoint;
  if (caretPositionFromPoint) {
    const position = caretPositionFromPoint.call(document, x, y);
    if (position) {
      return { node: position.offsetNode, offset: position.offset };
    }
  }
  const caretRangeFromPoint = (
    document as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  ).caretRangeFromPoint;
  if (caretRangeFromPoint) {
    const range = caretRangeFromPoint.call(document, x, y);
    if (range) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

function resolveTextNode(node: Node, offset: number): { node: Text; offset: number } | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return { node: node as Text, offset };
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }
  const element = node as Element;
  const childNodes = element.childNodes;
  const candidateIndex =
    childNodes.length === 0 ? -1 : Math.min(Math.max(offset, 0), childNodes.length - 1);
  const candidate = candidateIndex >= 0 ? childNodes[candidateIndex] : null;

  const findTextNode = (root: Node | null) => {
    if (!root) {
      return null;
    }
    if (root.nodeType === Node.TEXT_NODE) {
      return root as Text;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    return walker.nextNode() as Text | null;
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

function getWordFromNode(node: Node, offset: number): string | null {
  const resolved = resolveTextNode(node, offset);
  if (!resolved) {
    return null;
  }
  const textNode = resolved.node;
  const text = textNode.data ?? "";
  if (!text) {
    return null;
  }

  return getWordAtOffset(text, resolved.offset);
}

function getWordFromTextNodeAtPoint(textNode: Text, x: number, y: number): string | null {
  const text = textNode.data ?? "";
  if (!text) {
    return null;
  }
  const containerRange = document.createRange();
  containerRange.selectNodeContents(textNode);
  const containerRects = containerRange.getClientRects();
  let inContainer = false;
  for (const rect of Array.from(containerRects)) {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      inContainer = true;
      break;
    }
  }
  if (!inContainer) {
    return null;
  }
  const wordRegex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = wordRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const rects = range.getClientRects();
    for (const rect of Array.from(rects)) {
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return normalizeBannerText(match[0]);
      }
    }
  }
  return null;
}

function getWordAtPoint(x: number, y: number): string | null {
  const caretRange = getCaretRangeFromPoint(x, y);
  const selection = window.getSelection();
  if (caretRange && selection) {
    selection.removeAllRanges();
    selection.addRange(caretRange);
    if (typeof selection.modify === "function") {
      selection.modify("move", "backward", "word");
      selection.modify("extend", "forward", "word");
      const word = normalizeBannerText(selection.toString());
      selection.removeAllRanges();
      if (word) {
        return word;
      }
    } else {
      selection.removeAllRanges();
    }
  }

  const caretPoint = getCaretPoint(x, y);
  const candidates: Text[] = [];
  if (caretPoint) {
    const resolved = resolveTextNode(caretPoint.node, caretPoint.offset);
    if (resolved?.node) {
      candidates.push(resolved.node);
    }
  }

  const element = document.elementFromPoint(x, y);
  if (element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let current = walker.nextNode();
    let count = 0;
    while (current && count < 200) {
      candidates.push(current as Text);
      current = walker.nextNode();
      count += 1;
    }
  }

  for (const candidate of candidates) {
    const wordAtPoint = getWordFromTextNodeAtPoint(candidate, x, y);
    if (wordAtPoint) {
      return wordAtPoint;
    }
  }

  if (caretPoint) {
    return getWordFromNode(caretPoint.node, caretPoint.offset);
  }
  return null;
}

type ReaderSection = {
  id: number;
  section_key: string;
  title?: string | null;
  content_text: string;
  content_html?: string | null;
};

type SearchResult = {
  id: string;
  sectionId: number;
  start: number;
  end: number;
  snippet: string;
};

type ReaderClientProps = {
  documentId: number;
  documentTitle: string;
  sourceType: string;
  sections: ReaderSection[];
  initialSectionKey?: string | null;
};

type MenuState = {
  top: number;
  left: number;
  selectionText: string;
  sectionId: number;
  selector: {
    position: {
      start: number;
      end: number;
    };
    quote: {
      exact: string;
      prefix: string;
      suffix: string;
    };
  };
};

type Selection = {
  id: number;
  document_id: number;
  section_id: number;
  selector: MenuState["selector"];
  created_at: string;
};

type Addition = {
  id: number;
  selection_id: number;
  type: string;
  title?: string | null;
  text_content?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type Marker = {
  id: number;
  target_type: string;
  target_id: number;
  kind: "like" | "highlight" | "todo";
};

type WordBanner = {
  id: number;
  word: string;
  sectionId: number | null;
  start: number | null;
  end: number | null;
};

type WordSelectionTap = WordBanner & {
  range: Range | null;
};

type MarkerKind = "like" | "highlight" | "todo";

type DraftSelection = {
  selector: MenuState["selector"];
  selectionText: string;
  sectionId: number;
};

type GrammarPayload = {
  kind: "word" | "bars" | "structure" | "lookup";
  text?: string;
  lookup_url?: string;
};

type AudioPayload = {
  url: string;
  mime: string;
  size_bytes: number;
};

function IconChapters() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h6v14H5z" />
      <path d="M13 7h6v12h-6z" />
      <path d="M7 9h2" />
      <path d="M15 11h2" />
    </svg>
  );
}

function IconNew() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M16.5 16.5l3.5 3.5" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M4 12h2M18 12h2M12 4v2M12 18v2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M6.5 17.5l1.4-1.4M16.1 7.9l1.4-1.4" />
    </svg>
  );
}

function IconHighlights() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14v14H5z" />
      <path d="M8 9h8" />
      <path d="M8 13h6" />
    </svg>
  );
}

type CaretRangeFromPoint = (x: number, y: number) => Range | null;
type CaretPositionFromPoint = (x: number, y: number) => { offsetNode: Node; offset: number } | null;

function getCaretRangeFromPoint(x: number, y: number): Range | null {
  const caretRangeFromPoint = (document as unknown as { caretRangeFromPoint?: CaretRangeFromPoint })
    .caretRangeFromPoint;
  if (caretRangeFromPoint) {
    return caretRangeFromPoint.call(document, x, y);
  }

  const caretPositionFromPoint = (
    document as unknown as { caretPositionFromPoint?: CaretPositionFromPoint }
  ).caretPositionFromPoint;
  if (caretPositionFromPoint) {
    const position = caretPositionFromPoint.call(document, x, y);
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

function buildRange(anchor: Range, focus: Range): Range {
  const range = document.createRange();
  const comparison = anchor.compareBoundaryPoints(Range.START_TO_START, focus);
  if (comparison <= 0) {
    range.setStart(anchor.startContainer, anchor.startOffset);
    range.setEnd(focus.startContainer, focus.startOffset);
  } else {
    range.setStart(focus.startContainer, focus.startOffset);
    range.setEnd(anchor.startContainer, anchor.startOffset);
  }
  return range;
}

export default function ReaderClient({
  documentId,
  documentTitle,
  sourceType,
  sections,
  initialSectionKey,
}: ReaderClientProps) {
  const apiBase = getClientApiBase();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Range | null>(null);
  const audioSelectionRef = useRef<number | null>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const mobilePageNavRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const longPressPointerRef = useRef<number | null>(null);
  const longPressActiveRef = useRef(false);
  const longPressAnchorRef = useRef<Range | null>(null);
  const pointerTouchSessionRef = useRef(false);
  const lastPointerTouchUpRef = useRef(0);
  const suppressTouchFinalizeRef = useRef(false);
  const tapEligibleRef = useRef(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const lastHandledTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const doubleTapInProgressRef = useRef(false);
  const docTapStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const docTapMovedRef = useRef(false);
  const docTapInScopeRef = useRef(false);
  const navSwipeStartRef = useRef<NavSwipeStart | null>(null);

  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitted, setIsCommitted] = useState(false);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeSelectionId, setActiveSelectionId] = useState<number | null>(null);
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [additionMarkers, setAdditionMarkers] = useState<Record<number, Marker[]>>({});
  const [pendingMarkerKinds, setPendingMarkerKinds] = useState<MarkerKind[]>([]);
  const [draftSelection, setDraftSelection] = useState<DraftSelection | null>(null);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [grammarModalOpen, setGrammarModalOpen] = useState(false);
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Addition | null>(null);
  const scrolledSectionRef = useRef<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNavMode, setMobileNavMode] = useState<"main" | "pages">("main");
  const [mobilePanel, setMobilePanel] = useState<
    "chapters" | "highlights" | "new" | "search" | "settings" | "selection" | null
  >(null);
  const [sidePanelTab, setSidePanelTab] = useState<"active" | "highlights">("highlights");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [searchResultsQuery, setSearchResultsQuery] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const nextWordBannerIdRef = useRef(0);
  const lastSelectableWordRef = useRef<WordSelectionTap | null>(null);
  const finalizeRangeRef = useRef<((range: Range) => void) | null>(null);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(defaultReaderSettings);
  const [settingsStatus, setSettingsStatus] = useState<"idle" | "loading" | "saving" | "error">(
    "loading"
  );
  const settingsSaveTimerRef = useRef<number | null>(null);
  const pendingSettingsRef = useRef<ReaderSettingsUpdate>({});
  const settingsTouchedRef = useRef(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const clearTapTimer = useCallback(() => {
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  const resetTapState = useCallback(() => {
    tapCountRef.current = 0;
    lastTapRef.current = null;
    clearTapTimer();
  }, [clearTapTimer]);

  const startNavSwipe = useCallback(
    (x: number, y: number, pointerId: number | null) => {
      if (!isMobile) {
        navSwipeStartRef.current = null;
        return;
      }
      const container = containerRef.current;
      if (!container) {
        navSwipeStartRef.current = null;
        return;
      }
      const rect = container.getBoundingClientRect();
      const yFromTop = y - rect.top;
      if (yFromTop > NAV_SWIPE_ZONE_PX) {
        navSwipeStartRef.current = null;
        return;
      }
      navSwipeStartRef.current = { x, y, time: Date.now(), pointerId };
    },
    [isMobile]
  );

  const handleNavSwipeEnd = useCallback(
    (x: number, y: number, pointerId: number | null) => {
      const start = navSwipeStartRef.current;
      navSwipeStartRef.current = null;
      if (!start) {
        return false;
      }
      if (start.pointerId !== null && pointerId !== null && start.pointerId !== pointerId) {
        return false;
      }
      const elapsed = Date.now() - start.time;
      const dx = x - start.x;
      const dy = y - start.y;
      const distance = Math.hypot(dx, dy);
      if (elapsed > NAV_SWIPE_MAX_MS || distance < NAV_SWIPE_MIN_PX) {
        return false;
      }
      const horizontal =
        Math.abs(dx) >= Math.abs(dy) * NAV_SWIPE_HORIZONTAL_RATIO;
      if (!horizontal) {
        return false;
      }
      const mode = dx > 0 ? "pages" : "main";
      setMobileNavMode(mode);
      setMobileNavOpen(true);
      setMobilePanel(null);
      return true;
    },
    [setMobileNavMode, setMobileNavOpen, setMobilePanel]
  );

  const queueSettingsUpdate = useCallback(
    (update: ReaderSettingsUpdate) => {
      settingsTouchedRef.current = true;
      setReaderSettings((prev) => ({ ...prev, ...update }));
      pendingSettingsRef.current = { ...pendingSettingsRef.current, ...update };

      if (settingsSaveTimerRef.current !== null) {
        window.clearTimeout(settingsSaveTimerRef.current);
      }

      settingsSaveTimerRef.current = window.setTimeout(async () => {
        const payload = pendingSettingsRef.current;
        pendingSettingsRef.current = {};
        if (!Object.keys(payload).length) {
          return;
        }
        setSettingsStatus("saving");
        try {
          const response = await fetch(`${apiBase}/settings`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            throw new Error("Failed to save settings.");
          }
          const data = (await response.json()) as { settings?: ReaderSettings };
          if (data.settings) {
            setReaderSettings((prev) => ({ ...prev, ...data.settings }));
          }
          setSettingsStatus("idle");
        } catch (error) {
          setSettingsStatus("error");
        }
      }, 320);
    },
    [apiBase]
  );

  const themeTokens = useMemo(
    () => getThemeTokens(readerSettings.theme),
    [readerSettings.theme]
  );

  const widthStyles = useMemo(
    () => getTextWidthStyles(readerSettings.text_width),
    [readerSettings.text_width]
  );

  const readerStyle = useMemo<CSSProperties>(() => {
    return {
      "--reader-font-size": `${readerSettings.font_size}px`,
      "--reader-line-height": String(readerSettings.line_height),
      "--reader-paragraph-spacing": `${readerSettings.paragraph_spacing}rem`,
      "--reader-font-family": getFontFamilyCss(readerSettings.font_family),
      "--reader-content-max-width": widthStyles.maxWidth,
      "--reader-side-padding": widthStyles.sidePadding,
      "--reader-ink": themeTokens.ink,
      "--reader-paper": themeTokens.paper,
      "--reader-panel": themeTokens.panel,
      "--reader-border": themeTokens.border,
      "--reader-shadow": themeTokens.shadow,
      "--reader-accent": themeTokens.accent,
      "--reader-highlight": themeTokens.highlight,
      "--reader-highlight-active": themeTokens.highlightActive,
      "--reader-ink-muted": themeTokens.inkMuted,
      "--reader-ink-subtle": themeTokens.inkSubtle,
      backgroundColor: themeTokens.paper,
      color: themeTokens.ink,
    } as CSSProperties;
  }, [readerSettings, themeTokens, widthStyles]);

  const readerScrollStyle = useMemo<CSSProperties>(
    () => ({
      paddingLeft: widthStyles.sidePadding,
      paddingRight: widthStyles.sidePadding,
    }),
    [widthStyles.sidePadding]
  );

  const readerSectionStyle = useMemo<CSSProperties>(
    () => ({
      maxWidth: widthStyles.maxWidth,
      width: "100%",
      marginLeft: "auto",
      marginRight: "auto",
    }),
    [widthStyles.maxWidth]
  );

  const readerArticleStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${readerSettings.font_size}px`,
      lineHeight: readerSettings.line_height,
      fontFamily: getFontFamilyCss(readerSettings.font_family),
    }),
    [readerSettings.font_family, readerSettings.font_size, readerSettings.line_height]
  );

  const readerParagraphStyle = useMemo<CSSProperties>(
    () => ({
      marginBottom: `${readerSettings.paragraph_spacing}rem`,
    }),
    [readerSettings.paragraph_spacing]
  );

  const mobilePanelStyle = useMemo<CSSProperties>(
    () => ({
      backgroundColor: themeTokens.panel,
      borderColor: themeTokens.border,
      boxShadow: `0 16px 30px ${themeTokens.shadow}`,
      color: themeTokens.ink,
    }),
    [themeTokens]
  );

  const mobileNavStyle = useMemo<CSSProperties>(
    () => ({
      backgroundColor: themeTokens.panel,
      borderColor: themeTokens.border,
      boxShadow: `0 18px 30px ${themeTokens.shadow}`,
      color: themeTokens.ink,
    }),
    [themeTokens]
  );

  const navButtonStyle = useCallback(
    (active: boolean): CSSProperties => ({
      color: active ? themeTokens.accent : themeTokens.ink,
      opacity: active ? 1 : 0.75,
    }),
    [themeTokens]
  );

  const highlightRefreshKey = useMemo(
    () =>
      [
        readerSettings.font_size,
        readerSettings.line_height,
        readerSettings.paragraph_spacing,
        readerSettings.text_width,
        readerSettings.font_family,
      ].join("|"),
    [readerSettings]
  );

  const sectionById = useMemo(() => {
    return new Map(sections.map((section) => [section.id, section]));
  }, [sections]);

  const getSectionElementFromNode = useCallback((node: Node | null): HTMLElement | null => {
    if (!node) {
      return null;
    }
    if (node instanceof HTMLElement) {
      return node.closest("[data-section-id]") as HTMLElement | null;
    }
    if (node.parentElement) {
      return node.parentElement.closest("[data-section-id]") as HTMLElement | null;
    }
    return null;
  }, []);

  const normalizeWordKey = useCallback((value: string) => {
    return normalizeBannerText(value).toLowerCase();
  }, []);

  const getWordBannerFromRange = useCallback(
    (range: Range): Omit<WordBanner, "id"> | null => {
      const sectionElement = getSectionElementFromNode(range.startContainer);
      if (!sectionElement) {
        return null;
      }
      const sectionId = Number(sectionElement.dataset.sectionId ?? "");
      if (!sectionId || Number.isNaN(sectionId)) {
        return null;
      }
      const offsets = getSelectionOffsets(range, sectionElement);
      if (!offsets) {
        return null;
      }
      const section = sectionById.get(sectionId);
      const usesParagraphOffsets = Boolean(sectionElement.querySelector("[data-paragraph]"));
      const currentText = usesParagraphOffsets
        ? section?.content_text ?? ""
        : sectionElement.textContent ?? section?.content_text ?? "";
      const wordInfo = getWordBoundsAtOffset(currentText, offsets.start);
      if (!wordInfo) {
        return null;
      }
      return {
        word: wordInfo.word,
        sectionId,
        start: wordInfo.start,
        end: wordInfo.end,
      };
    },
    [getSectionElementFromNode, sectionById]
  );

  const selectWordRange = useCallback((first: WordBanner, second: WordBanner) => {
    if (
      first.sectionId === null ||
      second.sectionId === null ||
      first.start === null ||
      first.end === null ||
      second.start === null ||
      second.end === null
    ) {
      return;
    }
    if (first.sectionId !== second.sectionId) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const sectionElement = container.querySelector<HTMLElement>(
      `[data-section-id="${first.sectionId}"]`
    );
    if (!sectionElement) {
      return;
    }
    const start = Math.min(first.start, second.start);
    const end = Math.max(first.end, second.end);
    if (start === end) {
      return;
    }
    const range = rangeFromOffsets(sectionElement, start, end);
    if (!range) {
      return;
    }
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        "[double-tap] selected range",
        {
          sectionId: first.sectionId,
          start,
          end,
          first: first.word,
          second: second.word,
        }
      );
    }
  }, []);

  const selectWordRangeFromTap = useCallback(
    (previous: WordSelectionTap, current: WordSelectionTap) => {
      if (previous.range && current.range) {
        const spanRange = buildSpanRange(previous.range, current.range);
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(spanRange);
        }
        if (process.env.NODE_ENV !== "production") {
          console.debug("[double-tap] selected span range", {
            first: previous.word,
            second: current.word,
          });
        }
        return true;
      }

      if (
        previous.sectionId !== null &&
        current.sectionId !== null &&
        previous.start !== null &&
        previous.end !== null &&
        current.start !== null &&
        current.end !== null
      ) {
        selectWordRange(previous, current);
        return true;
      }

      return false;
    },
    [selectWordRange]
  );

  const addWordBanner = useCallback(
    (tap: Omit<WordSelectionTap, "id">): boolean => {
      const lastBanner = lastSelectableWordRef.current;
      if (
        lastBanner &&
        normalizeWordKey(lastBanner.word) === normalizeWordKey(tap.word) &&
        lastBanner.sectionId === tap.sectionId &&
        lastBanner.start === tap.start
      ) {
        return false;
      }

      const banner: WordBanner = {
        id: nextWordBannerIdRef.current++,
        word: tap.word,
        sectionId: tap.sectionId,
        start: tap.start,
        end: tap.end,
      };
      const selectionTap: WordSelectionTap = {
        ...banner,
        range: tap.range ?? null,
      };
      const previous = lastSelectableWordRef.current;
      if (previous && normalizeWordKey(previous.word) !== normalizeWordKey(selectionTap.word)) {
        const didSelect = selectWordRangeFromTap(previous, selectionTap);
        if (didSelect) {
          window.setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              finalizeRangeRef.current?.(selection.getRangeAt(0));
            }
          }, 0);
        }
      }
      const hasSelectableRange =
        selectionTap.range !== null ||
        (selectionTap.sectionId !== null && selectionTap.start !== null && selectionTap.end !== null);
      if (hasSelectableRange) {
        lastSelectableWordRef.current = selectionTap;
      }
      return true;
    },
    [normalizeWordKey, selectWordRangeFromTap]
  );

  const clearWordBanners = useCallback(() => {
    lastSelectableWordRef.current = null;
  }, []);

  const clearLongPressAnchor = useCallback(() => {
    longPressAnchorRef.current = null;
  }, []);

  const activeSelection = selections.find((selection) => selection.id === activeSelectionId) ?? null;
  const grammarSelectionText =
    menuState?.selectionText ??
    draftSelection?.selectionText ??
    activeSelection?.selector.quote.exact ??
    "";

  const refreshAdditionMarkers = useCallback(async (items: Addition[]) => {
    if (items.length === 0) {
      setAdditionMarkers({});
      return;
    }
    try {
      const entries = await Promise.all(
        items.map(async (item) => {
          const response = await fetch(
            `${apiBase}/markers?target_type=addition&target_id=${item.id}`,
            { cache: "no-store" }
          );
          if (!response.ok) {
            return [item.id, []] as const;
          }
          const data = (await response.json()) as { markers?: Marker[] };
          return [item.id, data.markers ?? []] as const;
        })
      );
      setAdditionMarkers(Object.fromEntries(entries));
    } catch (error) {
      console.error(error);
    }
  }, []);

  const refreshAdditions = useCallback(
    async (selectionId: number) => {
      try {
        const response = await fetch(`${apiBase}/additions?selection_id=${selectionId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { additions?: Addition[] };
        const nextAdditions = data.additions ?? [];
        setAdditions(nextAdditions);
        await refreshAdditionMarkers(nextAdditions);
      } catch (error) {
        console.error(error);
      }
    },
    [refreshAdditionMarkers]
  );

  const refreshMarkers = useCallback(async (selectionId: number) => {
    try {
      const response = await fetch(
        `${apiBase}/markers?target_type=selection&target_id=${selectionId}`,
        { cache: "no-store" }
      );
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { markers?: Marker[] };
      setMarkers(data.markers ?? []);
    } catch (error) {
      console.error(error);
    }
  }, []);

  useEffect(() => {
    const loadSelections = async () => {
      try {
        const response = await fetch(`${apiBase}/selections?document_id=${documentId}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { selections?: Selection[] };
        setSelections(data.selections ?? []);
      } catch (error) {
        console.error(error);
      }
    };

    loadSelections();
  }, [documentId]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const computeIsMobile = () => {
      const touchCapable = navigator.maxTouchPoints > 0;
      const widthMatch = window.innerWidth <= 1024;
      setIsMobile(media.matches || (touchCapable && widthMatch));
    };
    const handleChange = () => {
      computeIsMobile();
    };
    computeIsMobile();
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
    } else {
      media.addListener(handleChange);
    }
    window.addEventListener("resize", handleChange);
    return () => {
      if (media.addEventListener) {
        media.removeEventListener("change", handleChange);
      } else {
        media.removeListener(handleChange);
      }
      window.removeEventListener("resize", handleChange);
    };
  }, []);


  useEffect(() => {
    let cancelled = false;
    const loadSettings = async () => {
      setSettingsStatus("loading");
      try {
        const response = await fetch(`${apiBase}/settings`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load settings.");
        }
        const data = (await response.json()) as { settings?: ReaderSettings };
        if (cancelled) {
          return;
        }
        if (data.settings) {
          setReaderSettings((prev) =>
            settingsTouchedRef.current ? { ...data.settings, ...prev } : { ...prev, ...data.settings }
          );
        }
        setSettingsStatus("idle");
      } catch (error) {
        if (!cancelled) {
          setSettingsStatus("error");
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  useEffect(() => {
    return () => {
      if (settingsSaveTimerRef.current !== null) {
        window.clearTimeout(settingsSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const bodyStyle = document.body.style;
    const previous = {
      backgroundColor: bodyStyle.backgroundColor,
      backgroundImage: bodyStyle.backgroundImage,
      color: bodyStyle.color,
    };
    bodyStyle.backgroundImage = "none";
    bodyStyle.backgroundColor = themeTokens.paper;
    bodyStyle.color = themeTokens.ink;
    return () => {
      bodyStyle.backgroundColor = previous.backgroundColor;
      bodyStyle.backgroundImage = previous.backgroundImage;
      bodyStyle.color = previous.color;
    };
  }, [themeTokens]);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
      setMobilePanel(null);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    if (mobilePanel === "selection" && !menuState) {
      setMobilePanel(null);
      setMobileNavOpen(false);
    }
  }, [isMobile, menuState, mobilePanel]);

  useEffect(() => {
    if (!initialSectionKey) {
      return;
    }
    if (scrolledSectionRef.current === initialSectionKey) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const safeKey = initialSectionKey.replace(/"/g, '\\"');
    const target = container.querySelector<HTMLElement>(`[data-section-key="${safeKey}"]`);
    if (target) {
      target.scrollIntoView({ block: "start" });
      scrolledSectionRef.current = initialSectionKey;
    }
  }, [initialSectionKey, sections]);

  useEffect(() => {
    if (!activeSelectionId) {
      setAdditions([]);
      setMarkers([]);
      setAdditionMarkers({});
      return;
    }

    refreshAdditions(activeSelectionId);
    refreshMarkers(activeSelectionId);
  }, [activeSelectionId, refreshAdditions, refreshMarkers]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updatePageMetrics = () => {
      const pageSize = container.clientHeight;
      if (!pageSize) {
        return;
      }
      const total = Math.max(1, Math.ceil(container.scrollHeight / pageSize));
      setPageCount(total);
      const page = Math.min(total, Math.max(1, Math.floor(container.scrollTop / pageSize) + 1));
      setCurrentPage(page);
    };

    updatePageMetrics();
    container.addEventListener("scroll", updatePageMetrics, { passive: true });
    window.addEventListener("resize", updatePageMetrics);

    return () => {
      container.removeEventListener("scroll", updatePageMetrics);
      window.removeEventListener("resize", updatePageMetrics);
    };
  }, [highlightRefreshKey, isMobile, sections.length]);

  useEffect(() => {
    if (!mobileNavOpen || mobileNavMode !== "pages") {
      return;
    }
    setPageInput(String(currentPage));
  }, [currentPage, mobileNavMode, mobileNavOpen]);

  const clearSelection = useCallback(() => {
    if (doubleTapInProgressRef.current) {
      return;
    }
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    setMenuState(null);
    setIsCommitted(false);
    setPendingMarkerKinds([]);
    setDraftSelection(null);
    anchorRef.current = null;
    clearLongPressTimer();
    resetTapState();
    clearWordBanners();
  }, [clearLongPressTimer, resetTapState, clearWordBanners]);

  const discardDraftSelection = useCallback(() => {
    if (!activeSelectionId && !isCommitted) {
      clearSelection();
    } else {
      setDraftSelection(null);
    }
  }, [activeSelectionId, clearSelection, isCommitted]);

  const persistSelection = useCallback(
    async (selector: MenuState["selector"], sectionId: number): Promise<Selection | null> => {
      setIsSaving(true);
      try {
        const response = await fetch(`${apiBase}/selections`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document_id: documentId,
            section_id: sectionId,
            selector,
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { selection?: Selection };
          if (data.selection) {
            setSelections((prev) => {
              if (prev.some((item) => item.id === data.selection?.id)) {
                return prev;
              }
              return [...prev, data.selection as Selection];
            });
            setActiveSelectionId(data.selection.id);
            setIsCommitted(true);
            setMenuState(null);
            return data.selection as Selection;
          }
        }
      } finally {
        setIsSaving(false);
      }
      return null;
    },
    [documentId]
  );

  const persistSelectionMarkers = useCallback(async (selectionId: number, kinds: MarkerKind[]) => {
    const created: Marker[] = [];
    for (const kind of kinds) {
      const response = await fetch(`${apiBase}/markers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_type: "selection",
          target_id: selectionId,
          kind,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { marker?: Marker };
        if (data.marker) {
          created.push(data.marker as Marker);
        }
      }
    }
    if (created.length) {
      setMarkers(created);
    }
  }, []);

  const getSectionElementById = useCallback((sectionId: number): HTMLElement | null => {
    const container = containerRef.current;
    if (!container) {
      return null;
    }
    return container.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  }, []);

  const getSectionElementForSelection = useCallback(
    (selection: Selection): HTMLElement | null => {
      return getSectionElementById(selection.section_id);
    },
    [getSectionElementById]
  );

  const ensureSelectionForAddition = useCallback(async () => {
    if (activeSelectionId) {
      return activeSelectionId;
    }
    const selector = draftSelection?.selector ?? menuState?.selector;
    const selectionSectionId = draftSelection?.sectionId ?? menuState?.sectionId;
    if (!selector || !selectionSectionId) {
      return null;
    }
    const selection = await persistSelection(selector, selectionSectionId);
    if (selection && pendingMarkerKinds.length) {
      await persistSelectionMarkers(selection.id, pendingMarkerKinds);
      setPendingMarkerKinds([]);
    }
    setDraftSelection(null);
    return selection?.id ?? null;
  }, [
    activeSelectionId,
    draftSelection,
    menuState,
    pendingMarkerKinds,
    persistSelection,
    persistSelectionMarkers,
  ]);

  const finalizeRange = useCallback(
    (range: Range) => {
      clearLongPressAnchor();
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const sectionElement = getSectionElementFromNode(range.startContainer);
      const endSectionElement = getSectionElementFromNode(range.endContainer);
      if (!sectionElement || !endSectionElement || sectionElement !== endSectionElement) {
        clearSelection();
        return;
      }
      const sectionId = Number(sectionElement.dataset.sectionId ?? "");
      if (!sectionId || Number.isNaN(sectionId)) {
        clearSelection();
        return;
      }

      const selectedText = range.toString();
      if (!selectedText.trim()) {
        clearSelection();
        return;
      }

      const offsets = getSelectionOffsets(range, sectionElement);
      if (!offsets) {
        clearSelection();
        return;
      }

      const section = sectionById.get(sectionId);
      const usesParagraphOffsets = Boolean(sectionElement.querySelector("[data-paragraph]"));
      const currentText = usesParagraphOffsets
        ? section?.content_text ?? ""
        : sectionElement.textContent ?? section?.content_text ?? "";
      const quote = buildQuoteSelector(currentText, offsets.start, offsets.end);
      const existing = selections.find(
        (selection) =>
          selection.section_id === sectionId &&
          selection.selector.position.start === offsets.start &&
          selection.selector.position.end === offsets.end
      );

      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      const menuTop =
        readerSettings.ui_action_menu_placement === "below" ? rect.bottom + 12 : rect.top - 48;

      setMenuState({
        top: Math.max(12, menuTop),
        left: Math.max(12, rect.left),
        selectionText: selectedText,
        sectionId,
        selector: {
          position: offsets,
          quote,
        },
      });

      if (existing) {
        setActiveSelectionId(existing.id);
        setIsCommitted(true);
      } else {
        setActiveSelectionId(null);
        setIsCommitted(false);
      }
      setPendingMarkerKinds([]);
      if (isMobile) {
        setMobileNavOpen(true);
        setMobilePanel("selection");
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
      }
    },
    [
      clearLongPressAnchor,
      clearSelection,
      getSectionElementFromNode,
      isMobile,
      readerSettings.ui_action_menu_placement,
      sectionById,
      selections,
    ]
  );

  finalizeRangeRef.current = finalizeRange;

  const startLongPress = useCallback(
    (x: number, y: number, pointerId: number | null) => {
      clearLongPressTimer();
      tapEligibleRef.current = true;
      longPressActiveRef.current = true;
      longPressPointerRef.current = pointerId;
      longPressStartRef.current = { x, y };
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        if (!longPressActiveRef.current) {
          return;
        }
        if (pointerId !== null && longPressPointerRef.current !== pointerId) {
          return;
        }
        tapEligibleRef.current = false;
        const container = containerRef.current;
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
          const range = selection.getRangeAt(0).cloneRange();
          if (!container || container.contains(range.startContainer)) {
            suppressTouchFinalizeRef.current = true;
            finalizeRangeRef.current?.(range);
            return;
          }
        }
        const pointRange = getCaretRangeFromPoint(x, y);
        if (!pointRange) {
          return;
        }
        if (container && !container.contains(pointRange.startContainer)) {
          return;
        }
        const wordRange = getWordRangeFromPointRange(pointRange);
        if (!wordRange) {
          return;
        }
        const selectionRange = wordRange.cloneRange();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(selectionRange.cloneRange());
        }
        suppressTouchFinalizeRef.current = true;
        finalizeRangeRef.current?.(selectionRange);
      }, LONG_PRESS_DELAY_MS);
    },
    [clearLongPressTimer]
  );

  const moveLongPress = useCallback(
    (x: number, y: number, pointerId: number | null) => {
      if (pointerId !== null && longPressPointerRef.current !== pointerId) {
        return;
      }
      const start = longPressStartRef.current;
      if (!start) {
        return;
      }
      const dx = x - start.x;
      const dy = y - start.y;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) {
        clearLongPressTimer();
        longPressActiveRef.current = false;
        tapEligibleRef.current = false;
        if (longPressAnchorRef.current) {
          clearLongPressAnchor();
        }
      }
    },
    [clearLongPressAnchor, clearLongPressTimer]
  );

  const endLongPress = useCallback(
    (pointerId: number | null) => {
      if (
        pointerId !== null &&
        longPressPointerRef.current !== null &&
        longPressPointerRef.current !== pointerId
      ) {
        return;
      }
      longPressActiveRef.current = false;
      longPressPointerRef.current = null;
      longPressStartRef.current = null;
      clearLongPressTimer();
    },
    [clearLongPressTimer]
  );

  const cancelLongPress = useCallback(() => {
    longPressActiveRef.current = false;
    longPressPointerRef.current = null;
    longPressStartRef.current = null;
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleLongPressPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") {
        return;
      }
      startNavSwipe(event.clientX, event.clientY, event.pointerId);
      if (longPressActiveRef.current && longPressPointerRef.current === null) {
        pointerTouchSessionRef.current = true;
        return;
      }
      pointerTouchSessionRef.current = true;
      startLongPress(event.clientX, event.clientY, event.pointerId);
    },
    [startLongPress, startNavSwipe]
  );

  const handleLongPressPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") {
        return;
      }
      moveLongPress(event.clientX, event.clientY, event.pointerId);
    },
    [moveLongPress]
  );

  const handleTouchDoubleTap = useCallback(
    (x: number, y: number) => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const pointRange = getCaretRangeFromPoint(x, y);
      if (!pointRange) {
        return;
      }
      if (!container.contains(pointRange.startContainer)) {
        return;
      }

      const wordRange = getWordRangeFromPointRange(pointRange);
      if (!wordRange) {
        return;
      }

      const wordText = wordRange.toString().trim();
      if (!wordText) {
        return;
      }

      const safeWordRange = wordRange.cloneRange();
      const banner =
        getWordBannerFromRange(wordRange) ?? {
          word: wordText,
          sectionId: null,
          start: null,
          end: null,
        };

      const previousWord = lastSelectableWordRef.current;
      const wasAdded = addWordBanner({ ...banner, range: safeWordRange });
      if (!wasAdded) {
        return;
      }

      const isSameWord =
        previousWord && normalizeWordKey(previousWord.word) === normalizeWordKey(banner.word);
      const isFirstWord = !previousWord;

      if (isSameWord && safeWordRange) {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(safeWordRange.cloneRange());
        }
        finalizeRangeRef.current?.(safeWordRange);
        lastSelectableWordRef.current = null;
        return;
      }

      if (isFirstWord) {
        return;
      }

      if (
        previousWord &&
        previousWord.sectionId !== null &&
        previousWord.start !== null &&
        banner.end !== null &&
        previousWord.sectionId === banner.sectionId
      ) {
        const sectionElement = containerRef.current?.querySelector(
          `[data-section-id="${previousWord.sectionId}"]`
        ) as HTMLElement | null;
        if (sectionElement) {
          const multiWordRange = rangeFromOffsets(sectionElement, previousWord.start, banner.end);
          if (multiWordRange) {
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              selection.addRange(multiWordRange);
            }
            finalizeRangeRef.current?.(multiWordRange);
          }
        }
        lastSelectableWordRef.current = null;
        return;
      }

      if (previousWord && previousWord.sectionId !== banner.sectionId) {
        const selection = window.getSelection();
        if (selection && safeWordRange) {
          selection.removeAllRanges();
          selection.addRange(safeWordRange.cloneRange());
        }
        finalizeRangeRef.current?.(safeWordRange);
        lastSelectableWordRef.current = null;
      }
    },
    [addWordBanner, getWordBannerFromRange, normalizeWordKey]
  );

  const processTapSequence = useCallback(
    (x: number, y: number) => {
      if (doubleTapInProgressRef.current) {
        return true;
      }
      if (!tapEligibleRef.current) {
        return false;
      }
      const now = Date.now();
      const last = lastTapRef.current;
      const deltaMs = last ? now - last.time : null;
      const distance = last ? Math.hypot(x - last.x, y - last.y) : null;
      const withinWindow = last ? now - last.time < TAP_WINDOW_MS : false;
      const nextCount = withinWindow ? tapCountRef.current + 1 : 1;
      tapCountRef.current = nextCount;
      lastTapRef.current = { time: now, x, y };

      if (nextCount === 1) {
        clearTapTimer();
        tapTimerRef.current = window.setTimeout(() => {
          resetTapState();
        }, TAP_WINDOW_MS);
        return true;
      }

      if (nextCount === 2) {
        if (doubleTapInProgressRef.current) {
          resetTapState();
          return true;
        }
        doubleTapInProgressRef.current = true;
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
        clearTapTimer();
        handleTouchDoubleTap(x, y);
        resetTapState();
        window.setTimeout(() => {
          doubleTapInProgressRef.current = false;
        }, 50);
        return true;
      }

      if (nextCount >= 3) {
        resetTapState();
        return true;
      }

      return false;
    },
    [
      clearTapTimer,
      handleTouchDoubleTap,
      resetTapState,
    ]
  );

  const handleLongPressPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") {
        return;
      }
      endLongPress(event.pointerId);
      if (handleNavSwipeEnd(event.clientX, event.clientY, event.pointerId)) {
        lastPointerTouchUpRef.current = Date.now();
        pointerTouchSessionRef.current = false;
        return;
      }
      lastPointerTouchUpRef.current = Date.now();
      if (suppressTouchFinalizeRef.current) {
        suppressTouchFinalizeRef.current = false;
        pointerTouchSessionRef.current = false;
        return;
      }
      const consumed = processTapSequence(event.clientX, event.clientY);
      if (consumed) {
        pointerTouchSessionRef.current = false;
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        clearSelection();
        pointerTouchSessionRef.current = false;
        return;
      }

      if (selection.isCollapsed) {
        clearSelection();
        pointerTouchSessionRef.current = false;
        return;
      }

      anchorRef.current = null;
      finalizeRange(selection.getRangeAt(0));
      pointerTouchSessionRef.current = false;
    },
    [clearSelection, endLongPress, finalizeRange, handleNavSwipeEnd, processTapSequence]
  );

  const handleLongPressPointerCancel = useCallback(() => {
    cancelLongPress();
    navSwipeStartRef.current = null;
    pointerTouchSessionRef.current = false;
  }, [cancelLongPress]);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (pointerTouchSessionRef.current) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      startNavSwipe(touch.clientX, touch.clientY, null);
      startLongPress(touch.clientX, touch.clientY, null);
    },
    [startLongPress, startNavSwipe]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (pointerTouchSessionRef.current) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      moveLongPress(touch.clientX, touch.clientY, null);
    },
    [moveLongPress]
  );

  const handleTouchCancel = useCallback(() => {
    if (pointerTouchSessionRef.current) {
      return;
    }
    cancelLongPress();
    navSwipeStartRef.current = null;
    resetTapState();
  }, [cancelLongPress, resetTapState]);

  const handleTapPoint = useCallback(
    (x: number, y: number, source: string) => {
      const now = Date.now();
      const lastHandled = lastHandledTapRef.current;
      if (
        lastHandled &&
        now - lastHandled.time < 60 &&
        Math.hypot(x - lastHandled.x, y - lastHandled.y) < 8
      ) {
        return;
      }
      lastHandledTapRef.current = { time: now, x, y };
      endLongPress(null);
      if (suppressTouchFinalizeRef.current) {
        suppressTouchFinalizeRef.current = false;
        return;
      }

      if (tapEligibleRef.current) {
        const consumed = processTapSequence(x, y);
        if (consumed) {
          return;
        }
      } else if (source === "doc-touchend") {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
          suppressTouchFinalizeRef.current = true;
          finalizeRange(selection.getRangeAt(0));
          return;
        }
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        clearSelection();
        return;
      }

      if (selection.isCollapsed) {
        clearSelection();
        return;
      }

      anchorRef.current = null;
      finalizeRange(selection.getRangeAt(0));
    },
    [clearSelection, endLongPress, finalizeRange, processTapSequence]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (Date.now() - lastPointerTouchUpRef.current < 400) {
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
          return;
        }
      if (handleNavSwipeEnd(touch.clientX, touch.clientY, null)) {
        lastPointerTouchUpRef.current = Date.now();
        return;
      }
      lastPointerTouchUpRef.current = Date.now();
      handleTapPoint(touch.clientX, touch.clientY, "touchend");
    },
    [handleNavSwipeEnd, handleTapPoint]
  );

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const handleDocTouchStart = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
      const inContainer = elementAtPoint ? container.contains(elementAtPoint) : false;
      docTapInScopeRef.current = inContainer;
      if (!inContainer) {
        return;
      }
      docTapStartRef.current = { time: Date.now(), x: touch.clientX, y: touch.clientY };
      docTapMovedRef.current = false;
    };

    const handleDocTouchMove = (event: TouchEvent) => {
      if (!docTapStartRef.current || !docTapInScopeRef.current) {
        return;
      }
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      const start = docTapStartRef.current;
      const distance = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
      if (distance > LONG_PRESS_MOVE_THRESHOLD) {
        docTapMovedRef.current = true;
      }
    };

    const handleDocTouchEnd = (event: TouchEvent) => {
      if (Date.now() - lastPointerTouchUpRef.current < 400) {
        return;
      }
      if (event.changedTouches.length > 1) {
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      const start = docTapStartRef.current;
      const inScope = docTapInScopeRef.current;
      docTapStartRef.current = null;
      docTapInScopeRef.current = false;
      const moved = docTapMovedRef.current;
      docTapMovedRef.current = false;
      if (!start || !inScope) {
        return;
      }
      const duration = Date.now() - start.time;
      if (moved || duration > 350) {
        return;
      }
      lastPointerTouchUpRef.current = Date.now();
      handleTapPoint(touch.clientX, touch.clientY, "doc-touchend");
    };

    const handleDocTouchCancel = () => {
      docTapStartRef.current = null;
      docTapInScopeRef.current = false;
      docTapMovedRef.current = false;
    };
    const options = { passive: true, capture: true };
    document.addEventListener("touchstart", handleDocTouchStart, options);
    document.addEventListener("touchmove", handleDocTouchMove, options);
    document.addEventListener("touchend", handleDocTouchEnd, options);
    document.addEventListener("touchcancel", handleDocTouchCancel, options);
    return () => {
      document.removeEventListener("touchstart", handleDocTouchStart, options);
      document.removeEventListener("touchmove", handleDocTouchMove, options);
      document.removeEventListener("touchend", handleDocTouchEnd, options);
      document.removeEventListener("touchcancel", handleDocTouchCancel, options);
    };
  }, [handleTapPoint, isMobile]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const handleDocClick = (event: MouseEvent) => {
      if (Date.now() - lastPointerTouchUpRef.current < 400) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      const target = event.target as Node | null;
      const inContainer = path.length
        ? path.includes(container)
        : target
        ? container.contains(target)
        : false;
      if (!inContainer) {
        return;
      }
      handleTapPoint(event.clientX, event.clientY, "doc-click");
    };
    document.addEventListener("click", handleDocClick, true);
    return () => {
      document.removeEventListener("click", handleDocClick, true);
    };
  }, [handleTapPoint, isMobile]);

  const handlePointerUp = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (Date.now() - lastPointerTouchUpRef.current < 400) {
      return;
    }
    if (event.detail > 1) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      clearSelection();
      return;
    }

    if (selection.isCollapsed) {
      clearSelection();
      return;
    }

    anchorRef.current = null;
    finalizeRange(selection.getRangeAt(0));
  }, [clearSelection, finalizeRange]);

  const handleDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (doubleTapInProgressRef.current) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const nativeSelection = window.getSelection();
      if (nativeSelection) {
        nativeSelection.removeAllRanges();
      }
      const pointRange = getCaretRangeFromPoint(event.clientX, event.clientY);
      if (!pointRange) {
        return;
      }
      if (!container.contains(pointRange.startContainer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const wordRange = getWordRangeFromPointRange(pointRange);
      const safeWordRange = wordRange ? wordRange.cloneRange() : null;
      const banner =
        getWordBannerFromRange(pointRange) ?? {
          word: getWordAtPoint(event.clientX, event.clientY) ?? "(no word)",
          sectionId: null,
          start: null,
          end: null,
        };
      addWordBanner({ ...banner, range: safeWordRange });

    },
    [addWordBanner, getWordBannerFromRange]
  );

  const handleSelectHighlight = useCallback((selection: Selection) => {
    setActiveSelectionId(selection.id);
    setIsCommitted(true);
    setSidePanelTab("active");
  }, []);

  const handleCommitSelection = useCallback(async () => {
    if (!menuState || isCommitted) {
      return;
    }
    const signature = `${menuState.selector.position.start}-${menuState.selector.position.end}`;
    const existing = selections.find(
      (selection) =>
        selection.section_id === menuState.sectionId &&
        `${selection.selector.position.start}-${selection.selector.position.end}` === signature
    );
    if (existing) {
      setActiveSelectionId(existing.id);
      setIsCommitted(true);
      setMenuState(null);
      return;
    }
    const selection = await persistSelection(menuState.selector, menuState.sectionId);
    if (selection && pendingMarkerKinds.length) {
      await persistSelectionMarkers(selection.id, pendingMarkerKinds);
      setPendingMarkerKinds([]);
    }
  }, [isCommitted, menuState, persistSelection, selections, pendingMarkerKinds, persistSelectionMarkers]);

  const handleTogglePendingMarker = useCallback((kind: MarkerKind) => {
    setPendingMarkerKinds((prev) =>
      prev.includes(kind) ? prev.filter((item) => item !== kind) : [...prev, kind]
    );
  }, []);

  const handleOpenNote = useCallback(async () => {
    if (isCommitted && activeSelectionId) {
      setEditingNote(null);
      setNoteModalOpen(true);
      return;
    }
    if (!menuState) {
      return;
    }
    setDraftSelection({
      selector: menuState.selector,
      selectionText: menuState.selectionText,
      sectionId: menuState.sectionId,
    });
    setMenuState(null);
    setEditingNote(null);
    setNoteModalOpen(true);
  }, [
    activeSelectionId,
    isCommitted,
    menuState,
    setDraftSelection,
  ]);

  const handleOpenGrammar = useCallback(async () => {
    if (isCommitted && activeSelectionId) {
      setGrammarModalOpen(true);
      return;
    }
    if (!menuState) {
      return;
    }
    setDraftSelection({
      selector: menuState.selector,
      selectionText: menuState.selectionText,
      sectionId: menuState.sectionId,
    });
    setMenuState(null);
    setGrammarModalOpen(true);
  }, [
    activeSelectionId,
    isCommitted,
    menuState,
    setDraftSelection,
  ]);

  const handleOpenAudio = useCallback(async () => {
    if (isCommitted && activeSelectionId) {
      audioSelectionRef.current = activeSelectionId;
      setAudioModalOpen(true);
      return;
    }
    if (!menuState) {
      return;
    }
    setDraftSelection({
      selector: menuState.selector,
      selectionText: menuState.selectionText,
      sectionId: menuState.sectionId,
    });
    setMenuState(null);
    audioSelectionRef.current = null;
    setAudioModalOpen(true);
  }, [
    activeSelectionId,
    isCommitted,
    menuState,
    setDraftSelection,
  ]);

  const handleClearAudioSelection = useCallback(async () => {
    const selectionId = audioSelectionRef.current ?? activeSelectionId;
    if (!selectionId) {
      discardDraftSelection();
      setAudioModalOpen(false);
      setMenuState(null);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/selections/${selectionId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setSelections((prev) => prev.filter((item) => item.id !== selectionId));
        if (activeSelectionId === selectionId) {
          setActiveSelectionId(null);
          setAdditions([]);
          setMarkers([]);
          setAdditionMarkers({});
        }
      }
    } catch (error) {
      console.error(error);
    }

    audioSelectionRef.current = null;
    setAudioModalOpen(false);
    clearSelection();
  }, [activeSelectionId, clearSelection, discardDraftSelection]);

  const handleSaveNote = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        discardDraftSelection();
        setNoteModalOpen(false);
        return;
      }
      const selectionId = await ensureSelectionForAddition();
      if (!selectionId) {
        setNoteModalOpen(false);
        setEditingNote(null);
        return;
      }

      if (editingNote) {
        const response = await fetch(`${apiBase}/additions/${editingNote.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text_content: text,
            payload: { text },
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { addition?: Addition };
          if (data.addition) {
            setAdditions((prev) =>
              prev.map((item) => (item.id === data.addition?.id ? data.addition : item))
            );
            setMenuState(null);
          }
        }
      } else {
        const response = await fetch(`${apiBase}/additions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            selection_id: selectionId,
            type: "note",
            text_content: text,
            payload: { text },
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { addition?: Addition };
          if (data.addition) {
            setAdditions((prev) => [...prev, data.addition as Addition]);
            setMenuState(null);
          }
        }
      }

      setNoteModalOpen(false);
      setEditingNote(null);
    },
    [activeSelectionId, editingNote, ensureSelectionForAddition, discardDraftSelection]
  );

  const handleSaveGrammar = useCallback(
    async (payload: GrammarPayload) => {
      const selectionId = await ensureSelectionForAddition();
      if (!selectionId) {
        setGrammarModalOpen(false);
        return;
      }

      const textContent =
        payload.kind === "word" || payload.kind === "bars" ? payload.text ?? null : null;

      const response = await fetch(`${apiBase}/additions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selection_id: selectionId,
          type: "grammar",
          text_content: textContent,
          payload,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { addition?: Addition };
        if (data.addition) {
          setAdditions((prev) => [...prev, data.addition as Addition]);
          setMenuState(null);
          if (payload.kind === "lookup" && payload.lookup_url) {
            window.open(payload.lookup_url, "_blank", "noopener,noreferrer");
          }
        }
      }

      setGrammarModalOpen(false);
    },
    [ensureSelectionForAddition]
  );

  const handleSaveAudio = useCallback(
    async (payload: AudioPayload) => {
      const selectionId = await ensureSelectionForAddition();
      if (!selectionId) {
        setAudioModalOpen(false);
        return;
      }

      const response = await fetch(`${apiBase}/additions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selection_id: selectionId,
          type: "audio",
          payload: { audio: payload },
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { addition?: Addition };
        if (data.addition) {
          setAdditions((prev) => {
            if (prev.some((item) => item.id === data.addition?.id)) {
              return prev;
            }
            return [...prev, data.addition as Addition];
          });
          await refreshAdditions(selectionId);
          setMenuState(null);
        }
      }

      setAudioModalOpen(false);
    },
    [ensureSelectionForAddition, refreshAdditions]
  );

  const handleEditNote = useCallback((note: Addition) => {
    setEditingNote(note);
    setNoteModalOpen(true);
  }, []);

  const handleToggleMarker = useCallback(
    async (kind: MarkerKind) => {
      if (!activeSelectionId) {
        return;
      }
      const existing = markers.find((marker) => marker.kind === kind);
      if (existing) {
        const response = await fetch(`${apiBase}/markers/${existing.id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setMarkers((prev) => prev.filter((item) => item.id !== existing.id));
        }
        return;
      }
      const response = await fetch(`${apiBase}/markers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_type: "selection",
          target_id: activeSelectionId,
          kind,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { marker?: Marker };
        if (data.marker) {
          setMarkers((prev) => [...prev, data.marker as Marker]);
        }
      }
    },
    [activeSelectionId, markers]
  );

  const handleToggleAdditionMarker = useCallback(
    async (additionId: number, kind: MarkerKind) => {
      const existing = (additionMarkers[additionId] ?? []).find((marker) => marker.kind === kind);
      if (existing) {
        const response = await fetch(`${apiBase}/markers/${existing.id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          setAdditionMarkers((prev) => ({
            ...prev,
            [additionId]: prev[additionId].filter((item) => item.id !== existing.id),
          }));
        }
        return;
      }
      const response = await fetch(`${apiBase}/markers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_type: "addition",
          target_id: additionId,
          kind,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { marker?: Marker };
        if (data.marker) {
          setAdditionMarkers((prev) => ({
            ...prev,
            [additionId]: [...(prev[additionId] ?? []), data.marker as Marker],
          }));
        }
      }
    },
    [additionMarkers]
  );

  const handleDeleteSelection = useCallback(async () => {
    if (!activeSelectionId) {
      return;
    }
    const selectionId = activeSelectionId;
    try {
      const response = await fetch(`${apiBase}/selections/${selectionId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        return;
      }
      setSelections((prev) => prev.filter((item) => item.id !== selectionId));
      setActiveSelectionId(null);
      setAdditions([]);
      setMarkers([]);
      setAdditionMarkers({});
      setMenuState(null);
      setIsCommitted(false);
      setPendingMarkerKinds([]);
      setDraftSelection(null);
      setNoteModalOpen(false);
      setGrammarModalOpen(false);
      setAudioModalOpen(false);
      setEditingNote(null);
      audioSelectionRef.current = null;
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    } catch (error) {
      console.error(error);
    }
  }, [activeSelectionId]);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
    setMobilePanel(null);
    setMobileNavMode("main");
  }, []);

  const handleBodyPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isMobile || !mobileNavOpen) {
        return;
      }
      const target = event.target as Node;
      if (
        mobileNavRef.current?.contains(target) ||
        mobilePanelRef.current?.contains(target) ||
        mobilePageNavRef.current?.contains(target)
      ) {
        return;
      }
      closeMobileNav();
    },
    [closeMobileNav, isMobile, mobileNavOpen]
  );

  const handleBodyClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isMobile) {
        return;
      }
      if (!mobileNavOpen) {
        return;
      }
      if (doubleTapInProgressRef.current) {
        return;
      }
      const target = event.target as Node;
      if (
        mobileNavRef.current?.contains(target) ||
        mobilePanelRef.current?.contains(target) ||
        mobilePageNavRef.current?.contains(target)
      ) {
        return;
      }
      closeMobileNav();
    },
    [closeMobileNav, isMobile, mobileNavOpen]
  );

  const scrollToOffsets = useCallback(
    (sectionId: number, start: number, end: number) => {
      const sectionElement = getSectionElementById(sectionId);
      if (!sectionElement) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const range = rangeFromOffsets(sectionElement, start, end);
      const rect = range ? range.getBoundingClientRect() : sectionElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const offsetTop = rect.top - containerRect.top + container.scrollTop;
      const scrollTarget = Math.max(0, offsetTop - 120);
      const isScrollable = container.scrollHeight > container.clientHeight + 1;
      if (isScrollable) {
        container.scrollTo({ top: scrollTarget });
      } else {
        window.scrollTo({ top: Math.max(0, rect.top + window.scrollY - 120) });
      }
    },
    [getSectionElementById]
  );

  const handleJumpToSelection = useCallback(
    (selection: Selection) => {
      setActiveSelectionId(selection.id);
      setIsCommitted(true);
      setMenuState(null);
      setPendingMarkerKinds([]);
      setDraftSelection(null);
      setNoteModalOpen(false);
      setGrammarModalOpen(false);
      setAudioModalOpen(false);
      setEditingNote(null);
      audioSelectionRef.current = null;
      if (isMobile) {
        setMobilePanel(null);
        setMobileNavOpen(false);
      }

      scrollToOffsets(
        selection.section_id,
        selection.selector.position.start,
        selection.selector.position.end
      );
    },
    [isMobile, scrollToOffsets]
  );

  const handleSearchSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const query = searchQuery.trim();
      setSearchPerformed(true);
      if (!query) {
        setSearchResults([]);
        setSearchResultsQuery("");
        return;
      }
      const lowerQuery = query.toLowerCase();
      const results: SearchResult[] = [];
      sections.forEach((section) => {
        const text = section.content_text ?? "";
        if (!text) {
          return;
        }
        const lowerText = text.toLowerCase();
        let index = 0;
        while (index < lowerText.length) {
          const found = lowerText.indexOf(lowerQuery, index);
          if (found === -1) {
            break;
          }
          const start = found;
          const end = found + lowerQuery.length;
          results.push({
            id: `${section.id}-${start}`,
            sectionId: section.id,
            start,
            end,
            snippet: buildSearchSnippet(text, start, end),
          });
          index = end;
        }
      });
      setSearchResults(results);
      setSearchResultsQuery(query);
    },
    [searchQuery, sections]
  );

  const handleSearchResultClick = useCallback(
    (result: SearchResult) => {
      scrollToOffsets(result.sectionId, result.start, result.end);
    },
    [scrollToOffsets]
  );

  const handlePageJump = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const target = Number.parseInt(pageInput, 10);
      if (Number.isNaN(target)) {
        return;
      }
      const page = Math.min(pageCount, Math.max(1, target));
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const pageSize = container.clientHeight;
      if (!pageSize) {
        return;
      }
      container.scrollTo({ top: (page - 1) * pageSize });
      setPageInput(String(page));
    },
    [pageCount, pageInput]
  );

  const selectionMarkerKinds = markers.map((marker) => marker.kind as MarkerKind);
  const modalMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const modalToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;
  const actionMenuMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const actionMenuToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;
  const overlaySelections = useMemo(() => {
    if (!isMobile || !menuState || isCommitted) {
      return selections;
    }
    const draftSelection: Selection = {
      id: -1,
      document_id: documentId,
      section_id: menuState.sectionId,
      selector: menuState.selector,
      created_at: "",
    };
    return [...selections, draftSelection];
  }, [documentId, isCommitted, isMobile, menuState, selections]);
  const overlayActiveSelectionId =
    isMobile && menuState && !isCommitted ? -1 : activeSelectionId;
  const handleOverlaySelect = useCallback(
    (selection: Selection) => {
      if (selection.id <= 0) {
        return;
      }
      handleSelectHighlight(selection);
    },
    [handleSelectHighlight]
  );

  return (
    <div
      className={`reader-layout reader-layout--columns reader-theme--${readerSettings.theme}`}
      data-highlight-style={readerSettings.ui_highlight_style}
      style={readerStyle}
    >
      <aside className="reader-sidebar">
        <div className="reader-sidebar__header">
          <div className="reader-kicker">{sourceType}</div>
          <h1 className="reader-title">{documentTitle}</h1>
        </div>
        <ReaderSectionPicker
          documentId={documentId}
          sections={sections}
          activeKey={initialSectionKey ?? null}
        />
        <div className="reader-sidebar__links">
          <button
            type="button"
            className="reader-sidebar__link"
            onClick={() => router.push("/new")}
          >
            Add new book
          </button>
          <button
            type="button"
            className="reader-sidebar__link"
            onClick={() => router.push("/settings")}
          >
            Settings
          </button>
        </div>
      </aside>
      <div className="reader-body" onClick={handleBodyClick} onPointerDown={handleBodyPointerDown}>
        <div className="reader-shell">
          <div
            className="reader-scroll"
            ref={containerRef}
            style={readerScrollStyle}
            onMouseUp={handlePointerUp}
            onPointerDown={handleLongPressPointerDown}
            onPointerMove={handleLongPressPointerMove}
            onPointerUp={handleLongPressPointerUp}
            onPointerCancel={handleLongPressPointerCancel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            onDoubleClick={handleDoubleClick}
          >
            {sections.map((section) => (
              <section
                key={section.id}
                className="reader-section"
                data-section-id={section.id}
                data-section-key={section.section_key}
                style={readerSectionStyle}
              >
                {!section.content_html && section.title ? (
                  <h2 className="reader-section__title">{section.title}</h2>
                ) : null}
                <ReaderDocument
                  contentText={section.content_text}
                  contentHtml={section.content_html}
                  mediaBase={apiBase}
                  articleStyle={readerArticleStyle}
                  paragraphStyle={readerParagraphStyle}
                />
              </section>
            ))}
            <SelectionOverlay
              selections={overlaySelections}
              containerRef={containerRef}
              activeSelectionId={overlayActiveSelectionId}
              onSelect={handleOverlaySelect}
              getSectionElement={getSectionElementForSelection}
              refreshKey={highlightRefreshKey}
            />
          </div>
          {!isMobile && menuState && !noteModalOpen && !grammarModalOpen && !audioModalOpen ? (
            <ActionMenu
              top={menuState.top}
              left={menuState.left}
              selectionText={menuState.selectionText}
              isSaving={isSaving}
              isCommitted={isCommitted}
              markerKinds={actionMenuMarkerKinds}
              showMarkers
              onToggleMarker={actionMenuToggle}
              onCommit={handleCommitSelection}
              onNote={handleOpenNote}
              onAudio={handleOpenAudio}
              onGrammar={handleOpenGrammar}
              onClose={clearSelection}
            />
          ) : null}
          {isMobile && mobilePanel ? (
            <div
              className={`mobile-panel${
                mobilePanel === "settings"
                  ? " mobile-panel--settings"
                  : mobilePanel === "new"
                    ? " mobile-panel--new"
                    : mobilePanel === "selection"
                      ? " mobile-panel--selection"
                      : ""
              }`}
              ref={mobilePanelRef}
              style={mobilePanelStyle}
              onClick={(event) => event.stopPropagation()}
            >
              {mobilePanel === "chapters" ? (
                <div className="mobile-panel__content">
                  <div className="mobile-panel__title">Chapters</div>
                  <ReaderSectionPicker
                    documentId={documentId}
                    sections={sections}
                    activeKey={initialSectionKey ?? null}
                  />
                </div>
              ) : null}
              {mobilePanel === "highlights" ? (
                <ReaderHighlightsPanel
                  documentId={documentId}
                  refreshKey={selections.length + additions.length + markers.length}
                  isActive
                  onJumpToSelection={handleJumpToSelection}
                />
              ) : null}
              {mobilePanel === "selection" && menuState && !noteModalOpen && !grammarModalOpen && !audioModalOpen ? (
                <ActionMenu
                  top={0}
                  left={0}
                  variant="mobile"
                  selectionText={menuState.selectionText}
                  isSaving={isSaving}
                  isCommitted={isCommitted}
                  markerKinds={actionMenuMarkerKinds}
                  showMarkers
                  onToggleMarker={actionMenuToggle}
                  onCommit={handleCommitSelection}
                  onNote={handleOpenNote}
                  onAudio={handleOpenAudio}
                  onGrammar={handleOpenGrammar}
                  onClose={() => {
                    setMobilePanel(null);
                    setMobileNavOpen(false);
                    clearSelection();
                  }}
                />
              ) : null}
              {mobilePanel === "new" ? (
                <div className="mobile-panel__content">
                  <div className="mobile-panel__title">New book</div>
                  <DocumentIngestForm />
                </div>
              ) : null}
              {mobilePanel === "search" ? (
                <div className="mobile-panel__content mobile-search">
                  <div className="mobile-panel__title">Search</div>
                  <form className="mobile-search__form" onSubmit={handleSearchSubmit}>
                    <input
                      className="mobile-search__input"
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search this book"
                    />
                    <button type="submit" className="mobile-search__submit">
                      Search
                    </button>
                  </form>
                  <div className="mobile-search__meta">
                    {searchPerformed
                      ? `${searchResults.length} ${
                          searchResults.length === 1 ? "result" : "results"
                        }${searchResultsQuery ? ` for "${searchResultsQuery}"` : ""}`
                      : "Submit to search."}
                  </div>
                  <div className="mobile-search__results">
                    {searchPerformed && searchResults.length === 0 ? (
                      <div className="mobile-search__empty">No matches found.</div>
                    ) : null}
                    {searchResults.map((result) => {
                      const section = sectionById.get(result.sectionId);
                      const label = section?.title ?? section?.section_key ?? "Section";
                      return (
                        <button
                          key={result.id}
                          type="button"
                          className="mobile-search__result"
                          onClick={() => handleSearchResultClick(result)}
                        >
                          <div className="mobile-search__result-title">{label}</div>
                          <div className="mobile-search__result-snippet">{result.snippet}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {mobilePanel === "settings" ? (
                <div className="mobile-panel__content">
                  <div className="mobile-panel__title">Settings</div>
                  <ReaderSettingsPanel
                    settings={readerSettings}
                    onChange={queueSettingsUpdate}
                    status={settingsStatus}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {isMobile && mobileNavOpen && mobilePanel !== "selection" ? (
            mobileNavMode === "pages" ? (
              <div
                className="mobile-page-nav"
                ref={mobilePageNavRef}
                style={mobileNavStyle}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="mobile-page-nav__info">
                  <div className="mobile-page-nav__label">Page</div>
                  <div className="mobile-page-nav__value">
                    {currentPage} / {pageCount}
                  </div>
                </div>
                <form className="mobile-page-nav__form" onSubmit={handlePageJump}>
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    inputMode="numeric"
                    className="mobile-page-nav__input"
                    value={pageInput}
                    onChange={(event) => setPageInput(event.target.value)}
                  />
                  <button type="submit" className="mobile-page-nav__submit">
                    Go
                  </button>
                </form>
              </div>
            ) : (
              <div
                className="mobile-nav"
                ref={mobileNavRef}
                style={mobileNavStyle}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() =>
                    setMobilePanel((prev) => (prev === "chapters" ? null : "chapters"))
                  }
                  aria-label="Chapters"
                  className={mobilePanel === "chapters" ? "is-active" : undefined}
                  style={navButtonStyle(mobilePanel === "chapters")}
                >
                  <IconChapters />
                  <span>Chapters</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMobilePanel((prev) => (prev === "search" ? null : "search"))
                  }
                  aria-label="Search"
                  className={mobilePanel === "search" ? "is-active" : undefined}
                  style={navButtonStyle(mobilePanel === "search")}
                >
                  <IconSearch />
                  <span>Search</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanel((prev) => (prev === "new" ? null : "new"))}
                  aria-label="New"
                  className={mobilePanel === "new" ? "is-active" : undefined}
                  style={navButtonStyle(mobilePanel === "new")}
                >
                  <IconNew />
                  <span>New</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMobilePanel((prev) => (prev === "settings" ? null : "settings"))
                  }
                  aria-label="Settings"
                  className={mobilePanel === "settings" ? "is-active" : undefined}
                  style={navButtonStyle(mobilePanel === "settings")}
                >
                  <IconSettings />
                  <span>Settings</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMobilePanel((prev) => (prev === "highlights" ? null : "highlights"))
                  }
                  aria-label="Highlights"
                  className={mobilePanel === "highlights" ? "is-active" : undefined}
                  style={navButtonStyle(mobilePanel === "highlights")}
                >
                  <IconHighlights />
                  <span>Highlights</span>
                </button>
              </div>
            )
          ) : null}
        </div>
      </div>
      {!isMobile && readerSettings.ui_show_side_panel ? (
        <aside className="reader-highlights">
          <SidePanel
            selection={activeSelection}
            additions={additions}
            markers={markers}
            additionMarkers={additionMarkers}
            mediaBase={apiBase}
            documentId={documentId}
            highlightsRefreshKey={selections.length + additions.length + markers.length}
            initialTab="highlights"
            activeTab={sidePanelTab}
            onTabChange={setSidePanelTab}
            onEditNote={handleEditNote}
            onToggleMarker={handleToggleMarker}
            onToggleAdditionMarker={handleToggleAdditionMarker}
            onDeleteSelection={handleDeleteSelection}
            onJumpToSelection={handleJumpToSelection}
          />
        </aside>
      ) : null}
      <NoteModal
        isOpen={noteModalOpen}
        initialText={editingNote?.text_content ?? ""}
        title={editingNote ? "Edit note" : "New note"}
        markerKinds={modalMarkerKinds}
        onToggleMarker={modalToggle}
        onSave={handleSaveNote}
        onClose={() => {
          if (!editingNote && !isCommitted) {
            discardDraftSelection();
          }
          setNoteModalOpen(false);
          setEditingNote(null);
        }}
      />
      <GrammarModal
        isOpen={grammarModalOpen}
        selectionText={grammarSelectionText}
        markerKinds={modalMarkerKinds}
        onToggleMarker={modalToggle}
        onSave={handleSaveGrammar}
        onClose={() => {
          if (!isCommitted) {
            discardDraftSelection();
          }
          setGrammarModalOpen(false);
        }}
      />
      <AudioRecorderModal
        isOpen={audioModalOpen}
        apiBase={apiBase}
        markerKinds={modalMarkerKinds}
        onToggleMarker={modalToggle}
        onSave={handleSaveAudio}
        onClearSelection={handleClearAudioSelection}
        onClose={() => {
          if (!isCommitted) {
            discardDraftSelection();
          }
          setAudioModalOpen(false);
        }}
      />
    </div>
  );
}
