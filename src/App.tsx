import React, { useState, useEffect } from 'react';
import {
  Music,
  Download,
  Link as LinkIcon,
  RefreshCw,
  ExternalLink,
  Check,
  AlertCircle,
  Code2,
  Terminal,
  Sparkles,
  Play,
  Volume2,
  Clock,
  Trash2,
} from 'lucide-react';
import { AudioPlayer } from './components/AudioPlayer.tsx';
import { ApiDocs } from './components/ApiDocs.tsx';
import { ApiTester } from './components/ApiTester.tsx';
import type { ConversionResult, ProgressState, HistoryItem } from './types.ts';

const SAMPLE_VIDEOS = [
  { label: 'Me at the zoo', id: 'jNQXAC9IVRw' },
  { label: 'Lofi Study Beat', id: 'jfKfPfyJRdk' },
  { label: 'Never Gonna Give You Up', id: 'dQw4w9WgXcQ' },
  { label: 'Synthwave Night', id: '4xDzrJKXOOY' },
];

export default function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'mp3' | 'mp4'>('mp3');
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<ProgressState>({
    stage: 'idle',
    percent: 0,
    message: '',
  });
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeView, setActiveView] = useState<'converter' | 'docs' | 'tester'>('converter');
  const [serverStatus, setServerStatus] = useState<'online' | 'checking' | 'offline'>('checking');

  // Check backend server health
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'ok') setServerStatus('online');
        else setServerStatus('offline');
      })
      .catch(() => setServerStatus('offline'));

    // Load history from localStorage
    try {
      const saved = localStorage.getItem('ytmp3_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Could not load history:', e);
    }
  }, []);

  const saveToHistory = (item: HistoryItem) => {
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.videoId !== item.videoId);
      const updated = [item, ...filtered].slice(0, 10);
      try {
        localStorage.setItem('ytmp3_history', JSON.stringify(updated));
      } catch (e) {
        console.warn('Could not save history:', e);
      }
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem('ytmp3_history');
    } catch (e) {}
  };

  const handleConvert = async (targetUrl = url, targetFormat = format) => {
    if (!targetUrl.trim()) {
      setError('Please paste a YouTube video URL or ID');
      return;
    }

    setError(null);
    setIsConverting(true);
    setResult(null);
    setProgress({
      stage: 'start',
      percent: 10,
      message: 'Connecting to ytmp3.gl backend pipeline...',
    });

    try {
      // Use Server-Sent Events endpoint for real-time progress updates
      const sseUrl = `/api/convert-stream?url=${encodeURIComponent(targetUrl.trim())}&format=${targetFormat}`;
      const eventSource = new EventSource(sseUrl);

      eventSource.addEventListener('progress', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          setProgress({
            stage: data.stage || 'processing',
            percent: data.percent || 50,
            message: data.detail || 'Converting YouTube audio...',
          });
        } catch (err) {
          console.warn('SSE parse error:', err);
        }
      });

      eventSource.addEventListener('complete', (e: MessageEvent) => {
        try {
          const resData: ConversionResult = JSON.parse(e.data);
          setResult(resData);
          setProgress({
            stage: 'ready',
            percent: 100,
            message: 'Conversion completed successfully!',
          });
          setIsConverting(false);
          eventSource.close();

          saveToHistory({
            id: `${resData.videoId}-${Date.now()}`,
            videoId: resData.videoId,
            title: resData.title,
            author: resData.author,
            thumbnailUrl: resData.thumbnailUrl,
            format: resData.format,
            timestamp: Date.now(),
            streamUrl: `/api/download?url=${encodeURIComponent(resData.videoId)}&format=${resData.format}`,
          });
        } catch (err: any) {
          setError('Failed to process conversion result: ' + err.message);
          setIsConverting(false);
          eventSource.close();
        }
      });

      eventSource.addEventListener('error', (e: any) => {
        console.warn('SSE error or closed:', e);
        // Fallback to standard POST request if SSE stream closed with an error
        if (eventSource.readyState === EventSource.CLOSED && !result) {
          eventSource.close();
          fallbackConvert(targetUrl, targetFormat);
        }
      });
    } catch (err: any) {
      console.error('SSE setup error, falling back:', err);
      fallbackConvert(targetUrl, targetFormat);
    }
  };

  const fallbackConvert = async (targetUrl: string, targetFormat: 'mp3' | 'mp4') => {
    try {
      setProgress({
        stage: 'processing',
        percent: 45,
        message: 'Calling ytmp3.gl API service...',
      });

      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim(), format: targetFormat }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to convert video');
      }

      setResult(data);
      setProgress({
        stage: 'ready',
        percent: 100,
        message: 'Conversion completed!',
      });
      setIsConverting(false);

      saveToHistory({
        id: `${data.videoId}-${Date.now()}`,
        videoId: data.videoId,
        title: data.title,
        author: data.author,
        thumbnailUrl: data.thumbnailUrl,
        format: data.format,
        timestamp: Date.now(),
        streamUrl: `/api/download?url=${encodeURIComponent(data.videoId)}&format=${data.format}`,
      });
    } catch (err: any) {
      setError(err.message || 'Conversion failed. Please check the URL and try again.');
      setIsConverting(false);
      setProgress({ stage: 'error', percent: 0, message: '' });
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrl(text);
        setError(null);
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
    }
  };

  const handleCopyStreamLink = () => {
    if (!result) return;
    const origin = window.location.origin;
    const directUrl = `${origin}${result.streamUrl}`;
    navigator.clipboard.writeText(directUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col antialiased selection:bg-amber-500 selection:text-stone-950">
      {/* Top Navigation Bar */}
      <header className="border-b border-stone-800/80 bg-stone-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-stone-950 shadow-md">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-100 tracking-tight text-base sm:text-lg">
                  YTMP3 <span className="text-amber-500 font-mono text-sm font-normal">Node.js API</span>
                </span>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-stone-800/80 text-stone-400 border border-stone-700">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      serverStatus === 'online'
                        ? 'bg-emerald-400 animate-pulse'
                        : serverStatus === 'checking'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  {serverStatus === 'online' ? 'API Online' : serverStatus === 'checking' ? 'Connecting...' : 'Offline'}
                </span>
              </div>
              <p className="text-[11px] text-stone-400 hidden sm:block">
                Calls ytmp3.gl protocol directly to extract and stream MP3 audio
              </p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1 bg-stone-900 p-1 rounded-xl border border-stone-800 text-xs font-medium">
            <button
              id="nav-btn-converter"
              onClick={() => setActiveView('converter')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeView === 'converter'
                  ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Music className="w-3.5 h-3.5" />
              Converter
            </button>
            <button
              id="nav-btn-docs"
              onClick={() => setActiveView('docs')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeView === 'docs'
                  ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              API Docs
            </button>
            <button
              id="nav-btn-tester"
              onClick={() => setActiveView('tester')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeView === 'tester'
                  ? 'bg-amber-500 text-stone-950 font-semibold shadow-sm'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              Console
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {activeView === 'converter' && (
          <div className="space-y-8">
            {/* Hero / Input Box */}
            <div className="text-center max-w-2xl mx-auto space-y-3 mb-8">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-stone-100 tracking-tight">
                YouTube to MP3 Converter
              </h1>
              <p className="text-stone-400 text-sm sm:text-base leading-relaxed">
                Enter any YouTube video link or ID. The Node.js server authenticates with{' '}
                <a
                  href="https://ytmp3.gl/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 underline underline-offset-4 hover:text-amber-300 inline-flex items-center gap-1"
                >
                  ytmp3.gl <ExternalLink className="w-3 h-3" />
                </a>{' '}
                and downloads the converted MP3 file.
              </p>
            </div>

            {/* Input Card */}
            <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-4 sm:p-6 shadow-2xl backdrop-blur-sm">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleConvert();
                }}
                className="space-y-4"
              >
                {/* Input row */}
                <div className="relative flex items-center">
                  <div className="absolute left-4 text-stone-500 pointer-events-none">
                    <LinkIcon className="w-5 h-5" />
                  </div>
                  <input
                    id="input-youtube-url"
                    type="text"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=...)"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-12 pr-28 sm:pr-32 py-3.5 text-sm sm:text-base text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                  />
                  <div className="absolute right-2.5 flex items-center gap-1.5">
                    {url && (
                      <button
                        type="button"
                        id="btn-clear-url"
                        onClick={() => setUrl('')}
                        className="px-2 py-1 text-xs text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded transition-colors"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      id="btn-paste-url"
                      onClick={handlePaste}
                      className="px-2.5 py-1 text-xs font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors border border-stone-700"
                    >
                      Paste
                    </button>
                  </div>
                </div>

                {/* Format selection and Quick samples */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-400 font-medium">Format:</span>
                    <div className="inline-flex bg-stone-950 p-1 rounded-lg border border-stone-800">
                      <button
                        type="button"
                        id="btn-format-mp3"
                        onClick={() => setFormat('mp3')}
                        className={`px-3 py-1 text-xs rounded font-medium transition-all ${
                          format === 'mp3'
                            ? 'bg-amber-500 text-stone-950 font-bold'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        MP3 (Audio)
                      </button>
                      <button
                        type="button"
                        id="btn-format-mp4"
                        onClick={() => setFormat('mp4')}
                        className={`px-3 py-1 text-xs rounded font-medium transition-all ${
                          format === 'mp4'
                            ? 'bg-amber-500 text-stone-950 font-bold'
                            : 'text-stone-400 hover:text-stone-200'
                        }`}
                      >
                        MP4 (Video)
                      </button>
                    </div>
                  </div>

                  {/* Sample buttons */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-stone-500 mr-1">Samples:</span>
                    {SAMPLE_VIDEOS.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        id={`btn-sample-${sample.id}`}
                        onClick={() => {
                          setUrl(`https://www.youtube.com/watch?v=${sample.id}`);
                          handleConvert(`https://www.youtube.com/watch?v=${sample.id}`, format);
                        }}
                        className="text-[11px] font-mono px-2.5 py-1 bg-stone-950 hover:bg-stone-800 text-stone-400 hover:text-stone-200 rounded-md border border-stone-800/80 transition-colors"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    id="btn-convert-submit"
                    disabled={isConverting}
                    className="w-full py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500 text-stone-950 font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/10 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isConverting ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Converting YouTube Video via ytmp3.gl...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Convert to {format.toUpperCase()}
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Progress bar and status */}
              {isConverting && (
                <div className="mt-6 p-4 rounded-xl bg-stone-950 border border-stone-800 space-y-2">
                  <div className="flex justify-between text-xs font-mono text-stone-300">
                    <span className="flex items-center gap-2 font-medium">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                      {progress.message || 'Processing...'}
                    </span>
                    <span className="text-amber-400 font-bold">{progress.percent}%</span>
                  </div>
                  <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-500 to-amber-400 h-full transition-all duration-300"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Error box */}
              {error && (
                <div className="mt-4 p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Conversion Error</p>
                    <p className="text-xs text-rose-300/90 mt-0.5">{error}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Conversion Result Card */}
            {result && (
              <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-stone-800 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                    <span className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-semibold">
                      Conversion Complete
                    </span>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono uppercase">
                    {result.format} format
                  </span>
                </div>

                <div className="flex flex-col md:flex-row gap-6 items-start">
                  {/* Thumbnail */}
                  <div className="w-full md:w-56 aspect-video bg-stone-950 rounded-xl overflow-hidden relative shrink-0 border border-stone-800 shadow-md">
                    <img
                      src={result.thumbnailUrl}
                      alt={result.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-[11px] font-mono text-stone-300 truncate">ID: {result.videoId}</p>
                    </div>
                  </div>

                  {/* Details & Actions */}
                  <div className="flex-1 space-y-4 w-full">
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-stone-100 leading-snug">
                        {result.title}
                      </h3>
                      <p className="text-xs text-stone-400 mt-1">Channel: {result.author}</p>
                    </div>

                    {/* Audio Player for in-browser playback */}
                    {result.format === 'mp3' && (
                      <AudioPlayer
                        src={`/api/download?url=${encodeURIComponent(result.videoId)}&format=mp3`}
                        title={result.title}
                        author={result.author}
                      />
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 pt-1">
                      <a
                        id="btn-download-file"
                        href={`/api/download?url=${encodeURIComponent(result.videoId)}&format=${result.format}`}
                        download
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-sm flex items-center gap-2 transition-all shadow-md shadow-amber-500/10"
                      >
                        <Download className="w-4 h-4" />
                        Download {result.format.toUpperCase()}
                      </a>

                      <button
                        id="btn-copy-stream-url"
                        onClick={handleCopyStreamLink}
                        className="px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium rounded-xl text-xs flex items-center gap-2 transition-colors border border-stone-700"
                      >
                        {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <LinkIcon className="w-4 h-4" />}
                        {copiedLink ? 'API Link Copied!' : 'Copy API Stream URL'}
                      </button>

                      <a
                        id="btn-open-ytmp3-direct"
                        href={result.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2.5 bg-stone-950 hover:bg-stone-800 text-stone-400 hover:text-stone-200 font-medium rounded-xl text-xs flex items-center gap-2 transition-colors border border-stone-800"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Upstream CDN Link
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Conversion History */}
            {history.length > 0 && (
              <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                  <div className="flex items-center gap-2 text-stone-300 font-semibold text-sm">
                    <Clock className="w-4 h-4 text-amber-500" />
                    Recent Conversions ({history.length})
                  </div>
                  <button
                    id="btn-clear-history"
                    onClick={clearHistory}
                    className="text-xs text-stone-500 hover:text-rose-400 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-stone-950 rounded-xl border border-stone-800/80 flex items-center gap-3 hover:border-stone-700 transition-all"
                    >
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className="w-16 h-12 rounded-lg object-cover bg-stone-900 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-stone-200 truncate">{item.title}</p>
                        <p className="text-[11px] text-stone-500 truncate">{item.author}</p>
                      </div>
                      <a
                        href={item.streamUrl}
                        download
                        className="p-2 bg-stone-800 hover:bg-amber-500 hover:text-stone-950 text-stone-300 rounded-lg transition-colors shrink-0"
                        title="Download MP3"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Preview of API Usage */}
            <div className="border-t border-stone-800/80 pt-8">
              <ApiDocs currentVideoId={result?.videoId || 'jNQXAC9IVRw'} currentTitle={result?.title || 'Me at the zoo'} />
            </div>
          </div>
        )}

        {activeView === 'docs' && (
          <div className="space-y-6">
            <ApiDocs currentVideoId={result?.videoId || 'jNQXAC9IVRw'} currentTitle={result?.title || 'Me at the zoo'} />
          </div>
        )}

        {activeView === 'tester' && (
          <div className="space-y-6">
            <ApiTester />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-stone-900/40 py-6 text-center text-xs text-stone-500">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>Node.js API wrapper interacting with ytmp3.gl protocol</p>
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <a href="/api/spec" target="_blank" className="hover:text-amber-400 transition-colors">
              OpenAPI Spec JSON
            </a>
            <span>•</span>
            <a href="/api/health" target="_blank" className="hover:text-amber-400 transition-colors">
              Health Check
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
