# LensFlow

Intelligent digital workspace and automated media categorization for photographers and
visual creators. Uploaded photos and videos are analyzed **entirely in the browser** —
face/mood detection via human.js, object detection via ONNX YOLOv8 — and auto-sorted into
smart albums by subject, mood, and scene. No AI API, no API key, no backend inference server.

**See [SETUP.md](./SETUP.md)** for full setup details, and **[NOTICES.md](./NOTICES.md)** for
licensing on the bundled model weights (notably: YOLOv8's weights are AGPL-3.0).

## Quick start

```bash
npm install
npm run dev
```

That's genuinely the whole thing — `npm install` automatically stages the detection models
into `public/` via a postinstall script. No separate service to run, no key to configure.

The app will still run without Supabase configured — projects/uploads just won't persist
across sessions, falling back to local-only, in-memory storage.
