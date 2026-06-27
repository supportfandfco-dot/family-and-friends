// ═══════════════════════════════════════════════════════
//  useLiveKitRoom — Core LiveKit room lifecycle hook.
//  Handles: connect, disconnect, reconnect, device swap,
//  network changes. Used by all LiveKit features.
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room, RoomEvent, ConnectionState,
  createLocalAudioTrack, Track,
} from 'livekit-client';
import { LIVEKIT_CONFIG } from './livekitConfig';
import { fetchLiveKitToken } from './livekitToken';

export const RoomStatus = {
  IDLE:         'idle',
  CONNECTING:   'connecting',
  CONNECTED:    'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  FAILED:       'failed',
};

export default function useLiveKitRoom() {
  const roomRef              = useRef(null);
  const [status, setStatus]  = useState(RoomStatus.IDLE);
  const [error, setError]    = useState(null);
  const [participants, setParticipants] = useState([]);
  const [localAudioTrack, setLocalAudioTrack] = useState(null);
  const reconnectTimerRef    = useRef(null);
  const sessionRef           = useRef(null); // { roomName, identity, name }

  // ── Build room instance ──────────────────────────────
  const createRoom = useCallback(() => {
    const room = new Room({
      adaptiveStream:    true,  // auto-adjust quality to network
      dynacast:          true,  // only publish at consumed quality
      reconnectPolicy: {
        maxRetries: 10,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
      },
    });

    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected)    setStatus(RoomStatus.CONNECTED);
      if (state === ConnectionState.Reconnecting) setStatus(RoomStatus.RECONNECTING);
      if (state === ConnectionState.Disconnected) setStatus(RoomStatus.DISCONNECTED);
    });

    room.on(RoomEvent.ParticipantConnected,    () => setParticipants([...room.remoteParticipants.values()]));
    room.on(RoomEvent.ParticipantDisconnected, () => setParticipants([...room.remoteParticipants.values()]));
    room.on(RoomEvent.Reconnected, () => {
      setStatus(RoomStatus.CONNECTED);
      setError(null);
    });

    return room;
  }, []);

  // ── Connect ──────────────────────────────────────────
  const connect = useCallback(async (roomName, identity, name) => {
    setStatus(RoomStatus.CONNECTING);
    setError(null);
    sessionRef.current = { roomName, identity, name };

    try {
      const { token, url } = await fetchLiveKitToken(roomName, identity, name);

      // Disconnect previous room if any
      if (roomRef.current) {
        await roomRef.current.disconnect();
      }

      const room = createRoom();
      roomRef.current = room;

      // Race connection against timeout
      const connectPromise = room.connect(url, token, {
        autoSubscribe: true,
        publishDefaults: {
          audioPreset: { maxBitrate: 32_000 }, // 32kbps — voice optimised
          simulcast:   false,
        },
      });

      const timeoutPromise = new Promise((_, rej) =>
        setTimeout(() => rej(new Error('Connection timed out')), LIVEKIT_CONFIG.connectTimeoutMs)
      );

      await Promise.race([connectPromise, timeoutPromise]);

      // Publish microphone with voice-optimised constraints
      const audioTrack = await createLocalAudioTrack(LIVEKIT_CONFIG.audioConstraints);
      await room.localParticipant.publishTrack(audioTrack);
      setLocalAudioTrack(audioTrack);
      setParticipants([...room.remoteParticipants.values()]);
    } catch (err) {
      setStatus(RoomStatus.FAILED);
      setError(err.message);
    }
  }, [createRoom]);

  // ── Disconnect ───────────────────────────────────────
  const disconnect = useCallback(async () => {
    clearTimeout(reconnectTimerRef.current);
    if (localAudioTrack) { try { localAudioTrack.stop(); } catch {} }
    if (roomRef.current) {
      try { await roomRef.current.disconnect(); } catch {}
      roomRef.current = null;
    }
    setLocalAudioTrack(null);
    setParticipants([]);
    setStatus(RoomStatus.IDLE);
    setError(null);
    sessionRef.current = null;
  }, [localAudioTrack]);

  // ── Mute toggle ──────────────────────────────────────
  const setMuted = useCallback(async (muted) => {
    if (!roomRef.current) return;
    const pub = roomRef.current.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (pub) muted ? await pub.mute() : await pub.unmute();
  }, []);

  // ── Hot-swap microphone ──────────────────────────────
  const switchMicrophone = useCallback(async (deviceId) => {
    if (!roomRef.current) return;
    await roomRef.current.switchActiveDevice('audioinput', deviceId);
  }, []);

  // ── Network change — attempt reconnect ───────────────
  useEffect(() => {
    const handleOnline = () => {
      if (status === RoomStatus.DISCONNECTED && sessionRef.current) {
        const { roomName, identity, name } = sessionRef.current;
        connect(roomName, identity, name);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [status, connect]);

  // ── Cleanup on unmount ───────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (localAudioTrack) try { localAudioTrack.stop(); } catch {}
      if (roomRef.current) try { roomRef.current.disconnect(); } catch {}
    };
  }, []);

  return {
    room: roomRef.current,
    status,
    error,
    participants,
    localAudioTrack,
    connect,
    disconnect,
    setMuted,
    switchMicrophone,
  };
}
