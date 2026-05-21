export const preferredVoiceRecordingMimeTypes = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/m4a",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export function selectVoiceRecordingMimeType(MediaRecorderCtor = globalThis.MediaRecorder) {
  if (!MediaRecorderCtor || typeof MediaRecorderCtor.isTypeSupported !== "function") {
    return "";
  }

  return preferredVoiceRecordingMimeTypes.find((type) => MediaRecorderCtor.isTypeSupported(type)) || "";
}

export function voiceRecordingFilename(mimeType = "") {
  const normalized = cleanText(mimeType).toLowerCase();

  if (normalized.includes("mp4") || normalized.includes("m4a")) {
    return "cookooi-voice-note.m4a";
  }
  if (normalized.includes("ogg")) {
    return "cookooi-voice-note.ogg";
  }
  if (normalized.includes("webm")) {
    return "cookooi-voice-note.webm";
  }
  if (normalized.includes("wav")) {
    return "cookooi-voice-note.wav";
  }

  return "cookooi-voice-note.webm";
}

export function microphonePermissionWasBlocked(error) {
  return ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error?.name);
}

export async function transcribeVoiceBlob({
  blob,
  fetcher = globalThis.fetch,
  endpoint = "/api/voice/transcribe",
  sessionId = "",
  filename = voiceRecordingFilename(blob?.type),
} = {}) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw voiceTranscriptionError("empty_audio", "Record a voice note before transcribing.", false);
  }
  if (typeof fetcher !== "function") {
    throw voiceTranscriptionError("network_error", "Voice transcription is unavailable in this browser.", true);
  }

  const form = new FormData();
  form.set("audio", blob, filename);

  let response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: sessionId ? { "x-cookooi-session": sessionId } : {},
      body: form,
    });
  } catch {
    throw voiceTranscriptionError(
      "network_error",
      "Cookooi could not reach voice transcription. Keep or edit the transcript text and try again.",
      true,
    );
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw voiceTranscriptionError(
      body.error || "request_failed",
      friendlyTranscriptionMessage(body, response.status),
      Boolean(body.retryable) || response.status >= 500,
    );
  }

  const transcript = cleanText(body.transcript);
  if (!transcript) {
    throw voiceTranscriptionError(
      "empty_transcript",
      "Cookooi could not read a transcript from this note. Try a shorter note or paste text below.",
      true,
    );
  }

  return {
    transcript,
    source: cleanText(body.source),
    provider: cleanText(body.provider),
    model: cleanText(body.model),
    createdAt: cleanText(body.createdAt),
  };
}

function friendlyTranscriptionMessage(body, status) {
  const messages = {
    invalid_request: body.message,
    missing_audio: body.message,
    empty_audio: body.message,
    audio_too_large: body.message,
    unsupported_audio: body.message,
    provider_unavailable: "Voice transcription is not configured yet. Use the text transcript field for now.",
    provider_rate_limited: "Cookooi is handling a lot of voice notes. Please retry shortly.",
    provider_timeout: "Voice transcription took too long. Try again with a shorter note.",
    provider_error: "Cookooi could not transcribe this note right now. Use the text transcript field or try again.",
    invalid_ai_output: "Cookooi could not read a transcript from this note. Try again or paste text below.",
    rate_limited: body.message,
  };

  return (
    messages[body.error] ||
    body.message ||
    (status >= 500
      ? "Cookooi could not transcribe this note right now. Use the text transcript field or try again."
      : "Check the voice note and try again.")
  );
}

function voiceTranscriptionError(code, message, retryable) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
