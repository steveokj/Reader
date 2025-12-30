"use client";

import { useCallback, useRef, useState } from "react";

const DOUBLE_TAP_WINDOW_MS = 450;
const DOUBLE_TAP_DISTANCE_PX = 40;

type TapPoint = {
  time: number;
  x: number;
  y: number;
};

export default function GestureTestPage() {
  const lastTapRef = useRef<TapPoint | null>(null);
  const lastTouchEventRef = useRef(0);
  const lastPointerEventRef = useRef(0);
  const [status, setStatus] = useState("Waiting for taps...");
  const [modalOpen, setModalOpen] = useState(false);

  const handleTap = useCallback((x: number, y: number, source: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const withinWindow = last ? now - last.time < DOUBLE_TAP_WINDOW_MS : false;
    const withinDistance = last
      ? Math.hypot(x - last.x, y - last.y) < DOUBLE_TAP_DISTANCE_PX
      : false;

    if (withinWindow && withinDistance) {
      lastTapRef.current = null;
      setStatus(`Double tap detected (${source}) at ${Math.round(x)}, ${Math.round(y)}`);
      setModalOpen(true);
      return;
    }

    lastTapRef.current = { time: now, x, y };
    setStatus(`Tap (${source}) at ${Math.round(x)}, ${Math.round(y)}`);
  }, []);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        lastPointerEventRef.current = Date.now();
      }
      handleTap(event.clientX, event.clientY, `pointer:${event.pointerType}`);
    },
    [handleTap]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }
      if (Date.now() - lastPointerEventRef.current < 400) {
        return;
      }
      lastTouchEventRef.current = Date.now();
      handleTap(touch.clientX, touch.clientY, "touch");
    },
    [handleTap]
  );

  return (
    <main className="reader-main documents-page">
      <header className="reader-header documents-header">
        <div className="reader-kicker">Gestures</div>
        <h1 className="reader-title">Double Tap Test</h1>
      </header>
      <section className="gesture-test">
        <div className="gesture-test__status">{status}</div>
        <div
          className="gesture-test__surface"
          onPointerUp={handlePointerUp}
          onTouchEnd={handleTouchEnd}
        >
          Tap anywhere in this area.
        </div>
      </section>
      {modalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title">Double tap detected</div>
            <div className="modal-body">Your double tap was captured.</div>
            <div className="modal-actions">
              <button type="button" onClick={() => setModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        .gesture-test {
          max-width: 920px;
          margin: 24px auto 0;
          padding: 0 20px 80px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .gesture-test__status {
          font-size: 14px;
          color: rgba(31, 28, 22, 0.7);
        }
        .gesture-test__surface {
          height: 320px;
          border-radius: 18px;
          border: 2px dashed rgba(31, 28, 22, 0.2);
          background: #fffaf5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          text-align: center;
          padding: 20px;
          touch-action: manipulation;
          user-select: none;
        }
      `}</style>
    </main>
  );
}
