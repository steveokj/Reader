"use client";

import { useEffect, useRef, useState } from "react";

import MarkerToggle from "@/components/MarkerToggle";

type NoteModalProps = {
  isOpen: boolean;
  initialText: string;
  title: string;
  markerKinds: Array<"like" | "highlight" | "todo">;
  onToggleMarker: (kind: "like" | "highlight" | "todo") => void;
  onSave: (text: string) => void;
  onClose: () => void;
};

export default function NoteModal({
  isOpen,
  initialText,
  title,
  markerKinds,
  onToggleMarker,
  onSave,
  onClose,
}: NoteModalProps) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(initialText);
  }, [initialText, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-markers">
          <MarkerToggle activeKinds={markerKinds} onToggle={onToggleMarker} compact />
        </div>
        <textarea
          className="modal-textarea"
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Write your note..."
        />
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="secondary">
            Cancel
          </button>
          <button type="button" onClick={() => onSave(text)}>
            Save note
          </button>
        </div>
      </div>
    </div>
  );
}
