"use client";

import type { FormEvent } from "react";
import { useState } from "react";

import { getClientApiBase } from "@/lib/apiBase";

type ExploreMode = "mock" | "codex-cli";

type ExploreRun = {
  id: number;
  createdAt: string;
  selectionText: string;
  contextText: string;
  instruction: string;
  mode: ExploreMode;
  responseText: string;
};

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

export default function ExploreSdkPage() {
  const apiBase = getClientApiBase();
  const [selectionText, setSelectionText] = useState("");
  const [contextText, setContextText] = useState("");
  const [instruction, setInstruction] = useState(PRESET_PROMPTS[0].instruction);
  const [mode, setMode] = useState<ExploreMode>("codex-cli");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runs, setRuns] = useState<ExploreRun[]>([]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedSelection = selectionText.trim();
    if (!trimmedSelection) {
      setError("Paste a selection to explore.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
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
      const responseText = data.response_text ?? "";
      const now = new Date();
      setRuns((prev) => [
        {
          id: now.getTime(),
          createdAt: now.toISOString(),
          selectionText: trimmedSelection,
          contextText: contextText.trim(),
          instruction: instruction.trim(),
          mode,
          responseText,
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Explore request failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearForm = () => {
    setSelectionText("");
    setContextText("");
    setError(null);
  };

  const handleClearRuns = () => {
    setRuns([]);
  };

  return (
    <main className="reader-main explore-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Lab</div>
        <h1 className="reader-title">Explore SDK</h1>
      </header>
      <section className="explore-grid explore-grid--history">
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
              <option value="codex-cli">Codex CLI</option>
              <option value="mock">Mock (no CLI)</option>
            </select>
          </label>
          <div className="explore-actions">
            <button type="submit" className="action-link" disabled={isSubmitting}>
              {isSubmitting ? "Exploring..." : "Explore"}
            </button>
            <button type="button" className="explore-secondary" onClick={handleClearForm}>
              Clear form
            </button>
            <button type="button" className="explore-secondary" onClick={handleClearRuns}>
              Clear history
            </button>
          </div>
          <div className="explore-hint">
            Each run appends the full CLI response to the history panel.
          </div>
        </form>
        <section className="explore-panel explore-panel--response">
          <div className="explore-panel__title">Responses</div>
          {error ? <div className="explore-error">{error}</div> : null}
          <div className="explore-history">
            {runs.length === 0 ? (
              <div className="explore-empty">No runs yet.</div>
            ) : (
              runs.map((run) => (
                <article key={run.id} className="explore-history__card">
                  <div className="explore-history__meta">
                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                    <span>{run.mode}</span>
                  </div>
                  <div className="explore-history__label">Instruction</div>
                  <div className="explore-history__text">{run.instruction || "(default)"}</div>
                  <div className="explore-history__label">Selection</div>
                  <div className="explore-history__text">{run.selectionText}</div>
                  {run.contextText ? (
                    <>
                      <div className="explore-history__label">Context</div>
                      <div className="explore-history__text">{run.contextText}</div>
                    </>
                  ) : null}
                  <div className="explore-history__label">Response</div>
                  <div className="explore-output explore-output--history">{run.responseText}</div>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
