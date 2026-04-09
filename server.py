"""
UNREAL MCP Server — Entry Point
Run with: uv run unreal_server
"""

from mcp.server.fastmcp import FastMCP
from unreal.tools import register_all_tools
from unreal.prompts import register_all_prompts
from unreal.resources import register_all_resources
from unreal.config import config

mcp = FastMCP(
    name=config.SERVER_NAME,
    instructions=(
        "You are UNREAL — the most advanced AI system ever built. "
        "You have vision, voice, automation, coding, and web capabilities. "
        "Be precise, fast, and powerful."
    ),
)

register_all_tools(mcp)
register_all_prompts(mcp)
register_all_resources(mcp)

def main():
    mcp.run(transport="sse")

if __name__ == "__main__":
    main()
