import json
import os
import base64
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, HTMLResponse, JSONResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google import genai
from google.genai import types

# Load .env for local development (no-op in production)
load_dotenv()

app = FastAPI(title="Gemini Chat API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL = "gemini-2.5-pro"


class FilePart(BaseModel):
    mime_type: str
    data: str  # base64 encoded
    name: Optional[str] = None


class HistoryMessage(BaseModel):
    role: str  # "user" or "model"
    content: str
    files: Optional[list[FilePart]] = None


class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []
    thinking_level: str = "HIGH"
    system_prompt: str = ""
    files: Optional[list[FilePart]] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None


class TitleRequest(BaseModel):
    history: list[HistoryMessage]


@app.post("/api/generate-title")
async def generate_title(request: TitleRequest):
    """Generate a short title for a chat based on its first exchange."""
    try:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return {"title": "New Chat"}
        client = genai.Client(api_key=api_key)
        first_user = next((m.content for m in request.history if m.role == "user"), "")
        first_model = next((m.content for m in request.history if m.role == "model"), "")
        prompt = (
            f"Generate a very short title (3-6 words max) for a chat that starts with:\n"
            f"User: {first_user[:200]}\n"
            f"Assistant: {first_model[:200]}\n"
            f"Reply with ONLY the title, no quotes, no punctuation at end."
        )
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(max_output_tokens=20),
        )
        title = response.text.strip().strip('"').strip("'")
        return {"title": title or "New Chat"}
    except Exception:
        return {"title": "New Chat"}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    async def event_stream():
        try:
            api_key = os.environ.get("GEMINI_API_KEY")
            if not api_key:
                yield f"data: {json.dumps({'type': 'error', 'message': 'GEMINI_API_KEY environment variable not set.'})}\n\n"
                return

            client = genai.Client(api_key=api_key)

            # Build contents from history
            contents = []
            for msg in request.history:
                parts = []
                if msg.files:
                    for f in msg.files:
                        parts.append(
                            types.Part.from_bytes(
                                data=base64.b64decode(f.data),
                                mime_type=f.mime_type,
                            )
                        )
                parts.append(types.Part.from_text(text=msg.content))
                contents.append(types.Content(role=msg.role, parts=parts))

            # Add current user message
            user_parts = []
            if request.files:
                for f in request.files:
                    user_parts.append(
                        types.Part.from_bytes(
                            data=base64.b64decode(f.data),
                            mime_type=f.mime_type,
                        )
                    )
            user_parts.append(types.Part.from_text(text=request.message))
            contents.append(types.Content(role="user", parts=user_parts))

            # Tools — always enabled
            tools = [
                types.Tool(url_context=types.UrlContext()),
                types.Tool(code_execution=types.ToolCodeExecution),
                types.Tool(google_search=types.GoogleSearch()),
            ]

            # Config
            # thinking_budget: -1 = dynamic, 0 = off, >0 = fixed token budget
            THINKING_BUDGET_MAP = {"LOW": 512, "MEDIUM": 4096, "HIGH": 8192}
            thinking_budget = THINKING_BUDGET_MAP.get(request.thinking_level, 8192)

            config_kwargs: dict = {
                "tools": tools,
                "thinking_config": types.ThinkingConfig(thinking_budget=thinking_budget),
            }
            if request.system_prompt:
                config_kwargs["system_instruction"] = request.system_prompt
            if request.temperature is not None:
                config_kwargs["temperature"] = request.temperature
            if request.max_tokens is not None:
                config_kwargs["max_output_tokens"] = request.max_tokens

            config = types.GenerateContentConfig(**config_kwargs)

            response_stream = client.models.generate_content_stream(
                model=MODEL,
                contents=contents,
                config=config,
            )

            for chunk in response_stream:
                if chunk.parts is None:
                    continue

                for part in chunk.parts:
                    if hasattr(part, "thought") and part.thought:
                        if part.text:
                            yield f"data: {json.dumps({'type': 'thinking', 'text': part.text})}\n\n"
                    elif hasattr(part, "text") and part.text:
                        yield f"data: {json.dumps({'type': 'text', 'text': part.text})}\n\n"
                    elif hasattr(part, "executable_code") and part.executable_code:
                        yield f"data: {json.dumps({'type': 'code', 'code': str(part.executable_code)})}\n\n"
                    elif hasattr(part, "code_execution_result") and part.code_execution_result:
                        yield f"data: {json.dumps({'type': 'code_result', 'result': str(part.code_execution_result)})}\n\n"

                # Grounding sources
                if chunk.candidates:
                    candidate = chunk.candidates[0]
                    if hasattr(candidate, "grounding_metadata") and candidate.grounding_metadata:
                        sources = _extract_sources(candidate.grounding_metadata)
                        if sources:
                            yield f"data: {json.dumps({'type': 'grounding', 'sources': sources})}\n\n"

                # Token usage
                if hasattr(chunk, "usage_metadata") and chunk.usage_metadata:
                    um = chunk.usage_metadata
                    usage = {}
                    if hasattr(um, "prompt_token_count") and um.prompt_token_count:
                        usage["prompt_tokens"] = um.prompt_token_count
                    if hasattr(um, "candidates_token_count") and um.candidates_token_count:
                        usage["completion_tokens"] = um.candidates_token_count
                    if hasattr(um, "total_token_count") and um.total_token_count:
                        usage["total_tokens"] = um.total_token_count
                    if hasattr(um, "thoughts_token_count") and um.thoughts_token_count:
                        usage["thinking_tokens"] = um.thoughts_token_count
                    if usage:
                        yield f"data: {json.dumps({'type': 'usage', 'usage': usage})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


def _extract_sources(meta):
    sources = []
    if hasattr(meta, "grounding_chunks") and meta.grounding_chunks:
        for gc in meta.grounding_chunks:
            if hasattr(gc, "web") and gc.web:
                sources.append({
                    "title": gc.web.title or gc.web.uri,
                    "uri": gc.web.uri,
                })
    return sources


STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


@app.get("/static/{file_path:path}")
async def serve_static(file_path: str):
    full_path = os.path.join(STATIC_DIR, file_path)
    if not os.path.isfile(full_path):
        return JSONResponse({"error": "Not found"}, status_code=404)
    ext = os.path.splitext(file_path)[1].lower()
    mime = MIME_TYPES.get(ext, "application/octet-stream")
    with open(full_path, "rb") as f:
        content = f.read()
    return Response(content=content, media_type=mime)


@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    index_path = os.path.join(STATIC_DIR, "index.html")
    with open(index_path, "r") as f:
        return HTMLResponse(content=f.read())


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
