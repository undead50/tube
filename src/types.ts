export interface ConversionResult {
  success: boolean;
  videoId: string;
  format: 'mp3' | 'mp4';
  title: string;
  author: string;
  thumbnailUrl: string;
  downloadUrl: string;
  streamUrl: string;
  directStreamUrl?: string;
  error?: string;
}

export interface ProgressState {
  stage: 'idle' | 'start' | 'info' | 'auth' | 'init' | 'convert' | 'processing' | 'ready' | 'error';
  percent: number;
  message: string;
}

export interface HistoryItem {
  id: string;
  videoId: string;
  title: string;
  author: string;
  thumbnailUrl: string;
  format: 'mp3' | 'mp4';
  timestamp: number;
  streamUrl: string;
}
