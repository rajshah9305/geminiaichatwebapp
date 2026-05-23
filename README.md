# Gemini Chat

A production-ready AI chat application powered by Google's Gemini API. Features a modern, responsive web UI with streaming responses, deep thinking, Google Search grounding, multimodal file support, and full chat history management.

![Gemini Chat](https://img.shields.io/badge/Gemini-Chat-4f8ef7?style=flat-square&logo=google)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)

## Features

- **Multiple Gemini models** — 2.5 Pro, 2.5 Flash, 2.0 Flash, 1.5 Pro, and more
- **Streaming responses** — real-time token-by-token output via Server-Sent Events
- **Deep thinking** — configurable thinking budget (High / Medium / Low / Off)
- **Google Search grounding** — live web search with cited sources
- **Multimodal** — attach images, PDFs, and code files
- **Voice input** — Web Speech API integration
- **Chat history** — persistent localStorage with auto-generated titles
- **Export** — Markdown, JSON, and plain text
- **Dark mode & compact view**
- **Math rendering** — KaTeX for LaTeX expressions
- **Syntax highlighting** — highlight.js for code blocks
- **Keyboard shortcuts** — `Ctrl+N` new chat, `Ctrl+F` search

## Quick Start (Local)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/gemini-chat.git
cd gemini-chat
```

### 2. Set up Python environment

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
```

Get your API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

### 4. Run

```bash
python main.py
```

Open [http://localhost:8000](http://localhost:8000).

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/gemini-chat.git
git push -u origin main
```

### 2. Import on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repository
3. Add the environment variable:
   - **Name:** `GEMINI_API_KEY`
   - **Value:** your key from Google AI Studio
4. Click **Deploy**

That's it — Vercel auto-detects the `vercel.json` configuration.

## Project Structure

```
gemini-chat/
├── main.py              # FastAPI backend — API routes & Gemini streaming
├── requirements.txt     # Python dependencies
├── vercel.json          # Vercel deployment config
├── .env.example         # Environment variable template
├── .gitignore
├── api/
│   └── index.py         # Vercel serverless entry point
└── static/
    ├── index.html       # Single-page app shell
    ├── app.js           # All frontend logic
    └── style.css        # Styles & theming
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google Gemini API key |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves the frontend |
| `GET` | `/api/models` | Returns available model list |
| `POST` | `/api/chat` | Streaming chat (SSE) |
| `POST` | `/api/generate-title` | Auto-generates a chat title |

## License

MIT
