let iosUnlocked = false;
let audioContext: AudioContext | null = null;

export async function ensureiOSAudioUnlocked(): Promise<void> {
  if (iosUnlocked) return;

  try {
    // Get or create AudioContext FIRST (before mic request)
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 24000 });
    }

    // Resume AudioContext (required for iOS)
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // Play silent buffer to unlock (iOS Safari quirk)
    const buffer = audioContext.createBuffer(1, 1, 22050);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);

    // Wait for playback to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    iosUnlocked = true;
    console.log("[iOS] Audio context unlocked successfully");
  } catch (error) {
    console.error("Failed to unlock iOS audio:", error);
    throw error;
  }
}

export function getOrCreateAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 24000 });
  }
  return audioContext;
}

export function isIOSUnlocked(): boolean {
  return iosUnlocked;
}
