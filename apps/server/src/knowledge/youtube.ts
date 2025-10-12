import { YoutubeTranscript } from 'youtube-transcript';

export interface YouTubeTranscriptResult {
  text: string;
  title: string;
  duration: number;
}

/**
 * Extract transcript from YouTube video URL
 * Supports various YouTube URL formats
 */
export async function extractYouTubeTranscript(url: string): Promise<YouTubeTranscriptResult> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript available for this video');
    }

    // Combine all transcript segments
    const text = transcript.map(segment => segment.text).join(' ');
    
    // Estimate duration from last segment
    const duration = transcript[transcript.length - 1]?.offset || 0;

    return {
      text,
      title: `YouTube Video ${videoId}`,
      duration: Math.floor(duration / 1000), // Convert ms to seconds
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to extract YouTube transcript: ${error.message}`);
    }
    throw new Error('Failed to extract YouTube transcript');
  }
}

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Validate if URL is a YouTube URL
 */
export function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}
