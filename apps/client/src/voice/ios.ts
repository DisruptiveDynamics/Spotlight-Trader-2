let iosUnlocked = false;
let audioContext: AudioContext | null = null;

export async function ensureiOSAudioUnlocked(): Promise<void> {
  if (iosUnlocked) return;

  try {
    // Request microphone permission on first user gesture
    await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Get or create AudioContext
    if (!audioContext) {
      audioContext = new AudioContext({ sampleRate: 24000 });
    }
    
    // Resume AudioContext (required for iOS)
    await audioContext.resume();
    
    iosUnlocked = true;
  } catch (error) {
    console.error('Failed to unlock iOS audio:', error);
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
