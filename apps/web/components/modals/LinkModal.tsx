"use client";

import { useEffect, useMemo, useState } from "react";

type LinkTarget = {
  type: "selection" | "addition";
  id: number;
  label: string;
  sublabel?: string | null;
};

type LinkModalProps = {
  isOpen: boolean;
  sourceLabel: string;
  targets: LinkTarget[];
  onCreateLink: (target: LinkTarget) => void;
  onClose: () => void;
};

export default function LinkModal({
  isOpen,
  sourceLabel,
  targets,
  onCreateLink,
  onClose,
}: LinkModalProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  const filteredTargets = useMemo(() => {
    if (!query.trim()) {
      return targets;
    }
    const needle = query.toLowerCase();
    return targets.filter((target) => {
      const label = target.label.toLowerCase();
      const sublabel = (target.sublabel ?? "").toLowerCase();
      return label.includes(needle) || sublabel.includes(needle);
    });
  }, [query, targets]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Link from</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-section">
          <div className="modal-section__title">{sourceLabel}</div>
        </div>
        <input
          className="modal-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search targets..."
        />
        <div className="link-list">
          {filteredTargets.length === 0 ? (
            <div className="modal-hint">No targets available.</div>
          ) : (
            filteredTargets.map((target) => (
              <div key={`${target.type}-${target.id}`} className="link-row">
                <div className="link-row__text">
                  <div className="link-row__label">{target.label}</div>
                  {target.sublabel ? <div className="link-row__sublabel">{target.sublabel}</div> : null}
                </div>
                <button type="button" onClick={() => onCreateLink(target)}>
                  Link
                </button>
              </div>
            ))
          )}
        </div>
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="secondary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
