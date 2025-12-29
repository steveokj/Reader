"use client";

import { useEffect, useState } from "react";

type GrammarPayload = {
  kind: "word" | "bars" | "structure" | "lookup";
  text?: string;
  lookup_url?: string;
};

type GrammarModalProps = {
  isOpen: boolean;
  selectionText: string;
  onSave: (payload: GrammarPayload) => void;
  onClose: () => void;
};

function buildLookupUrl(text: string) {
  const query = encodeURIComponent(text.trim());
  return `https://www.google.com/search?q=define+${query}`;
}

export default function GrammarModal({ isOpen, selectionText, onSave, onClose }: GrammarModalProps) {
  const [wordText, setWordText] = useState(selectionText);
  const [lookupText, setLookupText] = useState(selectionText);

  useEffect(() => {
    setWordText(selectionText);
    setLookupText(selectionText);
  }, [selectionText, isOpen]);

  if (!isOpen) {
    return null;
  }

  const lookupUrl = buildLookupUrl(lookupText);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Grammar</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal-section">
          <div className="modal-section__title">Word to learn</div>
          <input
            className="modal-input"
            value={wordText}
            onChange={(event) => setWordText(event.target.value)}
            placeholder="Word"
          />
          <button
            type="button"
            onClick={() => onSave({ kind: "word", text: wordText.trim() })}
            disabled={!wordText.trim()}
          >
            Save word
          </button>
        </div>

        <div className="modal-section">
          <div className="modal-section__title">Bars (quote)</div>
          <div className="modal-quote">{selectionText}</div>
          <button type="button" onClick={() => onSave({ kind: "bars", text: selectionText })}>
            Save bars
          </button>
        </div>

        <div className="modal-section">
          <div className="modal-section__title">Sentence structure</div>
          <button type="button" onClick={() => onSave({ kind: "structure", text: selectionText })}>
            Save structure
          </button>
        </div>

        <div className="modal-section">
          <div className="modal-section__title">Lookup meaning</div>
          <input
            className="modal-input"
            value={lookupText}
            onChange={(event) => setLookupText(event.target.value)}
            placeholder="Lookup text"
          />
          <div className="modal-hint">{lookupUrl}</div>
          <button
            type="button"
            onClick={() =>
              onSave({ kind: "lookup", text: lookupText.trim(), lookup_url: lookupUrl })
            }
            disabled={!lookupText.trim()}
          >
            Save lookup
          </button>
        </div>
      </div>
    </div>
  );
}
