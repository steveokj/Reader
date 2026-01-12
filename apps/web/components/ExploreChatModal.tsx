"use client";

import type { FormEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import ArtifactActionMenu from "@/components/ArtifactActionMenu";
import { getClientApiBase } from "@/lib/apiBase";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  additionId?: number | null;
  selectionId?: number | null;
};

type ExploreChatModalProps = {
  open: boolean;
  bookTitle?: string | null;
  documentId?: number | null;
  selectionText?: string | null;
  selectionAnchor?: {
    selectionId?: number | null;
    sectionId?: number | null;
    selector?: {
      position: { start: number; end: number };
      quote: { exact: string; prefix: string; suffix: string };
    };
  } | null;
  onRequestAnchor?: () => {
    sectionId: number;
    selector: {
      position: { start: number; end: number };
      quote: { exact: string; prefix: string; suffix: string };
    };
  } | null;
  onOpenArtifactNote?: (source: {
    additionId: number;
    selectionId: number;
    kind: string;
    previewText?: string;
  }) => void;
  onOpenArtifactAudio?: (source: {
    additionId: number;
    selectionId: number;
    kind: string;
    previewText?: string;
  }) => void;
  onOpenArtifactExplore?: (source: {
    additionId: number;
    selectionId: number;
    kind: string;
    previewText?: string;
  }) => void;
  onClose: () => void;
};

type MessagePart =
  | { type: "text"; value: string }
  | { type: "image"; url: string; alt: string };

type AdditionMarker = {
  id: number;
  kind: "like" | "highlight" | "todo";
};

type ArtifactMenuState = {
  top: number;
  left: number;
  label: string;
  contextText: string;
  additionId: number;
  selectionId: number;
  kind: string;
};

const CONTEXT_PREVIEW_LIMIT = 140;
const FALLBACK_BOOK_TITLE = "the current book";
const IMAGE_URL_REGEX =
  /https?:\/\/[^\s)]+?\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)]+)?/gi;
const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gi;

function truncateContext(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= CONTEXT_PREVIEW_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, CONTEXT_PREVIEW_LIMIT).trimEnd()}...`;
}

function splitMarkdownImages(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(MARKDOWN_IMAGE_REGEX)) {
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

function splitImageUrls(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(IMAGE_URL_REGEX)) {
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

function parseMessageParts(text: string): MessagePart[] {
  const withMarkdown = splitMarkdownImages(text);
  const merged: MessagePart[] = [];
  for (const part of withMarkdown) {
    if (part.type === "text") {
      merged.push(...splitImageUrls(part.value));
    } else {
      merged.push(part);
    }
  }
  return merged;
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

export default function ExploreChatModal({
  open,
  bookTitle,
  documentId,
  selectionText,
  selectionAnchor,
  onRequestAnchor,
  onOpenArtifactNote,
  onOpenArtifactAudio,
  onOpenArtifactExplore,
  onClose,
}: ExploreChatModalProps) {
  const apiBase = getClientApiBase();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [threadId, setThreadId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextText, setContextText] = useState("");
  const [zoomedImage, setZoomedImage] = useState<{ url: string; alt: string } | null>(
    null
  );
  const [anchorSelectionId, setAnchorSelectionId] = useState<number | null>(null);
  const [anchorDraft, setAnchorDraft] = useState<{
    sectionId: number;
    selector: {
      position: { start: number; end: number };
      quote: { exact: string; prefix: string; suffix: string };
    };
  } | null>(null);
  const [artifactMenu, setArtifactMenu] = useState<ArtifactMenuState | null>(null);
  const [artifactMarkers, setArtifactMarkers] = useState<AdditionMarker[]>([]);
  const messageIdRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number | null>(null);

  const storageKey = useMemo(() => {
    if (documentId) {
      return `explore-chat:doc:${documentId}`;
    }
    const normalizedTitle = (bookTitle || FALLBACK_BOOK_TITLE)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `explore-chat:${normalizedTitle}`;
  }, [bookTitle, documentId]);

  const contextPreview = useMemo(() => truncateContext(contextText), [contextText]);
  const artifactMarkerKinds = useMemo(
    () => artifactMarkers.map((marker) => marker.kind),
    [artifactMarkers]
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    if (selectionAnchor?.selectionId) {
      setAnchorSelectionId(selectionAnchor.selectionId);
    } else {
      setAnchorSelectionId(null);
    }
    if (selectionAnchor?.sectionId && selectionAnchor.selector) {
      setAnchorDraft({
        sectionId: selectionAnchor.sectionId,
        selector: selectionAnchor.selector,
      });
    } else {
      setAnchorDraft(null);
    }
  }, [open, selectionAnchor]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setContextText(selectionText?.trim() ?? "");
  }, [open, selectionText]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) {
      setMessages([]);
      setThreadId(null);
      setDraftMessage("");
      return;
    }
    try {
      const parsed = JSON.parse(stored) as {
        threadId?: number | null;
        messages?: ChatMessage[];
        draftMessage?: string;
      };
      setMessages(parsed.messages ?? []);
      setThreadId(parsed.threadId ?? null);
      setDraftMessage(parsed.draftMessage ?? "");
    } catch {
      setMessages([]);
      setThreadId(null);
      setDraftMessage("");
    }
  }, [open, storageKey]);

  useEffect(() => {
    if (!open || !documentId) {
      return;
    }
    let cancelled = false;
    const loadThread = async () => {
      try {
        const response = await fetch(`${apiBase}/explore/chat/book/${documentId}`);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as {
          thread?: { id?: number };
          messages?: ChatMessage[];
        };
        if (cancelled) {
          return;
        }
        if (data.thread?.id) {
          setThreadId(data.thread.id);
        }
        if (data.messages) {
          setMessages(
            data.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
            }))
          );
        }
      } catch {
        // ignore load errors
      }
    };
    loadThread();
    return () => {
      cancelled = true;
    };
  }, [apiBase, documentId, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const payload = JSON.stringify({
      threadId,
      messages,
      draftMessage,
    });
    window.localStorage.setItem(storageKey, payload);
  }, [draftMessage, messages, open, storageKey, threadId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.overflow = previous.overflow;
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const root = document.documentElement;
    root.classList.add("explore-modal-open");
    return () => {
      root.classList.remove("explore-modal-open");
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const panel = panelRef.current;
    const handleTouchMove = (event: TouchEvent) => {
      if (!panel) {
        return;
      }
      if (!panel.contains(event.target as Node)) {
        event.preventDefault();
      }
    };
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const container = messagesRef.current;
    if (!container) {
      return;
    }
    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }
      touchStartRef.current = touch.clientY;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || touchStartRef.current === null) {
        return;
      }
      const delta = touch.clientY - touchStartRef.current;
      const atTop = container.scrollTop <= 0;
      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
      if ((atTop && delta > 0) || (atBottom && delta < 0)) {
        event.preventDefault();
      }
    };
    const handleTouchEnd = () => {
      touchStartRef.current = null;
    };
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages, open, isSubmitting]);

  useEffect(() => {
    if (!open) {
      return;
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (!open) {
      setArtifactMenu(null);
      setArtifactMarkers([]);
    }
  }, [open]);

  const normalizeError = (err: unknown) => {
    if (err instanceof Error) {
      const message = err.message.toLowerCase();
      if (message.includes("failed to fetch") || message.includes("networkerror")) {
        return "Server not reachable. Is the API running?";
      }
      return err.message;
    }
    return "Explore request failed.";
  };

  const ensureAnchorSelectionId = useCallback(async () => {
    if (anchorSelectionId) {
      return anchorSelectionId;
    }
    const draft = anchorDraft ?? onRequestAnchor?.();
    if (!draft || !documentId) {
      return null;
    }
    try {
      const response = await fetch(`${apiBase}/selections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          section_id: draft.sectionId,
          selector: draft.selector,
        }),
      });
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as { selection?: { id?: number } };
      if (data.selection?.id) {
        setAnchorSelectionId(data.selection.id);
        setAnchorDraft(draft);
        return data.selection.id;
      }
    } catch (error) {
      console.error(error);
    }
    return null;
  }, [anchorDraft, anchorSelectionId, apiBase, documentId, onRequestAnchor]);

  const attachAdditionToMessage = useCallback((messageId: number, additionId: number, selectionId: number) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === messageId ? { ...message, additionId, selectionId } : message
      )
    );
  }, []);

  const saveExploreAddition = useCallback(
    async (message: ChatMessage, promptText: string) => {
      if (message.role !== "assistant") {
        return;
      }
      const selectionId = await ensureAnchorSelectionId();
      if (!selectionId) {
        return;
      }
      try {
        const response = await fetch(`${apiBase}/additions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selection_id: selectionId,
            type: "explore",
            text_content: message.content,
            payload: {
              thread_id: threadId,
              message_id: message.id,
              role: message.role,
              prompt: promptText,
              content: message.content,
              context_text: contextText,
            },
          }),
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { addition?: { id?: number; selection_id?: number } };
        if (data.addition?.id && data.addition?.selection_id) {
          attachAdditionToMessage(message.id, data.addition.id, data.addition.selection_id);
        }
      } catch (error) {
        console.error(error);
      }
    },
    [apiBase, attachAdditionToMessage, contextText, ensureAnchorSelectionId, threadId]
  );

  const loadArtifactMarkers = useCallback(
    async (additionId: number) => {
      try {
        const response = await fetch(
          `${apiBase}/markers?target_type=addition&target_id=${additionId}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { markers?: AdditionMarker[] };
        setArtifactMarkers(data.markers ?? []);
      } catch (error) {
        console.error(error);
      }
    },
    [apiBase]
  );

  const toggleArtifactMarker = useCallback(
    async (kind: "like" | "highlight" | "todo") => {
      if (!artifactMenu) {
        return;
      }
      const existing = artifactMarkers.find((marker) => marker.kind === kind);
      if (existing) {
        try {
          const response = await fetch(`${apiBase}/markers/${existing.id}`, {
            method: "DELETE",
          });
          if (response.ok) {
            setArtifactMarkers((prev) => prev.filter((marker) => marker.id !== existing.id));
          }
        } catch (error) {
          console.error(error);
        }
        return;
      }
      try {
        const response = await fetch(`${apiBase}/markers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_type: "addition",
            target_id: artifactMenu.additionId,
            kind,
          }),
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { marker?: AdditionMarker };
        if (data.marker) {
          setArtifactMarkers((prev) => [...prev, data.marker as AdditionMarker]);
        }
      } catch (error) {
        console.error(error);
      }
    },
    [apiBase, artifactMarkers, artifactMenu]
  );

  const handleArtifactAction = useCallback(
    (action: "note" | "audio" | "explore") => {
      if (!artifactMenu) {
        return;
      }
      const source = {
        additionId: artifactMenu.additionId,
        selectionId: artifactMenu.selectionId,
        kind: artifactMenu.kind,
        previewText: artifactMenu.contextText,
      };
      if (action === "note") {
        onOpenArtifactNote?.(source);
      } else if (action === "audio") {
        onOpenArtifactAudio?.(source);
      } else {
        onOpenArtifactExplore?.(source);
      }
      setArtifactMenu(null);
    },
    [artifactMenu, onOpenArtifactAudio, onOpenArtifactExplore, onOpenArtifactNote]
  );

  const handleMessageDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>, message: ChatMessage) => {
      if (message.role !== "assistant" || !message.additionId || !message.selectionId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const menuWidth = 320;
      const padding = 16;
      const aboveTop = rect.top - 56;
      const menuTop = aboveTop > padding ? aboveTop : rect.bottom + 12;
      const menuLeft = Math.min(
        Math.max(padding, rect.left),
        window.innerWidth - menuWidth - padding
      );
      setArtifactMenu({
        top: menuTop,
        left: menuLeft,
        label: "Explore response",
        contextText: message.content,
        additionId: message.additionId,
        selectionId: message.selectionId,
        kind: "explore",
      });
      void loadArtifactMarkers(message.additionId);
    },
    [loadArtifactMarkers]
  );

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) {
        return;
      }
      const trimmed = draftMessage.trim();
      if (!trimmed) {
        return;
      }

      const nextUserMessage: ChatMessage = {
        id: Date.now() + messageIdRef.current++,
        role: "user",
        content: trimmed,
      };
      setMessages((prev) => [...prev, nextUserMessage]);
      setDraftMessage("");
      setIsSubmitting(true);
      setError(null);

      const contextPrefix = contextText ? `Context:\n${contextText}\n\n` : "";
      const payloadMessage = `${contextPrefix}${trimmed}`;

      try {
        const response = await fetch(`${apiBase}/explore/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: threadId,
            message: payloadMessage,
            action: threadId ? "resume" : "new",
            mode: "codex-cli",
            book_title: bookTitle ?? FALLBACK_BOOK_TITLE,
            document_id: documentId ?? null,
          }),
        });
        if (!response.ok) {
          const data = (await response.json()) as { detail?: string };
          throw new Error(data.detail || "Explore request failed.");
        }
        const data = (await response.json()) as {
          messages?: Array<{ content?: string }>;
          thread?: { id?: number };
        };
        const assistantText = data.messages?.[0]?.content ?? "";
        if (assistantText) {
          const assistantMessage: ChatMessage = {
            id: Date.now() + messageIdRef.current++,
            role: "assistant",
            content: assistantText,
          };
          setMessages((prev) => [...prev, assistantMessage]);
          void saveExploreAddition(assistantMessage, trimmed);
        }
        if (data.thread?.id && !threadId) {
          setThreadId(data.thread.id);
        }
      } catch (err) {
        setError(normalizeError(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      apiBase,
      bookTitle,
      contextText,
      documentId,
      draftMessage,
      isSubmitting,
      saveExploreAddition,
      threadId,
    ]
  );

  return (
    <div
      className={`explore-chat-modal${open ? " is-open" : ""}`}
      aria-hidden={!open}
      onClick={() => {
        if (open) {
          onClose();
        }
      }}
    >
      <div
        className="explore-chat-modal__panel"
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="explore-chat-modal__header">
          <div className="explore-chat-modal__title">Explore</div>
          <button
            type="button"
            className="explore-chat-modal__close"
            onClick={onClose}
            aria-label="Close explore chat"
          >
            <IconClose />
          </button>
        </div>
        {contextText ? (
          <div className="explore-chat-modal__context">
            <div className="explore-chat-modal__context-label">Context</div>
            <div className="explore-chat-modal__context-text">{contextPreview}</div>
            <button
              type="button"
              className="explore-chat-modal__context-clear"
              onClick={() => setContextText("")}
            >
              Clear
            </button>
          </div>
        ) : null}
        <div className="chat-messages" ref={messagesRef}>
          {messages.length === 0 ? (
            <div className="explore-chat-modal__empty">Ask something about this passage.</div>
          ) : null}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`chat-message chat-message--${message.role}`}
              onDoubleClick={(event) => handleMessageDoubleClick(event, message)}
            >
              {parseMessageParts(message.content).map((part, index) =>
                part.type === "image" ? (
                  <div className="chat-message__image" key={`${message.id}-img-${index}`}>
                    <button
                      type="button"
                      className="chat-message__image-button"
                      onClick={() => setZoomedImage({ url: part.url, alt: part.alt })}
                    >
                      <img src={part.url} alt={part.alt} loading="lazy" />
                    </button>
                  </div>
                ) : (
                  <span className="chat-message__text" key={`${message.id}-text-${index}`}>
                    {part.value}
                  </span>
                )
              )}
            </div>
          ))}
          {isSubmitting ? (
            <div className="chat-message chat-message--assistant chat-message--loading">
              <span className="explore-spinner" aria-hidden="true" />
              Thinking...
            </div>
          ) : null}
        </div>
        {error ? <div className="explore-chat-modal__error">{error}</div> : null}
        <form className="chat-input" onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className="chat-textarea"
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            placeholder="Ask a question"
          />
          <button
            type="submit"
            className="explore-chat-modal__submit"
            disabled={!draftMessage.trim() || isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send"}
          </button>
        </form>
        {artifactMenu ? (
          <ArtifactActionMenu
            top={artifactMenu.top}
            left={artifactMenu.left}
            label={artifactMenu.label}
            contextText={artifactMenu.contextText}
            markerKinds={artifactMarkerKinds}
            onToggleMarker={toggleArtifactMarker}
            onNote={() => handleArtifactAction("note")}
            onAudio={() => handleArtifactAction("audio")}
            onExplore={() => handleArtifactAction("explore")}
            onClose={() => setArtifactMenu(null)}
          />
        ) : null}
      </div>
      {zoomedImage ? (
        <div
          className="explore-chat-modal__zoom"
          onClick={(event) => {
            event.stopPropagation();
            setZoomedImage(null);
          }}
        >
          <button
            type="button"
            className="explore-chat-modal__zoom-close"
            onClick={(event) => {
              event.stopPropagation();
              setZoomedImage(null);
            }}
            aria-label="Close image"
          >
            <IconClose />
          </button>
          <img src={zoomedImage.url} alt={zoomedImage.alt} />
        </div>
      ) : null}
    </div>
  );
}
