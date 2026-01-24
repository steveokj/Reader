"use client";

import { useCallback, useRef, useState } from "react";
import { flushSync } from "react-dom";

export default function KeyboardTestPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [value, setValue] = useState("");

  const openSheet = useCallback(() => {
    flushSync(() => {
      setSheetOpen(true);
    });
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Mobile Input</div>
        <h1 className="reader-title">Keyboard Focus Test</h1>
      </header>
      <section className="keyboard-test">
        <p>
          Tap the button below. The sheet should open and focus the input, bringing up
          the keyboard on iOS.
        </p>
        <button type="button" className="keyboard-test__button" onClick={openSheet}>
          Open input
        </button>
        <div className="keyboard-test__value">Value: {value || "—"}</div>
      </section>

      {sheetOpen ? (
        <div className="keyboard-test__backdrop" onClick={closeSheet}>
          <div
            className="keyboard-test__sheet"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="keyboard-test__sheet-title">Type something</div>
            <input
              ref={inputRef}
              className="keyboard-test__input"
              type="text"
              inputMode="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Start typing..."
            />
            <div className="keyboard-test__sheet-actions">
              <button type="button" onClick={closeSheet}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .keyboard-test {
          max-width: 720px;
          margin: 24px auto 0;
          padding: 0 20px 80px;
          display: grid;
          gap: 16px;
          color: rgba(31, 28, 22, 0.78);
        }
        .keyboard-test__button {
          border-radius: 999px;
          padding: 10px 18px;
          font-weight: 600;
          border: 1px solid rgba(31, 28, 22, 0.2);
          background: #fff7ee;
        }
        .keyboard-test__value {
          font-size: 14px;
        }
        .keyboard-test__backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 12, 8, 0.35);
          display: flex;
          justify-content: center;
          align-items: flex-end;
          padding: 20px;
          z-index: 40;
        }
        .keyboard-test__sheet {
          width: min(520px, 100%);
          background: #fffaf5;
          border-radius: 18px;
          padding: 18px;
          display: grid;
          gap: 12px;
          box-shadow: 0 18px 40px rgba(15, 12, 8, 0.2);
        }
        .keyboard-test__sheet-title {
          font-weight: 600;
        }
        .keyboard-test__input {
          border-radius: 12px;
          border: 1px solid rgba(31, 28, 22, 0.2);
          padding: 10px 12px;
          font-size: 16px;
        }
        .keyboard-test__sheet-actions {
          display: flex;
          justify-content: flex-end;
        }
        @media (max-width: 600px) {
          .keyboard-test__sheet {
            width: 100%;
            border-radius: 16px;
          }
        }
      `}</style>
    </main>
  );
}
