"""
UNREAL — Config
Reads from environment variables (set in Render dashboard or .env).
Only 2 keys needed: GOOGLE_API_KEY and MONGODB_URI.
Voice (STT + TTS) is handled entirely by the browser.
"""

import os

class Config:
    SERVER_NAME    = "UNREAL"
    GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "")
    MONGODB_URI    = os.environ.get("MONGODB_URI", "")
    MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "http://127.0.0.1:8000/sse")

config = Config()
