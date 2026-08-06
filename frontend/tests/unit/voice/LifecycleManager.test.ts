import { describe, expect, it, beforeEach } from 'vitest';
import { LifecycleManager } from '@/lib/voice/runtime/LifecycleManager';
import { VoiceEventBus } from '@/lib/voice/runtime/VoiceEventBus';
import { getVoiceRuntime, resetVoiceRuntime } from '@/lib/voice/runtime/VoiceRuntime';
import { VoiceEngine, resetVoiceEngine, getVoiceEngine } from '@/lib/voice/VoiceEngine';

describe('LifecycleManager', () => {
  let bus: VoiceEventBus;
  let lifecycle: LifecycleManager;

  beforeEach(() => {
    bus = new VoiceEventBus();
    lifecycle = new LifecycleManager(bus);
  });

  it('commits exactly one user utterance per listen cycle', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();

    const first = lifecycle.tryCommitUserUtterance('hello world', 'test');
    const second = lifecycle.tryCommitUserUtterance('hello world', 'test-dup');

    expect(first).toBe('hello world');
    expect(second).toBeNull();
    expect(lifecycle.getState()).toBe('thinking');
  });

  it('rejects duplicate utterances within dedup window', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();

    lifecycle.tryCommitUserUtterance('hello', 'a');
    lifecycle.onSendFailed();

    lifecycle.beginListenCycle();
    const dup = lifecycle.tryCommitUserUtterance('hello', 'b');
    expect(dup).toBeNull();
  });

  it('serializes VAD finalize vs recognition final', async () => {
    lifecycle.setLive(true);
    const cycleId = lifecycle.beginListenCycle();

    const finalizePromise = lifecycle.requestListenFinalize(cycleId, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'from vad';
    });

    const fromRecognition = lifecycle.onRecognitionFinal('from recognition');
    expect(fromRecognition).toBeNull();

    const committed = await finalizePromise;
    expect(committed).toBe('from vad');
    expect(lifecycle.getState()).toBe('thinking');
  });

  it('recognition final wins when VAD finalize has not started', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();

    const committed = lifecycle.onRecognitionFinal('spoken text');
    expect(committed).toBe('spoken text');
    expect(lifecycle.getState()).toBe('thinking');
  });

  it('speaks each assistant message id exactly once', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();
    lifecycle.tryCommitUserUtterance('hi', 'test');

    const first = lifecycle.tryBeginAssistantSpeak('msg-1', 'Hello there');
    const second = lifecycle.tryBeginAssistantSpeak('msg-1', 'Hello there');

    expect(first).toBe('Hello there');
    expect(second).toBeNull();
    expect(lifecycle.getState()).toBe('speaking');
  });

  it('transitions to listening after speak complete', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();
    lifecycle.tryCommitUserUtterance('hi', 'test');
    lifecycle.tryBeginAssistantSpeak('msg-1', 'Hello');
    const gen = lifecycle.getSpeakGeneration();

    lifecycle.onSpeakComplete(gen);
    expect(lifecycle.getState()).toBe('listening');
    expect(lifecycle.isBusy()).toBe(false);
  });

  it('transitions to listening after assistant reply skipped', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();
    lifecycle.tryCommitUserUtterance('hi', 'test');

    lifecycle.onAssistantReplySkipped('msg-1');
    expect(lifecycle.getState()).toBe('listening');
    expect(lifecycle.isBusy()).toBe(false);
  });

  it('allows exactly one backend send per turn', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();
    lifecycle.tryCommitUserUtterance('hello', 'test');

    expect(lifecycle.tryBeginSend()).toBe(true);
    expect(lifecycle.tryBeginSend()).toBe(false);
    lifecycle.completeSend(true);
    expect(lifecycle.tryBeginSend()).toBe(false);
  });

  it('invalidates stale speak generation on interrupt', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();
    lifecycle.tryCommitUserUtterance('hi', 'test');
    lifecycle.tryBeginAssistantSpeak('msg-1', 'Hi');
    const gen = lifecycle.getSpeakGeneration();

    lifecycle.interrupt();
    expect(lifecycle.getState()).toBe('listening');

    lifecycle.onSpeakComplete(gen);
    expect(lifecycle.getState()).toBe('listening');
  });

  it('resetSession clears commit and speak gates', () => {
    lifecycle.setLive(true);
    lifecycle.beginListenCycle();
    lifecycle.tryCommitUserUtterance('test', 'x');
    lifecycle.tryBeginAssistantSpeak('a1', 'reply');

    lifecycle.resetSession();
    expect(lifecycle.getState()).toBe('idle');
    expect(lifecycle.isBusy()).toBe(false);

    lifecycle.setLive(true);
    lifecycle.beginListenCycle();
    expect(lifecycle.tryCommitUserUtterance('test', 'y')).toBe('test');
  });
});

describe('VoiceRuntime', () => {
  beforeEach(() => {
    resetVoiceRuntime();
  });

  it('returns a stable lifecycle singleton', () => {
    const a = getVoiceRuntime().lifecycle;
    const b = getVoiceRuntime().lifecycle;
    expect(a).toBe(b);
  });
});

describe('VoiceEngine re-exports', () => {
  beforeEach(() => {
    resetVoiceEngine();
  });

  it('getVoiceEngine returns LifecycleManager', () => {
    const engine = getVoiceEngine();
    expect(engine).toBeInstanceOf(LifecycleManager);
  });
});
