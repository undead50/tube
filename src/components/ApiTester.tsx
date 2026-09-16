import React, { useState } from 'react';
import { Play, Copy, Check, Loader2, Sparkles } from 'lucide-react';

export const ApiTester: React.FC = () => {
  const [endpoint, setEndpoint] = useState<'/api/convert' | '/api/info' | '/api/health'>('/api/convert');
  const [method, setMethod] = useState<'POST' | 'GET'>('POST');
  const [urlParam, setUrlParam] = useState('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  const [formatParam, setFormatParam] = useState<'mp3' | 'mp4'>('mp3');
  const [isLoading, setIsLoading] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [responseBody, setResponseBody] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleEndpointChange = (ep: '/api/convert' | '/api/info' | '/api/health') => {
    setEndpoint(ep);
    if (ep === '/api/info' || ep === '/api/health') {
      setMethod('GET');
    } else {
      setMethod('POST');
    }
  };

  const handleExecute = async () => {
    setIsLoading(true);
    setResponseBody(null);
    setResponseStatus(null);
    setResponseTime(null);

    const start = performance.now();
    try {
      let res: Response;
      if (endpoint === '/api/convert') {
        if (method === 'POST') {
          res = await fetch('/api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: urlParam, format: formatParam }),
          });
        } else {
          res = await fetch(`/api/convert?url=${encodeURIComponent(urlParam)}&format=${formatParam}`);
        }
      } else if (endpoint === '/api/info') {
        res = await fetch(`/api/info?url=${encodeURIComponent(urlParam)}`);
      } else {
        res = await fetch('/api/health');
      }

      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      setResponseStatus(res.status);

      const json = await res.json();
      setResponseBody(JSON.stringify(json, null, 2));
    } catch (err: any) {
      const elapsed = Math.round(performance.now() - start);
      setResponseTime(elapsed);
      setResponseStatus(500);
      setResponseBody(JSON.stringify({ error: err.message || 'Network error' }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!responseBody) return;
    navigator.clipboard.writeText(responseBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl text-stone-200">
      <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-5">
        <div>
          <h2 className="text-xl font-semibold text-stone-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Live API Console
          </h2>
          <p className="text-sm text-stone-400 mt-0.5">
            Test and inspect Node API requests directly in real-time
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
        <div className="md:col-span-3">
          <label className="block text-xs font-mono text-stone-400 mb-1.5 uppercase font-medium">Endpoint</label>
          <select
            id="select-api-endpoint"
            value={endpoint}
            onChange={(e) => handleEndpointChange(e.target.value as any)}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
          >
            <option value="/api/convert">/api/convert (Convert & Metadata)</option>
            <option value="/api/info">/api/info (Quick Metadata)</option>
            <option value="/api/health">/api/health (Health check)</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-mono text-stone-400 mb-1.5 uppercase font-medium">Method</label>
          <select
            id="select-api-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            disabled={endpoint === '/api/info' || endpoint === '/api/health'}
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          >
            <option value="POST">POST</option>
            <option value="GET">GET</option>
          </select>
        </div>

        {endpoint !== '/api/health' && (
          <div className="md:col-span-5">
            <label className="block text-xs font-mono text-stone-400 mb-1.5 uppercase font-medium">YouTube URL / ID</label>
            <input
              id="input-api-url"
              type="text"
              value={urlParam}
              onChange={(e) => setUrlParam(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
            />
          </div>
        )}

        {endpoint === '/api/convert' && (
          <div className="md:col-span-2">
            <label className="block text-xs font-mono text-stone-400 mb-1.5 uppercase font-medium">Format</label>
            <select
              id="select-api-format"
              value={formatParam}
              onChange={(e) => setFormatParam(e.target.value as any)}
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="mp3">MP3</option>
              <option value="mp4">MP4</option>
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-4">
        <button
          id="btn-send-api-request"
          onClick={handleExecute}
          disabled={isLoading}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-stone-800 disabled:text-stone-500 text-stone-950 font-semibold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Calling ytmp3.gl API...
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              Send Request
            </>
          )}
        </button>

        {responseStatus !== null && (
          <div className="flex items-center gap-3 text-xs font-mono">
            <span
              className={`px-2 py-0.5 rounded font-semibold ${
                responseStatus >= 200 && responseStatus < 300
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}
            >
              Status: {responseStatus}
            </span>
            {responseTime !== null && <span className="text-stone-400">{responseTime}ms</span>}
          </div>
        )}
      </div>

      {responseBody && (
        <div className="relative">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-mono uppercase text-stone-400">Response Payload (JSON)</span>
            <button
              id="btn-copy-api-response"
              onClick={handleCopy}
              className="text-xs flex items-center gap-1.5 text-stone-400 hover:text-stone-200 bg-stone-800/80 px-2.5 py-1 rounded-md border border-stone-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="p-4 bg-stone-950 rounded-xl font-mono text-xs text-stone-300 overflow-x-auto border border-stone-800 max-h-72">
            <code>{responseBody}</code>
          </pre>
        </div>
      )}
    </div>
  );
};
