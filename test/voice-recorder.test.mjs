import test from "node:test";
import assert from "node:assert/strict";
import {
  microphonePermissionWasBlocked,
  selectVoiceRecordingMimeType,
  transcribeVoiceBlob,
  voiceRecordingFilename,
} from "../public/voice-recorder.js";

test("prefers an iPhone-friendly MediaRecorder audio type when available", () => {
  class FakeMediaRecorder {
    static isTypeSupported(type) {
      return type === "audio/mp4;codecs=mp4a.40.2" || type === "audio/webm";
    }
  }

  assert.equal(selectVoiceRecordingMimeType(FakeMediaRecorder), "audio/mp4;codecs=mp4a.40.2");
  assert.equal(voiceRecordingFilename("audio/mp4;codecs=mp4a.40.2"), "cookooi-voice-note.m4a");
  assert.equal(voiceRecordingFilename("audio/webm;codecs=opus"), "cookooi-voice-note.webm");
});

test("transcribes a recorded audio blob without exposing provider details to browser config", async () => {
  const audio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mp4" });
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return new Response(
      JSON.stringify({
        transcript: " Eggs, rice, and spinach for dinner. ",
        source: "ai",
        provider: "openai",
        model: "gpt-4o-mini-transcribe",
        createdAt: "2026-05-21T17:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const result = await transcribeVoiceBlob({ blob: audio, fetcher, sessionId: "session-1" });

  assert.equal(request.url, "/api/voice/transcribe");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["x-cookooi-session"], "session-1");
  assert.equal(request.options.body.get("audio").name, "cookooi-voice-note.m4a");
  assert.equal(result.transcript, "Eggs, rice, and spinach for dinner.");
  assert.equal(result.provider, "openai");
});

test("maps transcription failures to retryable user-safe errors", async () => {
  const audio = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" });
  const fetcher = async () =>
    new Response(JSON.stringify({ error: "provider_timeout", retryable: true }), {
      status: 504,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    transcribeVoiceBlob({ blob: audio, fetcher }),
    (error) => {
      assert.equal(error.code, "provider_timeout");
      assert.equal(error.retryable, true);
      assert.match(error.message, /shorter note/i);
      return true;
    },
  );
});

test("detects blocked microphone permission errors", () => {
  assert.equal(microphonePermissionWasBlocked({ name: "NotAllowedError" }), true);
  assert.equal(microphonePermissionWasBlocked({ name: "NotFoundError" }), false);
});
