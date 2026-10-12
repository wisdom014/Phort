#!/usr/bin/env node
/**
 * Runs automatically after `npm install` (see package.json "postinstall").
 *
 * Copies the model files our detection pipeline needs from node_modules into
 * public/, where Vite can serve them as static assets:
 *
 *  - @vladmandic/human ships ~28MB of models for face/body/hand/iris/etc.
 *    We only use face detection + emotion, so we copy just the 3 model pairs
 *    we need (blazeface, facemesh, emotion) -> public/models/human/
 *
 * onnxruntime-web's WASM runtime is NOT copied here — it's imported directly
 * from node_modules with `?url` in src/lib/vision/yolo.ts, so Vite's own
 * asset pipeline handles it. (An earlier version of this script copied those
 * files to public/ort/, but onnxruntime-web dynamically `import()`s its .mjs
 * loader at runtime, which Vite's dev server refuses to do for files served
 * raw out of /public. Importing from node_modules instead fixes that.)
 *
 * The actual yolov8n.onnx weights are committed directly in public/models/
 * (not copied here) since they don't come from an npm package.
 */

import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const log = (msg) => console.log(`[setup-models] ${msg}`);

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyIfExists(src, dest) {
  if (!existsSync(src)) {
    log(`WARNING: expected file not found, skipping: ${src}`);
    return false;
  }
  copyFileSync(src, dest);
  return true;
}

function setupHumanModels() {
  const humanModelsDir = path.join(rootDir, 'node_modules', '@vladmandic', 'human', 'models');
  const destDir = path.join(rootDir, 'public', 'models', 'human');

  if (!existsSync(humanModelsDir)) {
    log('WARNING: @vladmandic/human models directory not found — did npm install succeed?');
    return;
  }

  ensureDir(destDir);

  // Only the models our config actually uses (face detector + mesh + emotion).
  // The full package ships ~28MB across models we don't need (body, hand, iris, etc).
  const needed = ['blazeface.json', 'blazeface.bin', 'facemesh.json', 'facemesh.bin', 'emotion.json', 'emotion.bin'];
  let copied = 0;
  for (const file of needed) {
    if (copyIfExists(path.join(humanModelsDir, file), path.join(destDir, file))) copied++;
  }
  log(`Copied ${copied}/${needed.length} human.js model files to public/models/human/`);
}

function checkOnnxRuntimeWeb() {
  const requiredFiles = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs'];
  const ortDistDir = path.join(rootDir, 'node_modules', 'onnxruntime-web', 'dist');
  for (const file of requiredFiles) {
    if (!existsSync(path.join(ortDistDir, file))) {
      log(`WARNING: onnxruntime-web is missing ${file} — did npm install succeed?`);
    }
  }
}

function checkYoloModel() {
  const yoloPath = path.join(rootDir, 'public', 'models', 'yolov8n.onnx');
  if (!existsSync(yoloPath)) {
    log('WARNING: public/models/yolov8n.onnx is missing! Object detection will fail until it is restored.');
  } else {
    log('yolov8n.onnx found in public/models/ — OK.');
  }
}

setupHumanModels();
checkOnnxRuntimeWeb();
checkYoloModel();
log('Model setup complete.');
