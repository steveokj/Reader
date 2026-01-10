"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";
import { formatRelativeTime } from "@/lib/time";

type ExploreMode = "mock" | "codex-cli";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type ChatThread = {
  id: number;
  title?: string | null;
  system_prompt?: string | null;
  cli_session_id?: string | null;
  session_mode?: "pinned" | "last";
  created_at: string;
  updated_at: string;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful reading companion. Respond to the user's last message, keep continuity with the chat history, and be concise.";

export default function ExploreChatPage() {
  const apiBase = getClientApiBase();
  const [mode, setMode] = useState<ExploreMode>("codex-cli");
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [promptDraft, setPromptDraft] = useState(DEFAULT_SYSTEM_PROMPT);

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

  const loadThreads = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/explore/chat`);
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { threads?: ChatThread[] };
      setThreads(data.threads ?? []);
    } catch {
      // ignore load errors
    }
  }, [apiBase]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const handleSelectThread = async (thread: ChatThread) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiBase}/explore/chat/${thread.id}`);
      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Failed to load thread.");
      }
      const data = (await response.json()) as { thread?: ChatThread; messages?: ChatMessage[] };
      if (data.thread) {
        setActiveThread(data.thread);
        setThreadId(data.thread.id);
        setTitleDraft(data.thread.title ?? "");
        setPromptDraft(data.thread.system_prompt ?? DEFAULT_SYSTEM_PROMPT);
      }
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draftMessage.trim();
    if (!trimmed) {
      return;
    }

    const now = Date.now();
    const nextMessages = [
      ...messages,
      { id: now, role: "user", content: trimmed },
    ];
    setMessages(nextMessages);
    setDraftMessage("");
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${apiBase}/explore/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thread_id: threadId,
          message: trimmed,
          action: threadId ? "resume" : "new",
          system_prompt: promptDraft.trim() || null,
          mode,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Explore request failed.");
      }

      const data = (await response.json()) as { messages?: ChatMessage[]; thread?: { id: number } };
      const responseText = data.messages?.[0]?.content ?? "";
      if (!threadId && data.thread?.id) {
        setThreadId(data.thread.id);
        setActiveThread(data.thread as ChatThread);
        setTitleDraft(data.thread.title ?? "");
        setPromptDraft(data.thread.system_prompt ?? DEFAULT_SYSTEM_PROMPT);
      }
      setMessages((prev) => [
        ...prev,
        { id: now + 1, role: "assistant", content: responseText },
      ]);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    setThreadId(null);
    setActiveThread(null);
    setTitleDraft("");
    setPromptDraft(DEFAULT_SYSTEM_PROMPT);
  };

  const handleSaveThread = async () => {
    if (!threadId) {
      return;
    }
    try {
      const response = await fetch(`${apiBase}/explore/chat/${threadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: titleDraft.trim() || null,
          system_prompt: promptDraft.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Failed to update thread.");
      }
      const data = (await response.json()) as { thread?: ChatThread };
      if (data.thread) {
        setActiveThread(data.thread);
        setPromptDraft(data.thread.system_prompt ?? DEFAULT_SYSTEM_PROMPT);
      }
      loadThreads();
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const handleDeleteThread = async () => {
    if (!threadId) {
      return;
    }
    if (!window.confirm("Delete this thread and its messages?")) {
      return;
    }
    try {
      const response = await fetch(`${apiBase}/explore/chat/${threadId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Failed to delete thread.");
      }
      handleClearChat();
      loadThreads();
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const handleSessionMode = async (session_mode: "pinned" | "last") => {
    if (!threadId) {
      return;
    }
    try {
      const response = await fetch(`${apiBase}/explore/chat/${threadId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_mode }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Failed to update session mode.");
      }
      const data = (await response.json()) as { thread?: ChatThread };
      if (data.thread) {
        setActiveThread(data.thread);
      }
      loadThreads();
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  return (
    <main className="reader-main explore-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Lab</div>
        <h1 className="reader-title">Explore Chat</h1>
      </header>
      <section className="explore-grid explore-grid--chat">
        <div className="explore-chat-sidebar">
          <div className="explore-panel explore-panel--chat-settings">
            <div className="explore-panel__title">Chat Settings</div>
            <label className="explore-label">
              Thread title
              <input
                className="explore-input"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                placeholder={activeThread ? "Name this thread" : "Start a chat to name it"}
                disabled={!activeThread}
              />
            </label>
            <div className="explore-actions">
              <button
                type="button"
                className="explore-secondary"
                onClick={handleSaveThread}
                disabled={!activeThread}
              >
                Save thread
              </button>
              <button
                type="button"
                className="explore-secondary explore-secondary--danger"
                onClick={handleDeleteThread}
                disabled={!activeThread}
              >
                Delete
              </button>
            </div>
            <label className="explore-label">
              System prompt
              <textarea
                className="explore-textarea explore-textarea--small"
                value={promptDraft}
                onChange={(event) => setPromptDraft(event.target.value)}
              />
            </label>
            <div className="explore-actions">
              <button
                type="button"
                className="explore-secondary"
                onClick={handleSaveThread}
                disabled={!activeThread}
              >
                Save prompt
              </button>
            </div>
            <label className="explore-label">
              Mode
              <select
                className="explore-select"
                value={mode}
                onChange={(event) => setMode(event.target.value as ExploreMode)}
              >
                <option value="codex-cli">Codex CLI</option>
                <option value="mock">Mock (no CLI)</option>
              </select>
            </label>
            <label className="explore-label">
              Session mode
              <div className="explore-toggle-row">
                <button
                  type="button"
                  className={`explore-toggle${activeThread?.session_mode !== "last" ? " is-active" : ""}`}
                  onClick={() => handleSessionMode("pinned")}
                  disabled={!activeThread}
                >
                  Pinned
                </button>
                <button
                  type="button"
                  className={`explore-toggle${activeThread?.session_mode === "last" ? " is-active" : ""}`}
                  onClick={() => handleSessionMode("last")}
                  disabled={!activeThread}
                >
                  Use --last
                </button>
              </div>
            </label>
            <div className="explore-actions">
              <button type="button" className="explore-secondary" onClick={handleClearChat}>
                New chat
              </button>
            </div>
            <div className="explore-hint">
              {activeThread?.session_mode === "last" ? (
                <span className="explore-session-badge explore-session-badge--last">
                  Using --last
                </span>
              ) : activeThread?.cli_session_id ? (
                <span className="explore-session-badge explore-session-badge--pinned">
                  Session pinned
                </span>
              ) : (
                <span className="explore-session-badge explore-session-badge--pinned">
                  Pinning pending
                </span>
              )}
              <div className="explore-hint__line">New chat always starts fresh.</div>
            </div>
          </div>
          <div className="explore-panel explore-panel--thread-list">
            <div className="explore-panel__title">History</div>
            <div className="explore-thread-list">
              {threads.length === 0 ? (
                <div className="explore-empty">No saved threads yet.</div>
              ) : (
                threads.map((thread) => {
                  const isActive = thread.id === threadId;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      className={`explore-thread-item${isActive ? " is-active" : ""}`}
                      onClick={() => handleSelectThread(thread)}
                    >
                      <div className="explore-thread-item__title">
                        {thread.title || `Thread ${thread.id}`}
                      </div>
                      <div className="explore-thread-item__meta">
                        <span>{formatRelativeTime(thread.updated_at)}</span>
                        <span>
                          {thread.session_mode === "last"
                            ? "--last"
                            : thread.cli_session_id
                              ? "Pinned"
                              : "Pending"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <section className="chat-card">
          <div className="chat-card__title">Conversation</div>
          {error ? <div className="explore-error">{error}</div> : null}
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="explore-empty">Ask something about a selection.</div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`chat-message chat-message--${message.role}`}
                >
                  {message.content}
                </div>
              ))
            )}
            {isSubmitting ? (
              <div className="chat-message chat-message--assistant chat-message--loading">
                <span className="explore-spinner" aria-hidden="true" />
                Thinking...
              </div>
            ) : null}
          </div>
          <form className="chat-input" onSubmit={handleSubmit}>
            <textarea
              className="chat-textarea"
              rows={3}
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder="Ask a question or request an exploration..."
            />
            <button
              type="submit"
              className="action-link"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending..." : "Send"}
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
