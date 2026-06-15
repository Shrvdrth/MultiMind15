# MultiMind Demo Presentation

## Open the HTML presentation

Open this file directly in a browser:

```text
demo/multimind-demo-video.html
```

Controls:

- Right arrow / Space: next slide
- Left arrow: previous slide
- `A`: autoplay
- `F`: fullscreen

The same HTML file supports capture mode for renderers:

```text
demo/multimind-demo-video.html?slide=0
```

## Generate the MP4 demo video

From the repository root:

```bash
python -m pip install pillow
python scripts/render-demo-video.py ./multimind-animated-demo.mp4
```

The renderer creates a 1920x1080 MP4 presentation video using Python frame rendering and ffmpeg.
