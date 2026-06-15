#!/usr/bin/env python3
"""Render a presentation-ready animated MultiMind demo MP4.

Requirements:
  python -m pip install pillow
  ffmpeg

Usage:
  python scripts/render-demo-video.py /opt/cursor/artifacts/multimind-animated-demo.mp4
"""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
FPS = 24
SLIDE_SECONDS = 4.0
FRAMES_PER_SLIDE = int(FPS * SLIDE_SECONDS)
TMP = Path("/tmp/multimind-rendered-frames")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/opt/cursor/artifacts/multimind-animated-demo.mp4")


SLIDES = [
    {
        "eyebrow": "Premium AI Decision Intelligence",
        "title": "MultiMind",
        "accent": "Multi-agent AI debate for confident decisions",
        "body": "Submit a business or technical question. Specialized AI agents debate it live. A Moderator synthesizes a recommendation with confidence and future insight.",
        "chips": ["React + Vite", ".NET 10", "PostgreSQL", "Docker", "Kubernetes"],
        "layout": "hero",
    },
    {
        "eyebrow": "The problem",
        "title": "One AI answer is not enough.",
        "body": "High-stakes decisions need multiple perspectives, structured challenge, risk analysis, and a clear recommendation.",
        "cards": [
            ("Blind spots", "Single-model answers can miss risks and assumptions."),
            ("Slow alignment", "Teams spend hours manually comparing trade-offs."),
            ("Unclear ROI", "Recommendations need business impact and confidence."),
            ("Trust gap", "Stakeholders need transparent reasoning."),
        ],
    },
    {
        "eyebrow": "The solution",
        "title": "Three agents debate. One moderator synthesizes.",
        "body": "Strategist, Risk Analyst, and Engineer challenge the decision from distinct angles before the Moderator turns the discussion into action.",
        "layout": "agents",
    },
    {
        "eyebrow": "Workflow",
        "title": "From question to decision.",
        "cards": [
            ("01 Submit", "Ask a strategic, technical, marketing, finance, or operations question."),
            ("02 Debate", "Watch agents stream arguments and cross-check assumptions."),
            ("03 Outlook", "Review topic-aware future insights, risks, and opportunities."),
            ("04 Decide", "Export, comment, and align around a confidence-scored recommendation."),
        ],
    },
    {
        "eyebrow": "Live experience",
        "title": "A debate page that keeps users engaged.",
        "body": "Dynamic visuals adapt to AI, technology, marketing, e-commerce, finance, operations, and strategy topics while the agents work.",
        "layout": "mock",
    },
    {
        "eyebrow": "Future intelligence",
        "title": "Outlooks match the question.",
        "cards": [
            ("Future AI Outlook", "AI adoption, automation impact, governance, and market opportunity."),
            ("Technology Future Outlook", "Architecture direction, integration risk, scalability, and innovation paths."),
            ("Marketing Growth Outlook", "Audience behavior, campaign direction, positioning, and engagement."),
            ("E-commerce Future Outlook", "Customer behavior, conversion, retention, and omnichannel expansion."),
        ],
    },
    {
        "eyebrow": "Optional accessibility",
        "title": "Voice is powerful, but never required.",
        "body": "Text-to-speech supports play, pause, resume, stop, speed adjustment, and voice selection. Users can keep it fully disabled.",
        "chips": ["Play", "Pause", "Resume", "Stop", "Speed", "Voice selection"],
    },
    {
        "eyebrow": "Production-ready",
        "title": "Secure full-stack platform.",
        "cards": [
            ("Auth", "JWT, refresh tokens, BCrypt, and role-based access."),
            ("Reliability", "SSE recovery, migration retry, and non-blocking event streams."),
            ("Admin", "User, debate, HTTP, and application log dashboards."),
            ("Deploy", "Docker, nginx, Minikube, Kubernetes, and safe secrets templates."),
        ],
    },
    {
        "eyebrow": "MultiMind",
        "title": "Turn uncertainty into structured debate.",
        "body": "A premium AI decision platform for strategy, technology, business forecasting, and confident action.",
        "chips": ["Live debate", "Topic-aware outlooks", "Optional voice", "Executive-ready results"],
        "layout": "closing",
    },
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F_TITLE = font(96, True)
F_BIG = font(132, True)
F_H2 = font(54, True)
F_H3 = font(30, True)
F_BODY = font(30)
F_SMALL = font(22)
F_TINY = font(17, True)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def ease(t: float) -> float:
    return 1 - (1 - t) ** 3


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textbbox((0, 0), test, font=fnt)[2] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def rounded(draw: ImageDraw.ImageDraw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def gradient_bg(frame: int, slide_index: int) -> Image.Image:
    img = Image.new("RGB", (W, H), (7, 11, 20))
    draw = ImageDraw.Draw(img, "RGBA")
    t = frame / max(1, FRAMES_PER_SLIDE - 1)
    for i in range(80):
        x = int((i * 311 + slide_index * 97 + t * 90) % W)
        y = int((i * 173 + slide_index * 131 + math.sin(t * math.pi * 2 + i) * 24) % H)
        alpha = 18 + (i % 4) * 8
        draw.ellipse((x, y, x + 3, y + 3), fill=(148, 163, 184, alpha))
    for cx, cy, r, color in [
        (260 + math.sin(t * math.pi) * 30, 130, 360, (99, 102, 241, 58)),
        (1580, 920 - math.cos(t * math.pi) * 30, 420, (168, 85, 247, 48)),
        (960, 540, 520, (52, 211, 153, 22)),
    ]:
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)
    for x in range(0, W, 80):
        draw.line((x, 0, x, H), fill=(255, 255, 255, 10), width=1)
    for y in range(0, H, 80):
        draw.line((0, y, W, y), fill=(255, 255, 255, 10), width=1)
    return img


def draw_text_block(draw, x, y, text, fnt, fill, max_width, line_gap=8):
    yy = y
    for line in wrap(draw, text, fnt, max_width):
        draw.text((x, yy), line, font=fnt, fill=fill)
        yy += fnt.size + line_gap
    return yy


def draw_header(draw, slide, p):
    draw.text((72, 54), "MultiMind", font=font(28, True), fill=(196, 181, 253))
    rounded(draw, (72, 118, 72 + 24 + len(slide["eyebrow"]) * 12, 160), 21, (99, 102, 241, 42), (129, 140, 248, 120), 1)
    draw.text((90, 128), slide["eyebrow"].upper(), font=F_TINY, fill=(196, 181, 253))


def draw_cards(draw, cards, y, p):
    cols = 2 if len(cards) <= 4 else 3
    card_w = 820 if cols == 2 else 520
    card_h = 158
    gap = 28
    start_x = (W - (cols * card_w + (cols - 1) * gap)) // 2
    for i, (title, body) in enumerate(cards):
        row, col = divmod(i, cols)
        delay = i * 0.07
        a = ease(max(0, min(1, (p - delay) / 0.55)))
        x = start_x + col * (card_w + gap)
        yy = int(y + row * (card_h + gap) + (1 - a) * 38)
        rounded(draw, (x, yy, x + card_w, yy + card_h), 26, (255, 255, 255, int(16 + a * 16)), (255, 255, 255, 35), 2)
        draw.text((x + 28, yy + 24), title, font=F_H3, fill=(248, 250, 252, int(255 * a)))
        draw_text_block(draw, x + 28, yy + 72, body, F_SMALL, (148, 163, 184, int(255 * a)), card_w - 56)


def draw_visual_network(draw, p):
    x0, y0, x1, y1 = 1040, 250, 1780, 860
    rounded(draw, (x0, y0, x1, y1), 44, (255, 255, 255, 14), (255, 255, 255, 36), 2)
    nodes = [
        (x0 + 150, y0 + 140, "Strategy", (99, 102, 241)),
        (x1 - 170, y0 + 145, "Risk", (248, 113, 113)),
        (x0 + 180, y1 - 170, "Engineer", (52, 211, 153)),
        (x1 - 190, y1 - 175, "Moderator", (168, 85, 247)),
    ]
    center = ((x0 + x1) // 2, (y0 + y1) // 2)
    for nx, ny, _, color in nodes:
        draw.line((center[0], center[1], nx, ny), fill=(*color, 90), width=3)
    for nx, ny, label, color in nodes:
        draw.ellipse((nx - 56, ny - 56, nx + 56, ny + 56), fill=(8, 12, 20, 230), outline=(*color, 190), width=4)
        draw.text((nx - 45, ny + 70), label, font=F_TINY, fill=(203, 213, 225))
    pulse = int(8 * math.sin(p * math.pi * 4))
    draw.ellipse((center[0] - 76 - pulse, center[1] - 76 - pulse, center[0] + 76 + pulse, center[1] + 76 + pulse), fill=(99, 102, 241, 230), outline=(196, 181, 253), width=3)
    draw.text((center[0] - 24, center[1] - 34), "AI", font=F_H3, fill=(255, 255, 255))


def render_slide(slide_index: int, frame: int) -> Image.Image:
    p = frame / max(1, FRAMES_PER_SLIDE - 1)
    intro = ease(min(1, p / 0.35))
    img = gradient_bg(frame, slide_index)
    draw = ImageDraw.Draw(img, "RGBA")
    slide = SLIDES[slide_index]
    draw_header(draw, slide, p)
    draw.text((W - 150, H - 58), f"{slide_index + 1:02d} / {len(SLIDES):02d}", font=F_SMALL, fill=(148, 163, 184))
    draw.rectangle((0, H - 7, int(W * (slide_index + p) / len(SLIDES)), H), fill=(99, 102, 241))

    y_shift = int((1 - intro) * 36)
    layout = slide.get("layout")
    if layout in {"hero", "closing"}:
        title_font = F_BIG if layout == "hero" else F_TITLE
        bbox = draw.textbbox((0, 0), slide["title"], font=title_font)
        x = (W - (bbox[2] - bbox[0])) // 2
        y = 270 + y_shift
        draw.text((x, y), slide["title"], font=title_font, fill=(248, 250, 252))
        draw_text_block(draw, 360, y + 155, slide.get("accent") or slide["body"], F_BODY, (203, 213, 225), 1200)
        if slide.get("body") and slide.get("accent"):
            draw_text_block(draw, 450, y + 230, slide["body"], F_SMALL, (148, 163, 184), 1020)
        chips = slide.get("chips", [])
        cx = 360
        cy = 720
        for chip in chips:
            w = draw.textbbox((0, 0), chip, font=F_SMALL)[2] + 34
            rounded(draw, (cx, cy, cx + w, cy + 44), 22, (255, 255, 255, 18), (255, 255, 255, 42), 1)
            draw.text((cx + 17, cy + 9), chip, font=F_SMALL, fill=(226, 232, 240))
            cx += w + 14
    elif layout == "agents":
        draw.text((110, 270 + y_shift), slide["title"], font=F_TITLE, fill=(248, 250, 252))
        draw_text_block(draw, 116, 465 + y_shift, slide["body"], F_BODY, (148, 163, 184), 760)
        draw_visual_network(draw, p)
    elif layout == "mock":
        draw.text((110, 260 + y_shift), slide["title"], font=F_TITLE, fill=(248, 250, 252))
        draw_text_block(draw, 116, 455 + y_shift, slide["body"], F_BODY, (148, 163, 184), 760)
        x, y, w, h = 1050, 250, 720, 610
        rounded(draw, (x, y, x + w, y + h), 34, (8, 12, 20, 220), (255, 255, 255, 40), 2)
        for i, color in enumerate([(248,113,113), (251,191,36), (52,211,153)]):
            draw.ellipse((x + 34 + i*24, y + 30, x + 48 + i*24, y + 44), fill=color)
        panels = ["Strategist: market timing and upside", "Risk Analyst: adoption and execution risk", "Engineer: feasibility and architecture", "Moderator: synthesizing final recommendation"]
        for i, text in enumerate(panels):
            yy = y + 88 + i * 116
            rounded(draw, (x + 36, yy, x + w - 36, yy + 82), 18, (255,255,255,16), (255,255,255,34), 1)
            draw.text((x + 62, yy + 26), text, font=F_SMALL, fill=(226, 232, 240))
    else:
        draw.text((112, 220 + y_shift), slide["title"], font=F_TITLE, fill=(248, 250, 252))
        if slide.get("body"):
            draw_text_block(draw, 118, 420 + y_shift, slide["body"], F_BODY, (148, 163, 184), 1000)
        if slide.get("cards"):
            draw_cards(draw, slide["cards"], 500 if slide.get("body") else 420, p)
        if slide.get("chips"):
            cx, cy = 116, 580
            for chip in slide["chips"]:
                w = draw.textbbox((0, 0), chip, font=F_SMALL)[2] + 36
                rounded(draw, (cx, cy, cx + w, cy + 48), 24, (255,255,255,18), (255,255,255,45), 1)
                draw.text((cx + 18, cy + 11), chip, font=F_SMALL, fill=(226, 232, 240))
                cx += w + 16
    return img


def main() -> None:
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is required to render the MP4.")
    if TMP.exists():
        shutil.rmtree(TMP)
    TMP.mkdir(parents=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)

    total_frames = len(SLIDES) * FRAMES_PER_SLIDE
    for global_frame in range(total_frames):
        slide_index = global_frame // FRAMES_PER_SLIDE
        local_frame = global_frame % FRAMES_PER_SLIDE
        img = render_slide(slide_index, local_frame)
        img.save(TMP / f"frame_{global_frame:05d}.png", optimize=False)
        if global_frame % 48 == 0:
            print(f"Rendered {global_frame}/{total_frames} frames")

    subprocess.run([
        "ffmpeg",
        "-y",
        "-framerate", str(FPS),
        "-i", str(TMP / "frame_%05d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(OUT),
    ], check=True)
    print(f"Animated demo video written to: {OUT}")


if __name__ == "__main__":
    main()
