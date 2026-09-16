import React, { useState } from 'react';
import { Copy, Check, Terminal, Code2, Cpu, Globe } from 'lucide-react';

interface ApiDocsProps {
  currentVideoId?: string;
  currentTitle?: string;
}

export const ApiDocs: React.FC<ApiDocsProps> = ({ currentVideoId = 'jNQXAC9IVRw', currentTitle = 'Me at the zoo' }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'node' | 'curl' | 'python' | 'spec'>('node');

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const sampleUrl = `https://www.youtube.com/watch?v=${currentVideoId}`;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const nodeCode = `// Node.js script: Download YouTube video as MP3 via the local API
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

async function downloadYouTubeMp3(youtubeUrl, outputPath = 'download.mp3') {
  console.log(\`1. Requesting MP3 for \${youtubeUrl}...\`);

  // Call the Node API endpoint
  const apiUrl = \`${origin}/api/download?url=\${encodeURIComponent(youtubeUrl)}&format=mp3\`;
  const response = await fetch(apiUrl);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(\`Failed with status \${response.status}: \${errorText}\`);
  }

  // Stream directly to local MP3 file
  const fileStream = fs.createWriteStream(outputPath);
  const nodeReadable = Readable.fromWeb(response.body);
  await pipeline(nodeReadable, fileStream);

  console.log(\`✓ Download completed successfully: \${outputPath}\`);
}

// Example execution
downloadYouTubeMp3('${sampleUrl}', '${currentTitle.replace(/[^a-zA-Z0-9]/g, '_')}.mp3');
`;

  const nodeDirectYtmp3Code = `// Pure Node.js script directly orchestrating the ytmp3.gl backend protocol
async function callYtmp3Directly(videoId) {
  const headers = {
    'Referer': 'https://ytmp3.gl/',
    'Origin': 'https://ytmp3.gl',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  };

  // 1. Authenticate with ytmp3 gamma service
  const apiKey = '9b0ed5dab31616027ad7154140b0272d';
  const authRes = await fetch(\`https://gamma.gammacloud.net/api/v1/auth?api_key=\${apiKey}&_=\${Date.now()}\`, { headers });
  const auth = await authRes.json();

  // 2. Initialize conversion session
  const initRes = await fetch(\`https://gamma.gammacloud.net/api/v1/init?_=\${Date.now()}\`, {
    headers: { ...headers, 'Authorization': \`Bearer \${auth.key}\` }
  });
  const init = await initRes.json();

  // 3. Trigger conversion for the target YouTube video
  const convUrl = init.convertURL.split('&v=')[0];
  const convRes = await fetch(\`\${convUrl}&v=\${videoId}&f=mp3&_=\${Date.now()}\`, { headers });
  let conv = await convRes.json();

  if (conv.redirect) {
    const redUrl = conv.redirectURL.split('&v=')[0];
    const redRes = await fetch(\`\${redUrl}&v=\${videoId}&f=mp3&_=\${Date.now()}\`, { headers });
    conv = await redRes.json();
  }

  // 4. Poll progress if required
  if (conv.progressURL) {
    while (true) {
      const pollRes = await fetch(\`\${conv.progressURL}&_=\${Date.now()}\`, { headers });
      const poll = await pollRes.json();
      if (poll.progress >= 3 || poll.error) break;
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // 5. Final MP3 direct download link
  const downloadUrl = \`\${conv.downloadURL}&v=\${videoId}&f=mp3&r=ytmp3.gl\`;
  console.log('Direct MP3 Download Link:', downloadUrl);
  return downloadUrl;
}

callYtmp3Directly('${currentVideoId}');
`;

  const curlCode = `# 1. Download MP3 directly to a file:
curl -L -o "song.mp3" "${origin}/api/download?url=${encodeURIComponent(sampleUrl)}"

# 2. Or query JSON conversion metadata (title, thumbnail, streamUrl, downloadUrl):
curl -X POST "${origin}/api/convert" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"${sampleUrl}","format":"mp3"}'

# 3. Quick GET conversion endpoint:
curl "${origin}/api/convert?url=${encodeURIComponent(sampleUrl)}"
`;

  const pythonCode = `import requests

def download_mp3(youtube_url, filename="download.mp3"):
    api_url = f"${origin}/api/download"
    params = {"url": youtube_url, "format": "mp3"}

    print(f"Downloading MP3 for {youtube_url}...")
    with requests.get(api_url, params=params, stream=True) as r:
        r.raise_for_status()
        with open(filename, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    print(f"✓ Saved to {filename}")

download_mp3("${sampleUrl}", "${currentTitle.replace(/[^a-zA-Z0-9]/g, '_')}.mp3")
`;

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl text-stone-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold text-stone-100 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-amber-500" />
            API Reference & Integration Guide
          </h2>
          <p className="text-sm text-stone-400 mt-1">
            Programmatic endpoints and scripts to convert and download MP3s directly via Node.js
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-stone-950 p-1 rounded-xl border border-stone-800 text-xs font-medium">
          <button
            id="tab-btn-node"
            onClick={() => setActiveTab('node')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'node' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Node.js
          </button>
          <button
            id="tab-btn-curl"
            onClick={() => setActiveTab('curl')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'curl' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            cURL
          </button>
          <button
            id="tab-btn-python"
            onClick={() => setActiveTab('python')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'python' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Python
          </button>
          <button
            id="tab-btn-spec"
            onClick={() => setActiveTab('spec')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'spec' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Endpoints
          </button>
        </div>
      </div>

      {/* Code Blocks */}
      {activeTab === 'node' && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
                Option 1: Download via Local Node.js API (Recommended)
              </span>
              <button
                id="btn-copy-node"
                onClick={() => copyToClipboard(nodeCode, 'node')}
                className="text-xs flex items-center gap-1.5 text-stone-400 hover:text-stone-200 bg-stone-800/80 px-2.5 py-1 rounded-md border border-stone-700 transition-colors"
              >
                {copiedKey === 'node' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'node' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="p-4 bg-stone-950 rounded-xl font-mono text-xs text-stone-300 overflow-x-auto border border-stone-800 leading-relaxed">
              <code>{nodeCode}</code>
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
                Option 2: Direct ytmp3.gl Protocol Script (No Server Needed)
              </span>
              <button
                id="btn-copy-node-direct"
                onClick={() => copyToClipboard(nodeDirectYtmp3Code, 'node-direct')}
                className="text-xs flex items-center gap-1.5 text-stone-400 hover:text-stone-200 bg-stone-800/80 px-2.5 py-1 rounded-md border border-stone-700 transition-colors"
              >
                {copiedKey === 'node-direct' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedKey === 'node-direct' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="p-4 bg-stone-950 rounded-xl font-mono text-xs text-stone-300 overflow-x-auto border border-stone-800 leading-relaxed">
              <code>{nodeDirectYtmp3Code}</code>
            </pre>
          </div>
        </div>
      )}

      {activeTab === 'curl' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
              cURL CLI Commands
            </span>
            <button
              id="btn-copy-curl"
              onClick={() => copyToClipboard(curlCode, 'curl')}
              className="text-xs flex items-center gap-1.5 text-stone-400 hover:text-stone-200 bg-stone-800/80 px-2.5 py-1 rounded-md border border-stone-700 transition-colors"
            >
              {copiedKey === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'curl' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="p-4 bg-stone-950 rounded-xl font-mono text-xs text-stone-300 overflow-x-auto border border-stone-800 leading-relaxed">
            <code>{curlCode}</code>
          </pre>
        </div>
      )}

      {activeTab === 'python' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-400 font-semibold">
              Python 3 Requests Downloader
            </span>
            <button
              id="btn-copy-python"
              onClick={() => copyToClipboard(pythonCode, 'python')}
              className="text-xs flex items-center gap-1.5 text-stone-400 hover:text-stone-200 bg-stone-800/80 px-2.5 py-1 rounded-md border border-stone-700 transition-colors"
            >
              {copiedKey === 'python' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedKey === 'python' ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="p-4 bg-stone-950 rounded-xl font-mono text-xs text-stone-300 overflow-x-auto border border-stone-800 leading-relaxed">
            <code>{pythonCode}</code>
          </pre>
        </div>
      )}

      {activeTab === 'spec' && (
        <div className="space-y-4">
          <div className="grid gap-3">
            <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                  GET
                </span>
                <code className="text-xs font-mono text-amber-400 font-semibold">/api/download?url=...</code>
              </div>
              <p className="text-xs text-stone-400">
                Directly triggers conversion and streams the binary MP3 file as an attachment download.
              </p>
            </div>

            <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-950 text-blue-400 border border-blue-800 font-mono">
                  POST
                </span>
                <code className="text-xs font-mono text-amber-400 font-semibold">/api/convert</code>
              </div>
              <p className="text-xs text-stone-400 mb-2">
                Converts video and returns JSON with video title, thumbnail, direct download URL, and stream link.
              </p>
              <div className="text-[11px] font-mono text-stone-500 bg-stone-900/60 p-2 rounded border border-stone-800">
                Body: {`{ "url": "https://www.youtube.com/watch?v=...", "format": "mp3" }`}
              </div>
            </div>

            <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                  GET
                </span>
                <code className="text-xs font-mono text-amber-400 font-semibold">/api/convert?url=...</code>
              </div>
              <p className="text-xs text-stone-400">
                GET equivalent of the convert endpoint for fast browser and script access.
              </p>
            </div>

            <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                  GET
                </span>
                <code className="text-xs font-mono text-amber-400 font-semibold">/api/info?url=...</code>
              </div>
              <p className="text-xs text-stone-400">
                Fetches title, author, and thumbnail metadata without triggering the conversion pipeline.
              </p>
            </div>

            <div className="p-3.5 bg-stone-950 rounded-xl border border-stone-800">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-mono">
                  GET
                </span>
                <code className="text-xs font-mono text-amber-400 font-semibold">/api/health</code>
              </div>
              <p className="text-xs text-stone-400">
                Checks API availability and server uptime.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
