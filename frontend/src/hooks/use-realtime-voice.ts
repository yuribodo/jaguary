"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { boundApi, createRequestIdentity } from "@/lib/bound-api";

export type VoicePhase = "off" | "connecting" | "listening" | "hearing" | "thinking" | "speaking" | "error";

type RealtimeEvent = {
  type?: string;
  item_id?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
};

type UseRealtimeVoiceOptions = {
  conversationId?: string;
  csrfToken: string;
  enabled: boolean;
  onTranscriptChange(value: string): void;
  onTurn(transcript: string): Promise<string | undefined>;
};

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

export function voicePhaseLabel(phase: VoicePhase): string {
  return ({
    off: "Start a voice conversation",
    connecting: "Connecting voice…",
    listening: "Listening — speak naturally",
    hearing: "Hearing you…",
    thinking: "TravelBot is thinking…",
    speaking: "TravelBot is speaking…",
    error: "Voice mode stopped",
  } as const)[phase];
}

export function useRealtimeVoice({
  conversationId,
  csrfToken,
  enabled,
  onTranscriptChange,
  onTurn,
}: UseRealtimeVoiceOptions) {
  const peerRef = useRef<RTCPeerConnection | undefined>(undefined);
  const channelRef = useRef<RTCDataChannel | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const processingRef = useRef(false);
  const phaseRef = useRef<VoicePhase>("off");
  const completedItemsRef = useRef(new Set<string>());
  const transcriptByItemRef = useRef(new Map<string, string>());
  const onTranscriptChangeRef = useRef(onTranscriptChange);
  const onTurnRef = useRef(onTurn);
  const [supported, setSupported] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("off");
  const [error, setError] = useState<string>();

  const updatePhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  useEffect(() => {
    onTranscriptChangeRef.current = onTranscriptChange;
    onTurnRef.current = onTurn;
  }, [onTranscriptChange, onTurn]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSupported(
        typeof RTCPeerConnection !== "undefined"
        && typeof navigator !== "undefined"
        && typeof navigator.mediaDevices?.getUserMedia === "function",
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const setMicrophoneEnabled = useCallback((next: boolean) => {
    for (const track of streamRef.current?.getAudioTracks() ?? []) track.enabled = next;
  }, []);

  const send = useCallback((event: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (channel?.readyState === "open") channel.send(JSON.stringify(event));
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    activeRef.current = false;
    processingRef.current = false;
    completedItemsRef.current.clear();
    transcriptByItemRef.current.clear();
    channelRef.current?.close();
    peerRef.current?.close();
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    channelRef.current = undefined;
    peerRef.current = undefined;
    streamRef.current = undefined;
    audioRef.current = undefined;
    onTranscriptChangeRef.current("");
    updatePhase("off");
  }, [updatePhase]);

  const speak = useCallback((message: string) => {
    if (!activeRef.current || !message.trim()) return;
    setMicrophoneEnabled(false);
    updatePhase("speaking");
    send({
      type: "response.create",
      response: {
        conversation: "none",
        metadata: { purpose: "travelbot_voice_render" },
        output_modalities: ["audio"],
        instructions: `Speak the authoritative TravelBot message below. Preserve every fact and do not add commentary. Use a warm, natural conversational delivery.\n\n${message}`,
      },
    });
  }, [send, setMicrophoneEnabled, updatePhase]);

  const handleFinalTranscript = useCallback(async (itemId: string, transcript: string) => {
    const cleanTranscript = transcript.trim();
    if (!activeRef.current || processingRef.current || !cleanTranscript || completedItemsRef.current.has(itemId)) return;
    completedItemsRef.current.add(itemId);
    processingRef.current = true;
    setMicrophoneEnabled(false);
    onTranscriptChangeRef.current("");
    updatePhase("thinking");
    try {
      const assistantMessage = await onTurnRef.current(cleanTranscript);
      if (!activeRef.current) return;
      processingRef.current = false;
      if (assistantMessage) speak(assistantMessage);
      else stop();
    } catch {
      if (!activeRef.current) return;
      processingRef.current = false;
      setError("I could not complete that voice turn. You can try again or type your message.");
      updatePhase("error");
    }
  }, [setMicrophoneEnabled, speak, stop, updatePhase]);

  const handleEvent = useCallback((raw: string) => {
    let event: RealtimeEvent;
    try {
      event = JSON.parse(raw) as RealtimeEvent;
    } catch {
      return;
    }
    const itemId = event.item_id ?? "current";
    switch (event.type) {
      case "input_audio_buffer.speech_started":
        if (processingRef.current) return;
        updatePhase("hearing");
        break;
      case "conversation.item.input_audio_transcription.delta": {
        const next = `${transcriptByItemRef.current.get(itemId) ?? ""}${event.delta ?? ""}`;
        transcriptByItemRef.current.set(itemId, next);
        onTranscriptChangeRef.current(next);
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        transcriptByItemRef.current.delete(itemId);
        void handleFinalTranscript(itemId, event.transcript ?? "");
        break;
      case "output_audio_buffer.stopped":
        if (!processingRef.current && activeRef.current && phaseRef.current === "speaking") stop();
        break;
      case "error":
        setMicrophoneEnabled(false);
        setError(event.error?.message ?? "Voice mode hit a temporary error.");
        updatePhase("error");
        break;
    }
  }, [handleFinalTranscript, setMicrophoneEnabled, stop, updatePhase]);

  const start = useCallback(async () => {
    if (!conversationId || !enabled || !supported || activeRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setError(undefined);
    updatePhase("connecting");
    try {
      const secret = await boundApi.createVoiceSession(
        conversationId,
        csrfToken,
        createRequestIdentity("voice_session"),
      );
      if (generationRef.current !== generation) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (generationRef.current !== generation) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      const peer = new RTCPeerConnection();
      const audio = document.createElement("audio");
      audio.autoplay = true;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? null;
        void audio.play().catch(() => undefined);
      };
      for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);
      const channel = peer.createDataChannel("oai-events");
      channel.addEventListener("message", (event) => handleEvent(String(event.data)));
      channel.addEventListener("close", () => {
        if (activeRef.current) {
          activeRef.current = false;
          processingRef.current = false;
          for (const track of stream.getTracks()) track.stop();
          peer.close();
          audio.pause();
          audio.srcObject = null;
          if (channelRef.current === channel) channelRef.current = undefined;
          if (peerRef.current === peer) peerRef.current = undefined;
          if (streamRef.current === stream) streamRef.current = undefined;
          if (audioRef.current === audio) audioRef.current = undefined;
          onTranscriptChangeRef.current("");
          setError("The voice connection ended. Start it again to continue.");
          updatePhase("error");
        }
      });
      streamRef.current = stream;
      peerRef.current = peer;
      channelRef.current = channel;
      audioRef.current = audio;

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answer = await fetch(REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${secret.data.value}`,
          "Content-Type": "application/sdp",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!answer.ok) throw new Error("Realtime session negotiation failed");
      await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() });
      if (channel.readyState !== "open") {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("Realtime data channel timed out")), 8_000);
          channel.addEventListener("open", () => {
            window.clearTimeout(timeout);
            resolve();
          }, { once: true });
          channel.addEventListener("close", () => {
            window.clearTimeout(timeout);
            reject(new Error("Realtime data channel closed"));
          }, { once: true });
        });
      }
      if (generationRef.current !== generation) return;
      activeRef.current = true;
      updatePhase("listening");
    } catch (caught) {
      if (generationRef.current !== generation) return;
      stop();
      const permissionDenied = caught instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(caught.name);
      setError(permissionDenied
        ? "Allow microphone access to start voice mode."
        : "Voice mode could not start. You can still type your message.");
      updatePhase("error");
    }
  }, [conversationId, csrfToken, enabled, handleEvent, stop, supported, updatePhase]);

  const toggle = useCallback(() => {
    if (phase === "error") {
      stop();
      queueMicrotask(() => void start());
    } else if (activeRef.current || phase === "connecting") stop();
    else void start();
  }, [phase, start, stop]);

  useEffect(() => stop, [conversationId, stop]);

  return {
    active: phase !== "off" && phase !== "error",
    error,
    label: voicePhaseLabel(phase),
    phase,
    speak,
    supported,
    toggle,
  };
}
