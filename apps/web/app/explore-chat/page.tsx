"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";

type ExploreMode = "mock" | "codex-cli";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful reading companion. Respond to the user's last message, keep continuity with the chat history, and be concise.";

export default function ExploreChatPage() {
  const apiBase = getClientApiBase();
  const [mode, setMode] = useState<ExploreMode>("codex-cli");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [draftMessage, setDraftMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          system_prompt: systemPrompt.trim() || null,
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
      }
      setMessages((prev) => [
        ...prev,
        { id: now + 1, role: "assistant", content: responseText },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Explore request failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    setThreadId(null);
  };

  return (
    <main className="reader-main explore-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Lab</div>
        <h1 className="reader-title">Explore Chat</h1>
      </header>
      <section className="explore-grid explore-grid--chat">
        <div className="explore-panel explore-panel--chat-settings">
          <div className="explore-panel__title">Chat Settings</div>
          <label className="explore-label">
            System prompt
            <textarea
              className="explore-textarea explore-textarea--small"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
          </label>
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
          <div className="explore-actions">
            <button type="button" className="explore-secondary" onClick={handleClearChat}>
              Clear chat
            </button>
          </div>
          <div className="explore-hint">
            CLI sessions persist with <code>codex exec resume --last</code>.
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
