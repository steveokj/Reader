"use client";

import { useEffect, useRef, useState } from "react";

import MarkerToggle from "@/components/MarkerToggle";

type AudioPayload = {
  url: string;
  mime: string;
  size_bytes: number;
};

type AudioRecorderModalProps = {
  isOpen: boolean;
  apiBase: string;
  markerKinds: Array<"like" | "highlight" | "todo">;
  onToggleMarker: (kind: "like" | "highlight" | "todo") => void;
  onSave: (payload: AudioPayload) => void;
  onClearSelection: () => void;
  onClose: () => void;
  showMarkers?: boolean;
};

type RecorderState = "idle" | "recording" | "paused" | "recorded" | "uploading";

function getExtensionFromMime(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("mp4")) return "m4a";
  return "webm";
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function IconRecord() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 6v12M16 6v12" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5l11 7-11 7V5z" />
    </svg>
  );
}

function IconRestart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12a8 8 0 108-8" />
      <path d="M4 4v6h6" />
    </svg>
  );
}

function IconClear() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14" />
      <path d="M9 7l1 12h4l1-12" />
      <path d="M9 7l1-2h4l1 2" />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12l4 4 10-10" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" />
    </svg>
  );
}

export default function AudioRecorderModal({
  isOpen,
  apiBase,
  markerKinds,
  onToggleMarker,
  onSave,
  onClearSelection,
  onClose,
  showMarkers = true,
}: AudioRecorderModalProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setState("idle");
    setError(null);
    setElapsed(0);
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setAudioBlob(null);
    chunksRef.current = [];
  }, [isOpen]);

  useEffect(() => {
    if (state === "recording") {
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state]);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const resetRecording = () => {
    setAudioBlob(null);
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    setElapsed(0);
    chunksRef.current = [];
    setState("idle");
  };

  const handleStart = async () => {
    setError(null);
    setElapsed(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState("recorded");
        stopTracks();
      };

      recorder.start();
      setState("recording");
    } catch (err) {
      setError("Microphone access denied or unavailable.");
      stopTracks();
      setState("idle");
    }
  };

  const handleStop = () => {
    if (mediaRecorderRef.current && (state === "recording" || state === "paused")) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleTogglePause = () => {
    if (!mediaRecorderRef.current) {
      return;
    }
    if (state === "recording") {
      mediaRecorderRef.current.pause();
      setState("paused");
    } else if (state === "paused") {
      mediaRecorderRef.current.resume();
      setState("recording");
    }
  };

  const handleRestart = () => {
    if (state === "recording" || state === "paused") {
      handleStop();
    }
    stopTracks();
    resetRecording();
  };

  const handleClear = () => {
    resetRecording();
    onClearSelection();
  };

  const handleUpload = async () => {
    if (!audioBlob) {
      return;
    }
    setState("uploading");
    setError(null);

    const mime = audioBlob.type || "audio/webm";
    const ext = getExtensionFromMime(mime);
    const formData = new FormData();
    formData.append("file", audioBlob, `recording.${ext}`);
    formData.append("mime", mime);

    try {
      const response = await fetch(`${apiBase}/media/audio`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      const data = (await response.json()) as AudioPayload;
      onSave(data);
      onClose();
    } catch (err) {
      setError("Upload failed. Please try again.");
      setState("recorded");
    }
  };

  const handleClose = () => {
    if (state === "recording" || state === "paused") {
      handleStop();
    }
    stopTracks();
    setAudioUrl((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return null;
    });
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  const statusText = formatTime(elapsed);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <span />
          <button type="button" onClick={handleClose} aria-label="Close" className="modal-icon">
            <IconClose />
          </button>
        </div>

        {showMarkers ? (
          <div className="modal-markers">
            <MarkerToggle activeKinds={markerKinds} onToggle={onToggleMarker} compact />
          </div>
        ) : null}

        <div className="modal-section">
          <div className="audio-status">
            <span className={state === "recording" ? "pulse-dot" : "idle-dot"} />
            <span className="audio-timer">{statusText}</span>
          </div>
          <div className="audio-recorder">
            {state === "idle" ? (
              <button
                type="button"
                className="audio-control"
                onClick={handleStart}
                aria-label="Start recording"
                title="Start"
              >
                <IconRecord />
              </button>
            ) : null}
            {state === "recording" || state === "paused" ? (
              <>
                <button
                  type="button"
                  className="audio-control"
                  onClick={handleTogglePause}
                  aria-label={state === "recording" ? "Pause recording" : "Resume recording"}
                  title={state === "recording" ? "Pause" : "Resume"}
                >
                  {state === "recording" ? <IconPause /> : <IconPlay />}
                </button>
                <button
                  type="button"
                  className="audio-control secondary"
                  onClick={handleStop}
                  aria-label="Stop recording"
                  title="Stop"
                >
                  <IconStop />
                </button>
              </>
            ) : null}
            {state === "recorded" ? (
              <>
                <button
                  type="button"
                  className="audio-control secondary"
                  onClick={handleRestart}
                  aria-label="Restart recording"
                  title="Restart"
                >
                  <IconRestart />
                </button>
                <button
                  type="button"
                  className="audio-control secondary"
                  onClick={handleClear}
                  aria-label="Clear recording"
                  title="Clear"
                >
                  <IconClear />
                </button>
                <button
                  type="button"
                  className="audio-control"
                  onClick={handleUpload}
                  aria-label="Save recording"
                  title="Save"
                >
                  <IconSave />
                </button>
              </>
            ) : null}
          </div>
          {audioUrl ? <audio controls src={audioUrl} /> : null}
          {error ? <div className="modal-hint">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
