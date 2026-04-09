def register_all_resources(mcp):
    @mcp.resource("unreal://info")
    def get_info() -> str:
        return (
            "UNREAL — Ultimate AI System\n"
            "Vision: MediaPipe FaceMesh, Pose, Hands + face-api.js\n"
            "Voice: Sarvam STT + Gemini 2.5 Flash + OpenAI TTS\n"
            "Tools: Web, PDF, YouTube, WhatsApp, Spotify, Code, System\n"
            "Deploy: Node.js frontend + Python MCP backend + LiveKit agent\n"
        )
