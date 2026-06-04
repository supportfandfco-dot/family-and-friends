import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  app.post('/api/groq', async (req, res) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return res.status(500).json({ error: { message: 'GROQ_API_KEY not configured' } });

    try {
      const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(req.body),
      });

      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(500).json({ error: { message: err instanceof Error ? err.message : 'Groq error' } });
    }
  });

  app.post('/api/gemini', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: { message: 'GEMINI_API_KEY not configured' } });

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });
      const { prompt, system, model, max_tokens, imageBase64, imageMimeType } = req.body;
      let contents = [];
      if (imageBase64 && imageMimeType) {
        contents = [prompt, { inlineData: { data: imageBase64, mimeType: imageMimeType } }];
      } else {
        contents = [prompt];
      }
      
      const response = await ai.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents,
        config: { systemInstruction: system || undefined }
      });
      return res.json({ text: response.text });
    } catch (err) {
      return res.status(500).json({ error: { message: err instanceof Error ? err.message : 'Gemini error' } });
    }
  });

  app.post('/api/openrouter', async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (apiKey) {
      try {
        const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.APP_URL || 'https://familyfriends.app',
            'X-Title': 'Family & Friends',
          },
          body: JSON.stringify(req.body),
        });

        const data = await upstream.json();
        return res.status(upstream.status).json(data);
      } catch (err) {
        return res.status(500).json({ error: err instanceof Error ? err.message : 'OpenRouter error' });
      }
    }

    // Fallback: Simulate multi-model with Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.status(500).json({ error: 'Neither OPENROUTER_API_KEY nor GEMINI_API_KEY configured' });

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      const requestedModel = req.body.model || '';
      let persona = '';
      if (requestedModel.includes('gpt') || requestedModel === 'gpt-4o') persona = 'You are GPT-4o, a highly capable reasoning engine by OpenAI. Be precise, detailed, and structure your response logically.';
      else if (requestedModel.includes('claude')) persona = 'You are Claude 3.5 Sonnet, an AI by Anthropic. Be extremely nuanced, think deeply about context, and provide a polished, human-like response.';
      else if (requestedModel.includes('llama') || requestedModel.includes('mistral')) persona = 'You are Llama 3, a fast open-source model by Meta. Be direct, technical, and prioritize speed and efficiency in your answer.';
      else persona = 'You are a helpful AI assistant.';

      const systemInstruction = req.body.messages?.[0]?.role === 'system' ? req.body.messages[0].content : '';
      const userPrompt = req.body.messages?.find((m: any) => m.role === 'user')?.content || '';

      const finalSystem = `${persona}\n\n${systemInstruction}`.trim();

      // If user provided image content
      const userMsg = req.body.messages?.find((m: any) => m.role === 'user');
      let contents = [];
      if (Array.isArray(userMsg?.content)) {
         contents = userMsg.content.map((c: any) => {
           if (c.type === 'text') return c.text;
           if (c.type === 'image_url') {
              const b64 = c.image_url.url.split(',')[1];
              const mime = c.image_url.url.split(';')[0].split(':')[1];
              return { inlineData: { data: b64, mimeType: mime } };
           }
         }).filter(Boolean);
      } else {
         contents = [userPrompt];
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents,
        config: { systemInstruction: finalSystem || undefined },
      });

      return res.json({
        choices: [{
          message: { content: response.text }
        }]
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Gemini error' });
    }
  });

  app.use('/deezer', async (req, res) => {
    try {
      const upstream = await fetch(`https://api.deezer.com${req.url}`);
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (e) {
      res.status(500).json({ error: 'Failed to fetch music' });
    }
  });

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

startServer();
