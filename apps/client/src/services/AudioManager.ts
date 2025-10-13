/**
 * AudioManager - Cross-platform AudioContext management with gesture unlock
 * Handles Safari/iOS audio context suspension and unlocking
 */

let globalAudioContext: AudioContext | null = null;
let unlocked = false;

export async function ensureAudioUnlocked(): Promise<AudioContext | null> {
  try {
    // Create or reuse AudioContext
    if (!globalAudioContext) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.warn("AudioContext not supported");
        return null;
      }
      globalAudioContext = new AudioContextClass({ sampleRate: 24000 });
    }

    // Resume if suspended (Safari/iOS requirement)
    if (globalAudioContext.state === "suspended") {
      await globalAudioContext.resume();
    }

    // Play silent buffer to unlock (Safari/iOS quirk)
    if (!unlocked) {
      const buffer = globalAudioContext.createBuffer(1, 1, 22050);
      const source = globalAudioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(globalAudioContext.destination);
      source.start(0);

      // Wait for unlock
      await new Promise((resolve) => setTimeout(resolve, 50));
      unlocked = true;
    }

    return globalAudioContext;
  } catch (err) {
    console.warn("Audio unlock failed:", err);
    return null;
  }
}

export function getAudioContext(): AudioContext | null {
  return globalAudioContext;
}

export function isAudioUnlocked(): boolean {
  return unlocked && globalAudioContext?.state === "running";
}

export async function closeAudioContext(): Promise<void> {
  if (globalAudioContext) {
    await globalAudioContext.close();
    globalAudioContext = null;
    unlocked = false;
  }
}
