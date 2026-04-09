"""
UNREAL MCP Tools — Automation
All danyQe/FRIDAY capabilities ported as MCP tools.
Covers: web scraping, app control, media, WhatsApp, system commands,
        code execution, file ops, translation, PDF, YouTube.
"""

from __future__ import annotations

import os
import time
import datetime
import subprocess
from typing import Optional

import pyautogui
import PyPDF2
import pywhatkit
from bs4 import BeautifulSoup
from deep_translator import GoogleTranslator
from youtube_transcript_api import YouTubeTranscriptApi
from selenium import webdriver
from selenium.webdriver.edge.service import Service
from webdriver_manager.microsoft import EdgeChromiumDriverManager
from google import genai

from unreal.config import config


def register_automation_tools(mcp):

    # ------------------------------------------------------------------
    # WEB & INFORMATION
    # ------------------------------------------------------------------

    @mcp.tool()
    def web_scrape(url: str) -> dict:
        """Scrape text and links from any webpage using Edge."""
        try:
            driver = webdriver.Edge(service=Service(EdgeChromiumDriverManager().install()))
            driver.get(url)
            html = driver.page_source
            driver.quit()
            soup = BeautifulSoup(html, "html.parser")
            text  = soup.get_text(separator="\n")
            links = [a.get("href") for a in soup.find_all("a") if a.get("href")]
            return {"status": "success", "text": text, "links": links}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def search_web(query: str) -> dict:
        """Search the web for a query and return scraped results."""
        try:
            search_url = f"https://www.google.com/search?q={query.replace(' ', '+')}"
            return web_scrape(search_url)
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def get_datetime() -> dict:
        """Return current date and time."""
        try:
            now = datetime.datetime.now()
            return {
                "status": "success",
                "date": now.strftime("%Y-%m-%d"),
                "time": now.strftime("%I:%M:%S %p"),
                "day":  now.strftime("%A"),
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def translate_text(text: str, target_language: str) -> dict:
        """Translate text to any language. Use language codes like 'hi', 'fr', 'es'."""
        try:
            result = GoogleTranslator(source="auto", target=target_language).translate(text)
            return {"status": "success", "translated_text": result, "target_language": target_language}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def get_world_news() -> dict:
        """Fetch current global headlines."""
        try:
            return web_scrape("https://news.google.com/rss")
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def open_world_monitor() -> dict:
        """Open a live world news/map dashboard in the browser."""
        try:
            import webbrowser
            webbrowser.open("https://www.bbc.com/news/world")
            return {"status": "success", "message": "World monitor opened."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # ------------------------------------------------------------------
    # DOCUMENTS & MEDIA
    # ------------------------------------------------------------------

    @mcp.tool()
    def summarise_pdf(pdf_filename: str) -> dict:
        """Extract and return text from a PDF in the /documents folder."""
        try:
            path = os.path.join("documents", pdf_filename)
            if not os.path.exists(path):
                return {"status": "error", "error": f"File not found: {pdf_filename}"}
            text = ""
            with open(path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() or ""
            return {"status": "success", "text": text, "pages": len(reader.pages)}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def summarise_youtube(video_url: str) -> dict:
        """Fetch and return the full transcript of a YouTube video."""
        try:
            if "watch?v=" in video_url:
                video_id = video_url.split("watch?v=")[1].split("&")[0]
            elif "youtu.be/" in video_url:
                video_id = video_url.split("youtu.be/")[1].split("?")[0]
            else:
                return {"status": "error", "error": "Invalid YouTube URL."}
            transcript_data = YouTubeTranscriptApi.get_transcript(video_id)
            transcript = " ".join([i["text"] for i in transcript_data])
            return {"status": "success", "transcript": transcript, "video_id": video_id}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def play_youtube(video_name: str) -> dict:
        """Search and play a video on YouTube."""
        try:
            pywhatkit.playonyt(video_name)
            return {"status": "success", "message": f"Playing '{video_name}' on YouTube."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def play_music(song_name: str) -> dict:
        """Play a song on Spotify (Windows desktop app required)."""
        try:
            pyautogui.press("win")
            time.sleep(2)
            pyautogui.write("Spotify")
            time.sleep(2)
            pyautogui.press("enter")
            time.sleep(10)
            windows = pyautogui.getWindowsWithTitle("Spotify")
            if windows:
                windows[0].maximize()
            pyautogui.hotkey("ctrl", "k")
            time.sleep(3)
            pyautogui.write(song_name, interval=0.2)
            time.sleep(3)
            pyautogui.press("enter")
            time.sleep(5)
            return {"status": "success", "message": f"Playing '{song_name}' on Spotify."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # ------------------------------------------------------------------
    # MESSAGING & CALLS
    # ------------------------------------------------------------------

    @mcp.tool()
    def send_whatsapp_message(contact: str, message: str) -> dict:
        """Send a WhatsApp message to a contact by name (Windows WhatsApp app)."""
        try:
            pyautogui.hotkey("win")
            time.sleep(3)
            pyautogui.write("whatsapp")
            time.sleep(7)
            pyautogui.press("enter")
            time.sleep(10)
            pyautogui.write(contact, interval=0.2)
            pyautogui.press("enter")
            time.sleep(8)
            pyautogui.press("tab")
            time.sleep(7)
            pyautogui.press("enter")
            time.sleep(2)
            pyautogui.write(message, interval=0.3)
            time.sleep(7)
            pyautogui.hotkey("enter")
            time.sleep(10)
            pyautogui.hotkey("alt", "f4")
            return {"status": "success", "message": "Message sent successfully."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def call_whatsapp(contact: str) -> dict:
        """Initiate a WhatsApp voice call to a contact by name."""
        try:
            pyautogui.hotkey("win")
            time.sleep(3)
            pyautogui.write("whatsapp")
            time.sleep(7)
            pyautogui.press("enter")
            time.sleep(5)
            pyautogui.write(contact, interval=0.1)
            pyautogui.press("enter")
            time.sleep(2)
            for _ in range(11):
                pyautogui.press("tab")
            pyautogui.press("enter")
            return {"status": "success", "message": f"Voice call initiated to {contact}."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def videocall_whatsapp(contact: str) -> dict:
        """Initiate a WhatsApp video call to a contact by name."""
        try:
            pyautogui.hotkey("win")
            time.sleep(3)
            pyautogui.write("whatsapp")
            time.sleep(7)
            pyautogui.press("enter")
            time.sleep(5)
            pyautogui.write(contact, interval=0.1)
            pyautogui.press("enter")
            time.sleep(2)
            for _ in range(10):
                pyautogui.press("tab")
            pyautogui.press("enter")
            return {"status": "success", "message": f"Video call initiated to {contact}."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # ------------------------------------------------------------------
    # CODE EXECUTION & FILE OPS
    # ------------------------------------------------------------------

    @mcp.tool()
    def execute_code(python_code: str) -> dict:
        """Execute Python code and return stdout/stderr output."""
        try:
            with open("temp_code.py", "w") as f:
                f.write(python_code)
            process = subprocess.Popen(
                ["python", "temp_code.py"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            stdout, stderr = process.communicate(timeout=30)
            return {
                "status": "success" if process.returncode == 0 else "failed",
                "output": stdout.strip() if stdout else stderr.strip(),
                "returncode": process.returncode,
            }
        except subprocess.TimeoutExpired:
            return {"status": "error", "error": "Code execution timed out after 30s."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def write_program(language: str, code: str, file_name: str) -> dict:
        """Write a program to the /programs folder. Languages: python, java, c++, javascript, c, sql."""
        extensions = {
            "python": ".py", "java": ".java", "c++": ".cpp",
            "javascript": ".js", "c": ".c", "sql": ".sql",
        }
        ext = extensions.get(language.lower())
        if not ext:
            return {"status": "error", "error": f"Unsupported language: {language}"}
        if not file_name.endswith(ext):
            file_name += ext
        os.makedirs("programs", exist_ok=True)
        path = os.path.join("programs", file_name)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(code)
            return {"status": "success", "file_path": path}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def read_program(file_name: str) -> dict:
        """Read a saved program file from the /programs folder."""
        path = os.path.join("programs", file_name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                return {"status": "success", "code": f.read(), "file": file_name}
        except FileNotFoundError:
            return {"status": "error", "error": f"File '{file_name}' not found in /programs."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # ------------------------------------------------------------------
    # SYSTEM CONTROL
    # ------------------------------------------------------------------

    @mcp.tool()
    def open_application(app_name: str) -> dict:
        """Open any Windows application by name via the Start menu."""
        try:
            pyautogui.press("win")
            time.sleep(1)
            pyautogui.write(app_name, interval=0.1)
            time.sleep(1)
            pyautogui.press("enter")
            return {"status": "success", "message": f"Opened {app_name}."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def control_gui(prompt: str) -> dict:
        """Control the Windows GUI using Gemini vision + PyAutoGUI. Provide a detailed action prompt."""
        try:
            client = genai.Client(api_key=config.GOOGLE_API_KEY)
            image  = pyautogui.screenshot()
            response = client.models.generate_content(
                model="gemini-1.5-flash",
                contents=[
                    f"You are a GUI controller. Analyse this screenshot and describe the exact "
                    f"PyAutoGUI steps needed to complete this task: {prompt}. "
                    f"Respond with only the step-by-step actions.",
                    image,
                ],
            )
            return {"status": "success", "instructions": response.text}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def get_system_info() -> dict:
        """Return OS, CPU, memory, and uptime information."""
        try:
            import platform, psutil
            return {
                "status":   "success",
                "os":       platform.system(),
                "version":  platform.version(),
                "cpu":      f"{psutil.cpu_percent()}%",
                "memory":   f"{psutil.virtual_memory().percent}%",
                "uptime":   str(datetime.timedelta(seconds=int(time.time() - psutil.boot_time()))),
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def shutdown() -> dict:
        """Shut down the Windows PC immediately."""
        try:
            os.system("shutdown /s /t 3")
            return {"status": "success", "message": "Shutting down in 3 seconds."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def restart() -> dict:
        """Restart the Windows PC immediately."""
        try:
            subprocess.call(["shutdown", "-r", "-t", "3"])
            return {"status": "success", "message": "Restarting in 3 seconds."}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    @mcp.tool()
    def sleep() -> dict:
        """Put the Windows PC into sleep mode."""
        try:
            os.system("Rundll32.exe Powrprof.dll,SetSuspendState Sleep")
            return {"status": "success", "message": "Going to sleep."}
        except Exception as e:
            return {"status": "error", "error": str(e)}
