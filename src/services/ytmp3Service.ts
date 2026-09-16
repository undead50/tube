import type { Response } from 'express';

export interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
}

export interface ConvertResult {
  success: boolean;
  videoId: string;
  format: 'mp3' | 'mp4';
  title: string;
  author: string;
  thumbnailUrl: string;
  downloadUrl: string;
  streamUrl: string;
  duration?: number;
}

const DEFAULT_API_KEY = '9b0ed5dab31616027ad7154140b0272d';
const ENDPOINT_DOMAIN = 'gammacloud.net';
let cachedApiKey: { key: string; expiresAt: number } | null = null;

/**
 * Extracts YouTube video ID from various formats:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - https://www.youtube.com/embed/dQw4w9WgXcQ
 * - https://music.youtube.com/watch?v=dQw4w9WgXcQ
 * - Raw 11-character video ID
 */
export function extractYouTubeId(urlOrId: string): string | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const trimmed = urlOrId.trim();

  // If already an 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Regex matching standard YouTube patterns
  const match = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/.exec(trimmed);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

/**
 * Fetch video title, author, and thumbnail via YouTube's public oEmbed API
 */
export async function getYouTubeInfo(videoId: string): Promise<VideoInfo> {
  const defaultInfo: VideoInfo = {
    videoId,
    title: `YouTube Video (${videoId})`,
    author: 'YouTube Creator',
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        videoId,
        title: data.title || defaultInfo.title,
        author: data.author_name || defaultInfo.author,
        thumbnailUrl: data.thumbnail_url || defaultInfo.thumbnailUrl,
      };
    }
  } catch (err) {
    console.warn(`[getYouTubeInfo] Failed to fetch oEmbed for ${videoId}:`, err);
  }

  return defaultInfo;
}

/**
 * Scrapes or retrieves dynamic apiKey from ytmp3.gl
 */
export async function getApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && cachedApiKey.expiresAt > now) {
    return cachedApiKey.key;
  }

  try {
    const res = await fetch('https://ytmp3.gl/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (res.ok) {
      const html = await res.text();
      const match = /var\s+apiKey\s*=\s*['"]([a-f0-9]{32})['"]/i.exec(html);
      if (match && match[1]) {
        cachedApiKey = {
          key: match[1],
          expiresAt: now + 60 * 60 * 1000, // cache for 1 hour
        };
        return cachedApiKey.key;
      }
    }
  } catch (err) {
    console.warn('[getApiKey] Error fetching key from ytmp3.gl, falling back to default:', err);
  }

  return DEFAULT_API_KEY;
}

const COMMON_HEADERS = {
  'Referer': 'https://ytmp3.gl/',
  'Origin': 'https://ytmp3.gl',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
};

export type ProgressCallback = (stage: string, percent: number, detail?: string) => void;

/**
 * Full conversion flow calling ytmp3.gl backend services
 */
export async function convertYouTubeToMp3(
  urlOrId: string,
  format: 'mp3' | 'mp4' = 'mp3',
  onProgress?: ProgressCallback
): Promise<ConvertResult> {
  const videoId = extractYouTubeId(urlOrId);
  if (!videoId) {
    throw new Error('Invalid YouTube URL or Video ID. Please provide a valid YouTube link.');
  }

  onProgress?.('info', 10, 'Fetching video information...');
  const videoInfo = await getYouTubeInfo(videoId);

  onProgress?.('auth', 25, 'Authenticating with ytmp3 service...');
  const apiKey = await getApiKey();

  const authUrl = `https://gamma.${ENDPOINT_DOMAIN}/api/v1/auth?api_key=${apiKey}&_=${Date.now()}`;
  const authRes = await fetch(authUrl, { headers: COMMON_HEADERS });
  if (!authRes.ok) {
    throw new Error(`ytmp3.gl auth failed with status ${authRes.status}`);
  }
  const authData = await authRes.json() as { key?: string; err?: number; error?: number };
  if (authData.err && authData.err > 0) {
    throw new Error(`ytmp3.gl auth returned error code ${authData.err}`);
  }
  if (!authData.key) {
    throw new Error('ytmp3.gl auth token not received');
  }

  onProgress?.('init', 40, 'Initializing conversion pipeline...');
  const initUrl = `https://gamma.${ENDPOINT_DOMAIN}/api/v1/init?_=${Date.now()}`;
  const initRes = await fetch(initUrl, {
    headers: {
      ...COMMON_HEADERS,
      'Authorization': `Bearer ${authData.key}`,
    },
  });
  if (!initRes.ok) {
    throw new Error(`ytmp3.gl init failed with status ${initRes.status}`);
  }
  const initData = await initRes.json() as { convertURL?: string; error?: string | number };
  if (!initData.convertURL) {
    throw new Error('ytmp3.gl failed to provide convertURL');
  }

  onProgress?.('convert', 55, 'Submitting video to conversion cluster...');
  let convertUrl = initData.convertURL;
  if (convertUrl.includes('&v=')) {
    convertUrl = convertUrl.split('&v=')[0];
  }

  const convReqUrl = `${convertUrl}&v=${videoId}&f=${format}&_=${Date.now()}`;
  const convRes = await fetch(convReqUrl, { headers: COMMON_HEADERS });
  if (!convRes.ok) {
    throw new Error(`ytmp3.gl convert request failed with status ${convRes.status}`);
  }
  let convData = await convRes.json() as {
    error?: number;
    redirect?: number;
    redirectURL?: string;
    progressURL?: string;
    downloadURL?: string;
    title?: string;
  };

  if (convData.error && convData.error > 0) {
    throw new Error(`Conversion error: code ${convData.error}`);
  }

  // Handle redirect if present
  if (convData.redirect === 1 && convData.redirectURL) {
    onProgress?.('redirect', 65, 'Routing to optimal download server...');
    let redirectUrl = convData.redirectURL;
    if (redirectUrl.includes('&v=')) {
      redirectUrl = redirectUrl.split('&v=')[0];
    }
    const redRes = await fetch(`${redirectUrl}&v=${videoId}&f=${format}&_=${Date.now()}`, {
      headers: COMMON_HEADERS,
    });
    if (!redRes.ok) {
      throw new Error(`ytmp3.gl redirect request failed with status ${redRes.status}`);
    }
    convData = await redRes.json();
    if (convData.error && convData.error > 0) {
      throw new Error(`Conversion error after redirect: code ${convData.error}`);
    }
  }

  let finalDownloadBase = convData.downloadURL || '';
  let finalTitle = convData.title || videoInfo.title;

  // If progressURL exists and progress is needed
  if (convData.progressURL) {
    onProgress?.('processing', 75, 'Extracting and encoding MP3 audio...');
    const maxPollAttempts = 30; // up to 60s
    let attempt = 0;
    let isReady = false;

    while (attempt < maxPollAttempts && !isReady) {
      attempt++;
      await new Promise((r) => setTimeout(r, 2000));
      const pollRes = await fetch(`${convData.progressURL}&_=${Date.now()}`, {
        headers: COMMON_HEADERS,
      });

      if (pollRes.ok) {
        const pollData = await pollRes.json() as { progress?: number; error?: number; title?: string };
        if (pollData.title) {
          finalTitle = pollData.title;
        }
        if (pollData.error && pollData.error > 0) {
          throw new Error(`Conversion failed with error code: ${pollData.error}`);
        }

        const pct = Math.min(95, 75 + Math.round((pollData.progress || 0) * 6));
        onProgress?.('processing', pct, `Encoding track: progress step ${pollData.progress || 0}...`);

        if (pollData.progress !== undefined && pollData.progress >= 3) {
          isReady = true;
          break;
        }
      }
    }
  }

  if (!finalDownloadBase) {
    throw new Error('ytmp3.gl did not supply a downloadURL');
  }

  const fullDownloadUrl = `${finalDownloadBase}&v=${videoId}&f=${format}&r=ytmp3.gl`;
  onProgress?.('ready', 100, 'Audio conversion complete!');

  return {
    success: true,
    videoId,
    format,
    title: finalTitle || videoInfo.title,
    author: videoInfo.author,
    thumbnailUrl: videoInfo.thumbnailUrl,
    downloadUrl: fullDownloadUrl,
    streamUrl: `/api/download?url=${encodeURIComponent(videoId)}&format=${format}`,
  };
}

/**
 * Stream binary audio directly from the ytmp3 downloadURL to the Express response
 */
export async function streamMediaFile(
  downloadUrl: string,
  title: string,
  format: 'mp3' | 'mp4',
  res: Response
): Promise<void> {
  const upstreamRes = await fetch(downloadUrl, {
    headers: COMMON_HEADERS,
  });

  if (!upstreamRes.ok) {
    throw new Error(`Upstream server returned error status ${upstreamRes.status}`);
  }

  const contentType = format === 'mp4' ? 'video/mp4' : 'audio/mpeg';
  const cleanTitle = (title || 'audio')
    .replace(/[^\w\s.-]/gi, '')
    .trim() || 'youtube-audio';
  const filename = `${cleanTitle}.${format}`;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

  const contentLength = upstreamRes.headers.get('content-length');
  if (contentLength) {
    res.setHeader('Content-Length', contentLength);
  }

  // Node 18+ Web ReadableStream to Express response
  if (upstreamRes.body) {
    const { Readable } = await import('stream');
    // Convert Web ReadableStream to Node.js Readable
    const nodeStream = Readable.fromWeb(upstreamRes.body as any);
    nodeStream.pipe(res);
  } else {
    const arrayBuf = await upstreamRes.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  }
}
