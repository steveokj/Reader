"use client";

import { useEffect, useRef, useState } from "react";

type AudioPayload = {
  url: string;
  mime: string;
  size_bytes: number;
};

type AudioRecorderModalProps = {
  isOpen: boolean;
  apiBase: string;
  onSave: (payload: AudioPayload) => void;
  onClose: () => void;
};

type RecorderState = "idle" | "recording" | "recorded" | "uploading";

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

export default function AudioRecorderModal({
  isOpen,
  apiBase,
  onSave,
  onClose,
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
    if (mediaRecorderRef.current && state === "recording") {
      mediaRecorderRef.current.stop();
    }
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
    if (state === "recording") {
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

  const statusText =
    state === "recording"
      ? `Recording... ${formatTime(elapsed)}`
      : state === "uploading"
      ? "Uploading..."
      : state === "recorded"
      ? "Recording ready"
      : "Ready to record";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Record Audio</h2>
          <button type="button" onClick={handleClose}>
            Close
          </button>
        </div>

        <div className="modal-section">
          <div className="audio-status">
            <span className={state === "recording" ? "pulse-dot" : "idle-dot"} />
            <span>{statusText}</span>
          </div>
          <div className="audio-recorder">
            <button
              type="button"
              className="audio-control"
              onClick={handleStart}
              disabled={state === "recording" || state === "uploading"}
            >
              Start
            </button>
            <button
              type="button"
              className="audio-control secondary"
              onClick={handleStop}
              disabled={state !== "recording"}
            >
              Stop
            </button>
            <button
              type="button"
              className="audio-control"
              onClick={handleUpload}
              disabled={state !== "recorded"}
            >
              Save
            </button>
          </div>
          {audioUrl ? <audio controls src={audioUrl} /> : null}
          {error ? <div className="modal-hint">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
