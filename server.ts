import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  extractYouTubeId,
  getYouTubeInfo,
  convertYouTubeToMp3,
  streamMediaFile,
} from './src/services/ytmp3Service.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // CORS headers for external API consumers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'ytmp3-node-api',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    });
  });

  // Quick video metadata inspection
  app.get('/api/info', async (req, res) => {
    try {
      const urlOrId = (req.query.url as string) || (req.query.id as string);
      if (!urlOrId) {
        return res.status(400).json({ error: 'Missing "url" or "id" query parameter' });
      }

      const videoId = extractYouTubeId(urlOrId);
      if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL or ID' });
      }

      const info = await getYouTubeInfo(videoId);
      res.json({
        success: true,
        ...info,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      });
    } catch (err: any) {
      console.error('[API /api/info error]', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // Main Conversion API (POST)
  app.post('/api/convert', async (req, res) => {
    try {
      const { url, id, format = 'mp3' } = req.body;
      const target = url || id;
      if (!target) {
        return res.status(400).json({
          error: 'Missing "url" or "id" in request body. Example: { "url": "https://www.youtube.com/watch?v=..." }',
        });
      }

      const mediaFormat = format === 'mp4' ? 'mp4' : 'mp3';
      const result = await convertYouTubeToMp3(target, mediaFormat);

      res.json({
        success: true,
        ...result,
        directStreamUrl: `${req.protocol}://${req.get('host')}${result.streamUrl}`,
      });
    } catch (err: any) {
      console.error('[API /api/convert POST error]', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to convert video',
      });
    }
  });

  // Main Conversion API (GET for quick curl/browser testing)
  app.get('/api/convert', async (req, res) => {
    try {
      const target = (req.query.url as string) || (req.query.id as string);
      if (!target) {
        return res.status(400).json({
          error: 'Missing "url" or "id" query parameter. Example: /api/convert?url=https://www.youtube.com/watch?v=...',
        });
      }

      const format = req.query.format === 'mp4' ? 'mp4' : 'mp3';
      const result = await convertYouTubeToMp3(target, format);

      res.json({
        success: true,
        ...result,
        directStreamUrl: `${req.protocol}://${req.get('host')}${result.streamUrl}`,
      });
    } catch (err: any) {
      console.error('[API /api/convert GET error]', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to convert video',
      });
    }
  });

  // Server-Sent Events (SSE) for Real-Time progress tracking in the web UI
  app.get('/api/convert-stream', async (req, res) => {
    const target = (req.query.url as string) || (req.query.id as string);
    if (!target) {
      return res.status(400).json({ error: 'Missing "url" query parameter' });
    }
    const format = req.query.format === 'mp4' ? 'mp4' : 'mp3';

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('start', { message: 'Initiating conversion pipeline...' });

      const result = await convertYouTubeToMp3(target, format, (stage, percent, detail) => {
        sendEvent('progress', { stage, percent, detail });
      });

      sendEvent('complete', {
        ...result,
        directStreamUrl: `${req.protocol}://${req.get('host')}${result.streamUrl}`,
      });
      res.end();
    } catch (err: any) {
      sendEvent('error', { error: err.message || 'Conversion failed' });
      res.end();
    }
  });

  // Direct Download Endpoint (Streams the MP3 directly as an attachment file)
  app.get('/api/download', async (req, res) => {
    try {
      const target = (req.query.url as string) || (req.query.id as string);
      if (!target) {
        return res.status(400).send('Missing "url" or "id" query parameter');
      }

      const format = req.query.format === 'mp4' ? 'mp4' : 'mp3';
      const result = await convertYouTubeToMp3(target, format);

      await streamMediaFile(result.downloadUrl, result.title, format, res);
    } catch (err: any) {
      console.error('[API /api/download error]', err);
      if (!res.headersSent) {
        res.status(500).send(`Download failed: ${err.message || 'Internal Server Error'}`);
      }
    }
  });

  // Route-based direct download endpoint (/api/download/:videoId)
  app.get('/api/download/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      const format = req.query.format === 'mp4' ? 'mp4' : 'mp3';
      const result = await convertYouTubeToMp3(videoId, format);

      await streamMediaFile(result.downloadUrl, result.title, format, res);
    } catch (err: any) {
      console.error('[API /api/download/:videoId error]', err);
      if (!res.headersSent) {
        res.status(500).send(`Download failed: ${err.message || 'Internal Server Error'}`);
      }
    }
  });

  // Documentation / OpenAPI spec JSON endpoint
  app.get('/api/spec', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({
      name: 'ytmp3.gl Node.js Wrapper API',
      description: 'Programmatic API to convert YouTube videos to MP3 and MP4 using ytmp3.gl',
      version: '1.0.0',
      baseUrl,
      endpoints: [
        {
          method: 'GET',
          path: '/api/health',
          description: 'Checks server and API status',
        },
        {
          method: 'GET',
          path: '/api/info?url={youtubeUrl}',
          description: 'Fetches video title, author, and thumbnail without triggering conversion',
        },
        {
          method: 'POST',
          path: '/api/convert',
          headers: { 'Content-Type': 'application/json' },
          body: { url: 'https://www.youtube.com/watch?v=...', format: 'mp3' },
          description: 'Initiates conversion and returns metadata and download URLs',
        },
        {
          method: 'GET',
          path: '/api/convert?url={youtubeUrl}&format=mp3',
          description: 'GET version of convert endpoint for easy browser and script queries',
        },
        {
          method: 'GET',
          path: '/api/download?url={youtubeUrl}&format=mp3',
          description: 'Directly downloads and streams the MP3 audio file as an attachment',
        },
        {
          method: 'GET',
          path: '/api/download/{videoId}?format=mp3',
          description: 'Directly downloads the MP3 file by YouTube Video ID',
        },
        {
          method: 'GET',
          path: '/api/convert-stream?url={youtubeUrl}&format=mp3',
          description: 'Server-Sent Events (SSE) stream for real-time conversion progress',
        },
      ],
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
