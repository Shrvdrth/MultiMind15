# MultiMind HTML Demo Guide

This file documents the prepared HTML presentation for the MultiMind application.

## Main HTML File

Open this presentation file in a browser:

```text
demo/multimind-demo-video.html
```

From Windows PowerShell:

```powershell
start demo\multimind-demo-video.html
```

## Presentation Controls

| Action | Control |
|---|---|
| Next slide | Right Arrow or Space |
| Previous slide | Left Arrow |
| Autoplay | `A` key or Auto button |
| Fullscreen | `F` key or Fullscreen button |

## What the HTML Presentation Covers

The HTML presentation is designed for a product demo or project presentation. It explains:

1. What MultiMind is
2. The problem it solves
3. The multi-agent AI debate concept
4. The user workflow
5. The live debate experience
6. Topic-aware future outlooks
7. Optional text-to-speech accessibility
8. Platform architecture and production readiness
9. Final value proposition

## Slide Outline and Speaker Notes

### 1. Intro

**Message:** MultiMind is a premium AI decision intelligence platform.

Suggested script:

> MultiMind helps users make better business and technical decisions by turning a single question into a structured debate between multiple AI agents.

### 2. Problem

**Message:** A single AI answer is not enough for high-stakes decisions.

Suggested script:

> Traditional AI responses often provide one perspective. MultiMind adds challenge, comparison, risk analysis, and confidence scoring.

### 3. Solution

**Message:** Three agents debate and a moderator synthesizes.

Suggested script:

> The Strategist, Risk Analyst, and Engineer each evaluate the decision from a different angle. The Moderator then creates a final recommendation.

### 4. Workflow

**Message:** The app guides users from question to decision.

Suggested script:

> The workflow is simple: submit a decision, watch the live debate, review future insights, and act on the recommendation.

### 5. Live Experience

**Message:** The debate page keeps users engaged while analysis runs.

Suggested script:

> During live debates, MultiMind shows dynamic topic visuals and debate-stage guidance so users understand what is happening.

### 6. Future Outlook

**Message:** Insights change based on the user's question.

Suggested script:

> The outlook is not always business-only. AI questions receive a Future AI Outlook, technical questions receive a Technology Future Outlook, and other topics adapt accordingly.

### 7. Voice and Accessibility

**Message:** Voice is optional and user-controlled.

Suggested script:

> Text-to-speech supports play, pause, resume, stop, voice selection, and speed control. It never blocks the main workflow.

### 8. Platform

**Message:** MultiMind is production-oriented.

Suggested script:

> The platform uses React, .NET 10, PostgreSQL, Docker, Kubernetes, JWT authentication, refresh tokens, SSE streaming, and tested backend services.

### 9. Close

**Message:** MultiMind turns uncertainty into structured debate and confident action.

Suggested script:

> MultiMind is designed to feel like a premium AI product for strategic decision-making, business forecasting, and technical evaluation.

## Capture Mode

The HTML file supports capture mode for renderers:

```text
demo/multimind-demo-video.html?slide=0
```

Change the slide number to capture a specific slide:

```text
demo/multimind-demo-video.html?slide=1
demo/multimind-demo-video.html?slide=2
demo/multimind-demo-video.html?slide=3
```

## Generate the Animated MP4

From the repository root:

```bash
python -m pip install pillow
python scripts/render-demo-video.py ./multimind-animated-demo.mp4
```

The script creates:

```text
multimind-animated-demo.mp4
```

Video format:

- 1920x1080
- H.264 MP4
- 24 FPS
- About 36 seconds

## Existing Generated Artifact

The generated cloud artifact is:

```text
/opt/cursor/artifacts/multimind-animated-demo.mp4
```

## Customization Guide

To update slide text, edit:

```text
demo/multimind-demo-video.html
```

To update generated-video rendering, edit:

```text
scripts/render-demo-video.py
```

To update the browser-based capture renderer, edit:

```text
scripts/render-demo-video.mjs
```

## Troubleshooting

### The HTML opens but looks zoomed in

Use browser fullscreen:

```text
F
```

or zoom out:

```text
Ctrl -
```

### The MP4 renderer fails because Pillow is missing

Run:

```bash
python -m pip install pillow
```

### The MP4 renderer fails because ffmpeg is missing

Install ffmpeg, then rerun:

```bash
python scripts/render-demo-video.py ./multimind-animated-demo.mp4
```

### Chrome capture fails

Use the Python renderer instead:

```bash
python scripts/render-demo-video.py ./multimind-animated-demo.mp4
```

The Python renderer does not require Chrome.
