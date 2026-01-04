"use client";

import { useCallback, useRef, useState } from "react";

const DOUBLE_TAP_WINDOW_MS = 450;
const DOUBLE_TAP_DISTANCE_PX = 40;

type TapPoint = {
  time: number;
  x: number;
  y: number;
};

type EventLog = {
  id: number;
  time: string;
  type: string;
  details: string;
};

export default function GestureTestPage() {
  const lastTapRef = useRef<TapPoint | null>(null);
  const lastTouchEventRef = useRef(0);
  const lastPointerEventRef = useRef(0);
  const tapCountRef = useRef(0);
  const eventIdRef = useRef(0);
  
  const [status, setStatus] = useState("Waiting for taps...");
  const [modalOpen, setModalOpen] = useState(false);
  const [eventLog, setEventLog] = useState<EventLog[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [selectionVisible, setSelectionVisible] = useState(false);

  const addLog = useCallback((type: string, details: string) => {
    const log: EventLog = {
      id: eventIdRef.current++,
      time: new Date().toLocaleTimeString(),
      type,
      details
    };
    setEventLog(prev => [log, ...prev].slice(0, 20));
  }, []);

  const handleTap = useCallback((x: number, y: number, source: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const deltaMs = last ? now - last.time : null;
    const distance = last ? Math.hypot(x - last.x, y - last.y) : null;
    const withinWindow = last ? deltaMs! < DOUBLE_TAP_WINDOW_MS : false;
    const withinDistance = distance ? distance < DOUBLE_TAP_DISTANCE_PX : false;

    if (withinWindow && withinDistance) {
      tapCountRef.current++;
      lastTapRef.current = null;
      const msg = `Double tap #${tapCountRef.current} (${source}) at ${Math.round(x)}, ${Math.round(y)}`;
      setStatus(msg);
      addLog("DOUBLE-TAP", `${source} | dt=${deltaMs}ms | dist=${Math.round(distance!)}px`);
      setModalOpen(true);
      setSelectionVisible(true);
      return;
    }

    lastTapRef.current = { time: now, x, y };
    const msg = `Tap (${source}) at ${Math.round(x)}, ${Math.round(y)}`;
    setStatus(msg);
    addLog("TAP", `${source} | x=${Math.round(x)} y=${Math.round(y)}`);
  }, [addLog]);

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        lastPointerEventRef.current = Date.now();
        addLog("POINTER-UP", `touch | timeRef=${lastPointerEventRef.current}`);
      }
      handleTap(event.clientX, event.clientY, `pointer:${event.pointerType}`);
    },
    [handleTap, addLog]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      const touch = event.changedTouches[0];
      if (!touch) {
        addLog("TOUCH-END", "no touch in changedTouches");
        return;
      }
      const timeSincePointer = Date.now() - lastPointerEventRef.current;
      if (timeSincePointer < 400) {
        addLog("TOUCH-END", `SKIPPED (${timeSincePointer}ms since pointer)`);
        return;
      }
      lastTouchEventRef.current = Date.now();
      addLog("TOUCH-END", `processing | dt=${timeSincePointer}ms`);
      handleTap(touch.clientX, touch.clientY, "touch");
    },
    [handleTap, addLog]
  );

  const handleSelectionTest = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const text = range.toString();
      setSelectedText(text);
      addLog("SELECTION", `"${text}" | collapsed=${selection.isCollapsed}`);
    } else {
      setSelectedText("");
      addLog("SELECTION", "No selection");
    }
  }, [addLog]);

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
          <p>Tap anywhere in this area to test double-tap detection.</p>
          <p style={{ marginTop: "12px" }}>
            <span className={selectionVisible ? "word-selected" : "word"}>
              Double tap this word to test selection
            </span>
          </p>
        </div>

        <div className="test-controls">
          <button type="button" onClick={handleSelectionTest}>
            Test Selection
          </button>
          <button type="button" onClick={() => setEventLog([])}>
            Clear Log
          </button>
          <button type="button" onClick={() => {
            setSelectionVisible(false);
            setSelectedText("");
          }}>
            Clear Selection
          </button>
        </div>

        {selectedText && (
          <div className="selection-info">
            <strong>Selected:</strong> "{selectedText}"
          </div>
        )}

        <div className="event-log">
          <h3>Event Log (last 20 events)</h3>
          {eventLog.length === 0 ? (
            <div className="log-empty">No events yet</div>
          ) : (
            <div className="log-entries">
              {eventLog.map(log => (
                <div key={log.id} className="log-entry">
                  <span className="log-time">{log.time}</span>
                  <span className="log-type">{log.type}</span>
                  <span className="log-details">{log.details}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      
      {modalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-title">✓ Double tap detected</div>
            <div className="modal-body">
              Your double tap was successfully captured! Check the event log for details.
            </div>
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
          font-weight: 500;
          padding: 12px;
          background: rgba(31, 28, 22, 0.05);
          border-radius: 8px;
        }
        .gesture-test__surface {
          min-height: 320px;
          border-radius: 18px;
          border: 2px dashed rgba(31, 28, 22, 0.2);
          background: #fffaf5;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          text-align: center;
          padding: 20px;
          touch-action: manipulation;
        }
        .word {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          background: rgba(255, 200, 0, 0.2);
        }
        .word-selected {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          background: rgba(0, 150, 255, 0.3);
          color: #0066cc;
          font-weight: 600;
        }
        .test-controls {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .test-controls button {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid rgba(31, 28, 22, 0.2);
          background: white;
          font-size: 14px;
          cursor: pointer;
        }
        .test-controls button:active {
          background: rgba(31, 28, 22, 0.05);
        }
        .selection-info {
          padding: 12px;
          background: rgba(0, 150, 255, 0.1);
          border-radius: 8px;
          font-size: 14px;
        }
        .event-log {
          margin-top: 24px;
          padding: 16px;
          border-radius: 12px;
          background: rgba(31, 28, 22, 0.02);
          border: 1px solid rgba(31, 28, 22, 0.1);
        }
        .event-log h3 {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 12px;
        }
        .log-empty {
          font-size: 13px;
          color: rgba(31, 28, 22, 0.5);
          font-style: italic;
        }
        .log-entries {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .log-entry {
          font-size: 12px;
          font-family: 'SF Mono', Monaco, 'Courier New', monospace;
          padding: 6px 8px;
          background: white;
          border-radius: 4px;
          display: grid;
          grid-template-columns: 80px 120px 1fr;
          gap: 8px;
        }
        .log-time {
          color: rgba(31, 28, 22, 0.5);
        }
        .log-type {
          font-weight: 600;
          color: #1f1c16;
        }
        .log-details {
          color: rgba(31, 28, 22, 0.7);
        }
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-card {
          background: white;
          border-radius: 16px;
          padding: 24px;
          max-width: 400px;
          margin: 20px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        }
        .modal-title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        .modal-body {
          font-size: 15px;
          color: rgba(31, 28, 22, 0.8);
          margin-bottom: 20px;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
        }
        .modal-actions button {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          background: #0066cc;
          color: white;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
        }
      `}</style>
    </main>
  );
}
