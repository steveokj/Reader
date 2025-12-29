"use client";

import { useEffect, useState } from "react";

type NoteModalProps = {
  isOpen: boolean;
  initialText: string;
  title: string;
  onSave: (text: string) => void;
  onClose: () => void;
};

export default function NoteModal({
  isOpen,
  initialText,
  title,
  onSave,
  onClose,
}: NoteModalProps) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(initialText);
  }, [initialText, isOpen]);

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
        <textarea
          className="modal-textarea"
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
