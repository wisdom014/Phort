# Third-Party Model Notices

Phort's detection pipeline bundles pretrained model weights from third parties.
No AI API keys or cloud services are used — everything runs locally in the browser —
but the weights themselves carry their own licenses, separate from Phort's own code license.

## YOLOv8n (`public/models/yolov8n.onnx`)

- **Source**: [Ultralytics YOLOv8](https://github.com/ultralytics/ultralytics)
- **License**: **AGPL-3.0**
- **Why this matters**: Ultralytics distributes YOLOv8's pretrained weights under AGPL-3.0.
  That license's copyleft terms can extend to applications that use the weights, including
  network-accessible (SaaS) use — not just distributing the file itself. If you plan to ship
  Phort as a closed-source product or SaaS, get your own legal read on this before launch,
  or look into [Ultralytics' commercial/enterprise licensing](https://www.ultralytics.com/license)
  as an alternative. This notice is informational, not legal advice.
- The specific file bundled here was obtained from a public GitHub-hosted mirror
  (`shoz-f/onnx_interp` releases) and verified against the standard YOLOv8n architecture
  (640×640 input, 84×8400 output, 80 COCO classes) before being included.

## human.js face/emotion models (`public/models/human/`)

- **Source**: [@vladmandic/human](https://github.com/vladmandic/human)
- **Models used**: `blazeface` (Google MediaPipe, Apache-2.0), `facemesh` (Google MediaPipe,
  Apache-2.0), `emotion` (trained on FER2013/AffectNet-derived data — see the human.js repo for
  exact provenance)
- **License**: human.js itself is MIT-licensed; the bundled model weights largely trace back to
  Apache-2.0-licensed Google MediaPipe models. No known copyleft concerns for typical use, but
  verify against the human.js repo if you need certainty for a specific commercial context.

## COCO class list

The 80 object class names in `src/lib/vision/yolo.ts` are the standard COCO dataset category
names (public taxonomy, not copyrightable data) — included for label-mapping only.
