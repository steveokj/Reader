"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";

import ActionMenu from "@/components/ActionMenu";
import ReaderDocument from "@/components/ReaderDocument";
import ReaderHighlightsPanel from "@/components/ReaderHighlightsPanel";
import ReaderSectionPicker from "@/components/ReaderSectionPicker";
import SelectionOverlay from "@/components/SelectionOverlay";
import SidePanel from "@/components/SidePanel";
import AudioRecorderModal from "@/components/modals/AudioRecorderModal";
import GrammarModal from "@/components/modals/GrammarModal";
import NoteModal from "@/components/modals/NoteModal";
import { getClientApiBase } from "@/lib/apiBase";
import { buildQuoteSelector } from "@/lib/selection/buildQuoteSelector";
import { getSelectionOffsets } from "@/lib/selection/getSelectionOffsets";
import { rangeFromOffsets } from "@/lib/selection/rangeFromOffsets";

const LONG_PRESS_DELAY = 500;
const LONG_PRESS_MOVE_THRESHOLD = 12;
const LONG_PRESS_MULTIWORD_LENGTH = 12;
const TAP_WINDOW_MS = 450;

function normalizeBannerText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isWordChar(value: string) {
  return /[A-Za-z0-9']/u.test(value);
}

type CaretPoint = { node: Node; offset: number };

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
  const pendingDoubleTapRef = useRef<{ x: number; y: number } | null>(null);
  const lastHandledTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const docTapStartRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const docTapMovedRef = useRef(false);
  const docTapInScopeRef = useRef(false);

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
  const [mobilePanel, setMobilePanel] = useState<"chapters" | "highlights" | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<"active" | "highlights">("highlights");
  const [debugTapInfo, setDebugTapInfo] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [firstTapWord, setFirstTapWordState] = useState("");
  const [secondTapWord, setSecondTapWordState] = useState("");
  const firstTapWordRef = useRef("");
  const secondTapWordRef = useRef("");
  const doubleClickStepRef = useRef<0 | 1>(0);
  const doubleClickResetTimerRef = useRef<number | null>(null);

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
    pendingDoubleTapRef.current = null;
    clearTapTimer();
  }, [clearTapTimer]);

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

  const setFirstTapWord = useCallback((word: string) => {
    firstTapWordRef.current = word;
    setFirstTapWordState(word);
  }, []);

  const setSecondTapWord = useCallback((word: string) => {
    secondTapWordRef.current = word;
    setSecondTapWordState(word);
  }, []);

  const clearDoubleClickTimer = useCallback(() => {
    if (doubleClickResetTimerRef.current !== null) {
      window.clearTimeout(doubleClickResetTimerRef.current);
      doubleClickResetTimerRef.current = null;
    }
  }, []);

  const resetDoubleClickSequence = useCallback(() => {
    doubleClickStepRef.current = 0;
    clearDoubleClickTimer();
  }, [clearDoubleClickTimer]);

  const registerDoubleClickWord = useCallback(
    (word: string) => {
      if (doubleClickStepRef.current === 0) {
        setFirstTapWord(word);
        setSecondTapWordState("");
        secondTapWordRef.current = "";
        doubleClickStepRef.current = 1;
        clearDoubleClickTimer();
        doubleClickResetTimerRef.current = window.setTimeout(() => {
          resetDoubleClickSequence();
        }, 2000);
      } else {
        setSecondTapWord(word);
        resetDoubleClickSequence();
      }
    },
    [clearDoubleClickTimer, resetDoubleClickSequence, setFirstTapWord, setSecondTapWord]
  );

  const clearTapWords = useCallback(() => {
    firstTapWordRef.current = "";
    secondTapWordRef.current = "";
    setFirstTapWordState("");
    setSecondTapWordState("");
    resetDoubleClickSequence();
  }, [resetDoubleClickSequence]);

  const getWordFromRangeInSection = useCallback(
    (range: Range): string | null => {
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
      return getWordAtOffset(currentText, offsets.start);
    },
    [getSectionElementFromNode, sectionById]
  );

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
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileNavOpen(false);
      setMobilePanel(null);
    }
  }, [isMobile]);

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

  const clearSelection = useCallback(() => {
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
    clearTapWords();
  }, [clearLongPressTimer, resetTapState, clearTapWords]);

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

  const getSectionElementForSelection = useCallback(
    (selection: Selection): HTMLElement | null => {
      const container = containerRef.current;
      if (!container) {
        return null;
      }
      return container.querySelector<HTMLElement>(`[data-section-id="${selection.section_id}"]`);
    },
    []
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

      setMenuState({
        top: Math.max(12, rect.top - 48),
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
    },
    [clearLongPressAnchor, clearSelection, getSectionElementFromNode, sectionById, selections]
  );

  const startLongPress = useCallback(
    (x: number, y: number, pointerId: number | null) => {
      clearLongPressTimer();
      tapEligibleRef.current = true;
      longPressActiveRef.current = true;
      longPressPointerRef.current = pointerId;
      longPressStartRef.current = { x, y };
      const pressX = x;
      const pressY = y;

      longPressTimerRef.current = window.setTimeout(() => {
        if (!longPressActiveRef.current) {
          return;
        }
        const selection = window.getSelection();
        const selectionText = selection?.toString() ?? "";
        const normalized = selectionText.replace(/\s+/g, " ").trim();
        if (normalized.length > LONG_PRESS_MULTIWORD_LENGTH || normalized.includes(" ")) {
          tapEligibleRef.current = false;
          return;
        }

        const range = getCaretRangeFromPoint(pressX, pressY);
        if (!range) {
          return;
        }
        const sectionElement = getSectionElementFromNode(range.startContainer);
        if (!sectionElement) {
          return;
        }

        if (longPressAnchorRef.current) {
          const combined = buildRange(longPressAnchorRef.current, range);
          clearLongPressAnchor();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(combined);
          }
          suppressTouchFinalizeRef.current = true;
          finalizeRange(combined);
        } else {
          if (selection) {
            selection.removeAllRanges();
          }
          suppressTouchFinalizeRef.current = true;
          tapEligibleRef.current = false;
          longPressAnchorRef.current = range;
        }
      }, LONG_PRESS_DELAY);
    },
    [clearLongPressAnchor, clearLongPressTimer, finalizeRange, getSectionElementFromNode]
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
      if (longPressActiveRef.current && longPressPointerRef.current === null) {
        pointerTouchSessionRef.current = true;
        return;
      }
      pointerTouchSessionRef.current = true;
      startLongPress(event.clientX, event.clientY, event.pointerId);
    },
    [startLongPress]
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
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
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

      const word =
        getWordFromRangeInSection(pointRange) ?? getWordAtPoint(x, y) ?? "(no word)";
      registerDoubleClickWord(word);
    },
    [getWordFromRangeInSection, registerDoubleClickWord]
  );

  const processTapSequence = useCallback(
    (x: number, y: number) => {
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

      setDebugTapInfo(
        `tap ${new Date().toLocaleTimeString()} (${Math.round(x)},${Math.round(
          y
        )}) count=${nextCount} dt=${deltaMs ?? "-"}ms dist=${distance ? Math.round(distance) : "-"}`
      );

      if (nextCount === 1) {
        clearTapTimer();
        tapTimerRef.current = window.setTimeout(() => {
          resetTapState();
        }, TAP_WINDOW_MS);
        return true;
      }

      if (nextCount === 2) {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
        clearTapTimer();
        pendingDoubleTapRef.current = { x, y };
        tapTimerRef.current = window.setTimeout(() => {
          const pending = pendingDoubleTapRef.current;
          resetTapState();
          if (pending) {
            handleTouchDoubleTap(pending.x, pending.y);
          }
        }, 260);
        return true;
      }

      if (nextCount >= 3) {
        const selection = window.getSelection();
        if (!menuState && (!selection || selection.isCollapsed)) {
          setMobileNavOpen(true);
        }
        resetTapState();
        return true;
      }

      return false;
    },
    [clearTapTimer, handleTouchDoubleTap, menuState, resetTapState]
  );

  const handleLongPressPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "touch") {
        return;
      }
      endLongPress(event.pointerId);
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
    [clearSelection, endLongPress, finalizeRange, processTapSequence]
  );

  const handleLongPressPointerCancel = useCallback(() => {
    cancelLongPress();
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
      startLongPress(touch.clientX, touch.clientY, null);
    },
    [startLongPress]
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
      setDebugTapInfo(
        `${source} ${new Date().toLocaleTimeString()} (${Math.round(x)},${Math.round(y)})`
      );
      if (suppressTouchFinalizeRef.current) {
        suppressTouchFinalizeRef.current = false;
        return;
      }

      if (tapEligibleRef.current) {
        const consumed = processTapSequence(x, y);
        if (consumed) {
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
        setDebugTapInfo(`touchend ${new Date().toLocaleTimeString()} no-touch`);
        return;
      }
      lastPointerTouchUpRef.current = Date.now();
      handleTapPoint(touch.clientX, touch.clientY, "touchend");
    },
    [handleTapPoint]
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
      setDebugTapInfo(
        `doc-touchstart ${new Date().toLocaleTimeString()} (${Math.round(touch.clientX)},${Math.round(
          touch.clientY
        )})`
      );
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

  const handlePointerUp = useCallback(() => {
    if (Date.now() - lastPointerTouchUpRef.current < 400) {
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

      const word =
        getWordFromRangeInSection(pointRange) ??
        getWordAtPoint(event.clientX, event.clientY) ??
        "(no word)";
      registerDoubleClickWord(word);

      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    },
    [getWordFromRangeInSection, registerDoubleClickWord]
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

  const handleBodyClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isMobile) {
        return;
      }
      if (!mobileNavOpen) {
        return;
      }
      const target = event.target as Node;
      if (mobileNavRef.current?.contains(target) || mobilePanelRef.current?.contains(target)) {
        return;
      }
      setMobileNavOpen(false);
      setMobilePanel(null);
    },
    [isMobile, mobileNavOpen]
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

      const sectionElement = getSectionElementForSelection(selection);
      if (!sectionElement) {
        return;
      }
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const range = rangeFromOffsets(
        sectionElement,
        selection.selector.position.start,
        selection.selector.position.end
      );
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
    [getSectionElementForSelection, isMobile]
  );

  const selectionMarkerKinds = markers.map((marker) => marker.kind as MarkerKind);
  const modalMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const modalToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;
  const actionMenuMarkerKinds = isCommitted ? selectionMarkerKinds : pendingMarkerKinds;
  const actionMenuToggle = isCommitted ? handleToggleMarker : handleTogglePendingMarker;

  const debugBanner =
    isMounted
      ? createPortal(
          <div className="mobile-debug-banner">
            <span>tap debug: {debugTapInfo || "waiting"}</span>
          </div>,
          document.body
        )
      : null;

  const firstWordBanner =
    isMounted && firstTapWord
      ? createPortal(
          <div className="double-tap-banner double-tap-banner--first">
            <span>1st: {firstTapWord}</span>
          </div>,
          document.body
        )
      : null;

  const secondWordBanner =
    isMounted && secondTapWord
      ? createPortal(
          <div className="double-tap-banner double-tap-banner--second">
            <span>2nd: {secondTapWord}</span>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="reader-layout reader-layout--columns">
      {debugBanner}
      {firstWordBanner}
      {secondWordBanner}
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
      <div className="reader-body" onClick={handleBodyClick}>
        <div className="reader-shell">
          <div
            className="reader-scroll"
            ref={containerRef}
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
              >
                {!section.content_html && section.title ? (
                  <h2 className="reader-section__title">{section.title}</h2>
                ) : null}
                <ReaderDocument
                  contentText={section.content_text}
                  contentHtml={section.content_html}
                  mediaBase={apiBase}
                />
              </section>
            ))}
            <SelectionOverlay
              selections={selections}
              containerRef={containerRef}
              activeSelectionId={activeSelectionId}
              onSelect={handleSelectHighlight}
              getSectionElement={getSectionElementForSelection}
            />
          </div>
          {menuState && !noteModalOpen && !grammarModalOpen && !audioModalOpen ? (
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
              className="mobile-panel"
              ref={mobilePanelRef}
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
              ) : (
                <ReaderHighlightsPanel
                  documentId={documentId}
                  refreshKey={selections.length + additions.length + markers.length}
                  isActive
                  onJumpToSelection={handleJumpToSelection}
                />
              )}
            </div>
          ) : null}
          {isMobile && mobileNavOpen ? (
            <div
              className="mobile-nav"
              ref={mobileNavRef}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={() =>
                  setMobilePanel((prev) => (prev === "chapters" ? null : "chapters"))
                }
                aria-label="Chapters"
                className={mobilePanel === "chapters" ? "is-active" : undefined}
              >
                <IconChapters />
                <span>Chapters</span>
              </button>
              <button type="button" onClick={() => router.push("/new")} aria-label="New">
                <IconNew />
                <span>New</span>
              </button>
              <button
                type="button"
                onClick={() => router.push("/settings")}
                aria-label="Settings"
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
              >
                <IconHighlights />
                <span>Highlights</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {!isMobile ? (
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
