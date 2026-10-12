# Phort — Setup

This app runs entirely client-side: React/Vite frontend, Supabase for auth/database/storage,
and **all AI detection running locally in the browser** — no external AI API, no API key,
no separate backend service to run.

## Architecture

- **Frontend**: React/Vite app (this repo)
- **Supabase**: Postgres (`projects`, `media_assets`), Storage (`media` bucket)
- **Detection — 100% in-browser, no server**:
  - **[human.js](https://github.com/vladmandic/human)** (TensorFlow.js) → face detection + mood/emotion
  - **YOLOv8n via [onnxruntime-web](https://github.com/microsoft/onnxruntime)** → object detection, for both images and video
  - A small heuristic (detected objects + pixel brightness/color) → environment + lighting *style*
  - **Canvas luma statistics** → objective lighting *quality* (brightness, contrast, shadow/highlight
    clipping), sampled across 5 frames for video. This is what the Videos bucket sorts on.

## Smart buckets

Three buckets, and every asset lands in exactly one:

- **People** — stills with a person detected in frame (internal category value: `human`)
- **Objects & scenes** — every other still (objects, gear, details, landscapes, venues; internal
  value: `nonhuman`). This merged the old separate Objects and Environment buckets; rows written
  before the merge still load fine, `src/lib/mappers.ts` coerces the legacy
  `'object'`/`'environment'` values to `'nonhuman'`.
- **Videos** — every clip, regardless of subject, grouped into **Good lighting** and
  **Low lighting** by a measured 0-100 exposure score (≥60 is good). Clips do not also appear in
  the two subject buckets.

There used to be a Gemini-based Supabase Edge Function here, and briefly a separate Python
service — both are gone. Detection now runs as plain JavaScript/WASM in the user's browser.
**See [NOTICES.md](./NOTICES.md) for the license terms on the bundled model weights** —
in particular, YOLOv8's pretrained weights are AGPL-3.0, which matters if you plan to ship
this as closed-source software.

## Run it

```bash
npm install
npm run dev
```

That's it — one command. `npm install`'s `postinstall` hook (`scripts/setup-models.mjs`)
automatically copies human.js's face detector + emotion models into `public/models/human/`.
(onnxruntime-web's WASM runtime is imported directly from `node_modules` at build/dev time via
`new URL(...)` in `src/lib/vision/yolo.ts` — Vite's asset pipeline handles it, nothing to copy.)

The YOLO model itself (`public/models/yolov8n.onnx`, ~12.8MB) is already committed directly
in the repo, since it's not published as an npm package — nothing to fetch for that one.

If you ever see a warning from `setup-models.mjs` about a missing file, it usually means
`npm install` didn't fully complete — re-run it.

## Try it

Upload a photo with people in it — you should see real mood/emotion tags and a people count.
Upload a photo of an object/scene — you should see real object labels. Upload a short video — it
lands in the Videos bucket with a lighting score and the reasons behind it (e.g. "Underexposed",
"Crushed shadows").

For the folder workflow, click **New Shoot** and drag one or more folders in. Each folder becomes
its own project, pre-titled from the folder name and editable before you hit Process. Files are
tagged with their folder path during the directory walk, so photos and videos from different
folders can't cross over into the wrong project.

If detection ever fails for a given file (unsupported format, browser without WebGL, etc.),
ingestion still completes — it just falls back to a simple heuristic classifier, clearly
labeled in the UI, rather than blocking the upload.

## Authentication

Login/signup uses Supabase Auth: email/password plus "Continue with Google." Every project and
asset is scoped to the signed-in user via Row Level Security.

**Email/password** works immediately. **Google sign-in** needs one manual step only you can do
(it requires a Google OAuth client tied to your own Google Cloud account):

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   OAuth 2.0 Client ID (type: Web application).
   - Authorized redirect URI: `https://rnikiplqsvxulsscbtph.supabase.co/auth/v1/callback`
   - Authorized JavaScript origin: your app's URL (e.g. `http://localhost:3000` for local dev)
2. In the Supabase Dashboard → Authentication → Providers → Google, paste the Client ID/Secret
   and enable the provider.

Until that's done, "Continue with Google" will show an error — email/password works regardless.

## Security & Row Level Security

**Secrets never go in git.** The only credentials this app uses live in `.env`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). That file is gitignored; commit `.env.example`
instead and copy it to `.env` locally. There are no hardcoded credentials anywhere in the
source — `src/lib/supabaseClient.ts` reads the two env vars and, if either is missing, runs in
local-only mode rather than falling back to a baked-in key. If you ever pasted a real key into a
tracked file, rotate it in the Supabase dashboard (Settings → API) and scrub it from history.

**The anon key is public by design — RLS is what protects your data.** Anything prefixed `VITE_`
is compiled into the browser bundle and visible to every visitor, so the anon key is not a
secret; it's a *publishable* key. What stops one user from reading or deleting another user's
rows is **Row Level Security**, which you must enable yourself — a fresh table has RLS off, which
would leave every row world-readable through that public key. Enable it on both tables and add
owner-scoped policies:

```sql
-- Every projects/media row already stores the owner in user_id.
alter table projects      enable row level security;
alter table media_assets  enable row level security;

create policy "own projects" on projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own media" on media_assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Account-wide notifications, shared by every device signed into the account.
create table if not exists notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('success', 'info', 'warning')),
  title text not null,
  detail text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy "own notifications" on notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Required for the notification bell to update immediately on other devices.
alter table notifications replica identity full;
alter publication supabase_realtime add table notifications;
```

**Storage needs the same treatment.** The `media` bucket should be private, with policies that
scope each object to its owner. Uploads are keyed by user id (`${userId}/${projectId}/…`), so a
policy can check that the first path segment matches `auth.uid()`:

```sql
create policy "own media objects" on storage.objects
  for all using (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text
  );
```

With RLS on and these policies in place, the public anon key can only ever touch the signed-in
user's own projects, assets, and files — which is exactly what makes it safe to ship in the
client bundle.

## App features

Beyond ingestion and the smart buckets, the app includes:

- **Light / dark theme** — follows your OS by default, with a manual override in Settings. The
  choice persists (localStorage key `lensflow.theme`); all colors are theme tokens defined in
  `src/index.css`, so both modes stay legible.
- **Persistent settings** — theme, the lighting-score threshold that splits Good vs. Low lighting,
  export defaults, and whether detection-confidence percentages are shown. Every control actually
  takes effect and is saved (`lensflow.settings`); nothing here is a decorative toggle.
- **Export, organized by smart bucket** — export the catalog as a **ZIP** whose folder tree mirrors
  the smart buckets (People / Objects & scenes / Videos → Good / Low lighting), and/or a **CSV**
  of the catalog metadata. The on-disk layout matches what you see in the buckets.
- **Notifications** — start empty; a notification appears only when something real happens (e.g. an
  ingest completes). You can dismiss individual ones or clear them all (`lensflow.notifications`).
- **Delete a project** — removes the project and its assets from the database *and* the storage
  bucket, and it stops showing in the app unless you add it again.
- **Live counts & storage meter** — every number starts at 0 and only counts what's actually been
  added. The storage panel shows real usage and remaining space in the `media` bucket, not a mock
  figure.

## What's in this repo

- `src/lib/supabaseClient.ts` — Supabase client + config check
- `src/lib/AuthContext.tsx` / `src/components/AuthView.tsx` — auth state + login/signup screen
- `src/lib/mappers.ts` — snake_case DB rows ↔ camelCase app types
- `src/lib/aiDetection.ts` — orchestrates the detection pipeline below; heuristic fallback on any failure
- `src/lib/vision/human.ts` — human.js wrapper (face detection + emotion)
- `src/lib/vision/yolo.ts` — ONNX YOLOv8n wrapper (letterbox preprocessing, decode, NMS)
- `src/lib/vision/mediaFrame.ts` — extracts an analyzable frame from an image or video file
- `src/lib/vision/environment.ts` — heuristic environment/lighting *style* classification
- `src/lib/vision/lighting.ts` — measured lighting *quality* (luma stats, multi-frame for video)
- `src/lib/ingestionService.ts` — upload → analyze → persist, plus the folder-walk helpers
  (`readFolderBatchesFromDrop` / `readFolderBatchesFromFileList`) that group dropped files per folder
- `src/components/UploadModal.tsx` — real ingestion pipeline with live per-file progress
- `src/components/NewProjectModal.tsx` — folder drag-and-drop queue, one project per folder
- `scripts/setup-models.mjs` — the `postinstall` script that stages model files into `public/`
- `public/models/yolov8n.onnx` — the bundled YOLO model (see NOTICES.md)
- `NOTICES.md` — third-party model licensing information
- `.env` — Supabase URL/anon key only; **gitignored, never committed** (see "Security" below)
- `.env.example` — the committed placeholder template you copy to `.env`
- `.gitignore` — keeps `.env`, `node_modules/`, `dist/`, caches, and OS/editor cruft out of git

## Database columns for the Videos bucket

The Videos bucket needs four extra columns on `media_assets`. Reading works without them (the
mappers infer `mediaKind` from the MIME type or file extension), but **inserts will fail** until
they exist, so run this once in the Supabase SQL editor:

```sql
alter table media_assets
  add column if not exists media_kind text default 'image',
  add column if not exists duration_seconds numeric,
  add column if not exists lighting_quality jsonb,
  add column if not exists poster_url text;
```

`poster_url` holds the URL of the still frame captured from each video at upload time. It is what
every thumbnail, grid tile, and inspector preview renders for a clip — a video with no
`poster_url` column would insert-fail (the mapper always writes it) and, if reading, would show a
broken-image box instead of a poster. Images leave it null.

## Known limitations

- **Object/face detection on video inspects one representative frame** (~10% into the clip, capped
  at 3s), not every frame — running YOLO and human.js across a whole clip was out of scope for a
  media-cataloging tool and would be far heavier client-side. Lighting quality is the exception:
  it samples 5 frames spread across the clip, which is cheap enough to do properly and is what
  the Good / Low lighting split depends on.
- **RAW camera formats** (CR3, ARW, NEF, DNG, etc.) aren't decodable by browsers — they upload
  fine but fall back to the heuristic classifier. Convert to JPEG/PNG for real detection.
- **Eye contact / eyes-closed detection isn't implemented.** human.js's default pipeline doesn't
  reliably expose gaze direction or eyelid state without extra landmark work — the app returns
  conservative defaults (`"direct"` / `false`) rather than guessing.
- **Environment/lighting classification is a heuristic** (detected-object labels + pixel
  brightness/color cast), not a trained scene classifier — good for broad categories, not
  perfectly reliable on ambiguous images.
