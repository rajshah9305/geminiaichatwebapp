"""
Vercel serverless entry point.
Vercel expects a callable named `app` in api/index.py.
"""
import sys
import os

# Add the project root to the path so we can import main
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: F401 — Vercel picks up `app` automatically
