"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { getClientApiBase } from "@/lib/apiBase";

type ExploreMode = "mock" | "codex-cli";

const PRESET_PROMPTS = [
  {
    label: "Explain",
    instruction: "Explain this selection in plain language. Keep it short and clear.",
  },
  {
    label: "Questions",
    instruction: "List the most interesting questions this selection raises.",
  },
  {
    label: "Connections",
    instruction: "Connect this selection to related ideas, authors, or domains.",
  },
  {
    label: "Next Steps",
    instruction: "Propose next steps: experiments, readings, or actions.",
  },
] as const;

export default function ExploreLabPage() {
  const apiBase = getClientApiBase();
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  const [selectionText, setSelectionText] = useState("");
  const [contextText, setContextText] = useState("");
  const [instruction, setInstruction] = useState(PRESET_PROMPTS[0].instruction);
  const [mode, setMode] = useState<ExploreMode>("mock");
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  useEffect(() => {
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;
    const textParam = searchParams.get("text");
    const contextParam = searchParams.get("context");
    if (textParam) {
      setSelectionText(textParam);
    }
    if (contextParam) {
      setContextText(contextParam);
    }
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedSelection = selectionText.trim();
    if (!trimmedSelection) {
      setError("Paste a selection to explore.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setResponseText("");
    try {
      const response = await fetch(`${apiBase}/explore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selection_text: trimmedSelection,
          context_text: contextText.trim() || null,
          instruction: instruction.trim() || null,
          mode,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { detail?: string };
        throw new Error(data.detail || "Explore request failed.");
      }

      const data = (await response.json()) as { response_text?: string };
      setResponseText(data.response_text ?? "");
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = () => {
    setSelectionText("");
    setContextText("");
    setResponseText("");
    setError(null);
  };

  const handleLoadSample = () => {
    setSelectionText(
      "We do not read, as children do, to indulge in the pleasures of storytelling, " +
        "or as ambitious young people do, to stimulate our ambition. We read to be able " +
        "to live another life, and then to return to our own, renewed."
    );
    setContextText("Essay on reading habits.");
  };

  return (
    <main className="reader-main explore-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Lab</div>
        <h1 className="reader-title">Explore</h1>
      </header>
      <section className="explore-grid">
        <form className="explore-panel" onSubmit={handleSubmit}>
          <div className="explore-panel__title">Selection</div>
          <label className="explore-label">
            Selection text
            <textarea
              className="explore-textarea"
              value={selectionText}
              onChange={(event) => setSelectionText(event.target.value)}
              placeholder="Paste a passage or highlight from the reader..."
            />
          </label>
          <label className="explore-label">
            Context (optional)
            <textarea
              className="explore-textarea explore-textarea--small"
              value={contextText}
              onChange={(event) => setContextText(event.target.value)}
              placeholder="Author, chapter title, or why this matters."
            />
          </label>
          <label className="explore-label">
            Instruction
            <input
              className="explore-input"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="How should the explorer respond?"
            />
          </label>
          <div className="explore-presets">
            {PRESET_PROMPTS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="explore-preset"
                onClick={() => setInstruction(preset.instruction)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="explore-label">
            Mode
            <select
              className="explore-select"
              value={mode}
              onChange={(event) => setMode(event.target.value as ExploreMode)}
            >
              <option value="mock">Mock (no CLI)</option>
              <option value="codex-cli">Codex CLI</option>
            </select>
          </label>
          <div className="explore-actions">
            <button type="submit" className="action-link" disabled={isSubmitting}>
              {isSubmitting ? "Exploring..." : "Explore"}
            </button>
            <button type="button" className="explore-secondary" onClick={handleLoadSample}>
              Load sample
            </button>
            <button type="button" className="explore-secondary" onClick={handleClear}>
              Clear
            </button>
          </div>
          <div className="explore-hint">
            Use Codex CLI mode after running <code>codex login</code> in your terminal.
          </div>
        </form>
        <section className="explore-panel explore-panel--response">
          <div className="explore-panel__title">Response</div>
          {error ? <div className="explore-error">{error}</div> : null}
          <div className="explore-output">
            {isSubmitting ? (
              <div className="explore-loading">
                <span className="explore-spinner" aria-hidden="true" />
                Waiting for response...
              </div>
            ) : responseText ? (
              responseText
            ) : (
              "Responses will appear here."
            )}
          </div>
          <div className="explore-meta">
            Mode: <strong>{mode}</strong>
          </div>
        </section>
      </section>
    </main>
  );
}
