def register_all_prompts(mcp):
    @mcp.prompt()
    def summarise(text: str) -> str:
        """Summarise any block of text concisely."""
        return f"Summarise the following in 3-5 sentences:\n\n{text}"

    @mcp.prompt()
    def explain_code(code: str) -> str:
        """Explain what a block of code does."""
        return f"Explain what this code does, step by step:\n\n{code}"

    @mcp.prompt()
    def write_code(task: str, language: str = "python") -> str:
        """Generate code for a task."""
        return f"Write a {language} program that: {task}\nReturn only the code, no explanation."
