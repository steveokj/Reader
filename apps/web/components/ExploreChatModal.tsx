"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type ExploreChatModalProps = {
  open: boolean;
  selectionText?: string | null;
  onClose: () => void;
};

const CONTEXT_PREVIEW_LIMIT = 140;

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

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

export default function ExploreChatModal({ open, selectionText, onClose }: ExploreChatModalProps) {
  const apiBase = getClientApiBase();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [threadId, setThreadId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextText, setContextText] = useState("");
  const messageIdRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contextPreview = useMemo(() => truncateContext(contextText), [contextText]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setError(null);
    setDraftMessage("");
    setContextText(selectionText?.trim() ?? "");
  }, [open, selectionText]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
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
          setMessages((prev) => [
            ...prev,
            { id: Date.now() + messageIdRef.current++, role: "assistant", content: assistantText },
          ]);
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
    [apiBase, contextText, draftMessage, isSubmitting, threadId]
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
            >
              {message.content}
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
      </div>
    </div>
  );
}
