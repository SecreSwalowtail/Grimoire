import type { CameraOrientation, Frame } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

// Tuning knobs for auto-capture. Brightness values are on the camera's 0-255 (Y) scale.
export const SCAN = {
  intervalMs: 120, // analyse at most this often
  readyChecks: 4, // consecutive good checks before capturing (~0.5s)
  cooldownMs: 2500, // ignore further triggers for this long after one fires
  rearmChecks: 3, // after a capture, the frame must be empty this many checks in a row before the next one
  minBrightness: 60, // mean brightness inside the card below this = too dark
  glareLevel: 245, // a sample at/above this counts as blown-out
  maxGlare: 0.05, // more than this fraction of blown-out samples = glare
  minSharpness: 4, // mean neighbour difference below this = blurry / moving
  edgeContrast: 25, // brightness jump that counts as an edge
  edgeOutside: 0.05, // search this far outside the white frame for the card edge (fraction of frame size)
  edgeInside: 0.2, // ...and this far inside it
  edgeCoverage: 0.6, // fraction of points along each side that must find an edge
  aspectTolerance: 0.15, // detected card shape may differ this much from the frame's shape
  log: false, // log the measured values every check, to tune the numbers above
};

// 'done': this card was already captured; waiting for it to leave the frame.
export type ScanState = 'searching' | 'adjusting' | 'ready' | 'done';

// Card position as fractions (0-1) of the upright image; the photo has the same framing as the frames.
export type NormalizedRect = { x: number; y: number; width: number; height: number };

export type ScanStatus = {
  state: ScanState;
  hint: string;
  rect: NormalizedRect;
};

type Point = { x: number; y: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

// Frames arrive in the sensor's orientation; rotate a frame-relative rect into the upright image.
function toUpright(r: Box, w: number, h: number, orientation: CameraOrientation): NormalizedRect {
  'worklet';
  const map = (u: number, v: number) => {
    'worklet';
    if (orientation === 'right') return [v, 1 - u]; // frame is rotated 90° clockwise: undo
    if (orientation === 'left') return [1 - v, u]; // frame is rotated 90° counter-clockwise: undo
    if (orientation === 'down') return [1 - u, 1 - v];
    return [u, v];
  };
  const a = map(r.x0 / w, r.y0 / h);
  const b = map(r.x1 / w, r.y1 / h);
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return { x, y, width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
}

// Runs on the camera thread for every frame. Reports status changes, and calls onReady
// once the card has looked good for SCAN.readyChecks checks in a row (only if autoCapture).
// After a capture it waits for the frame to be empty before capturing again,
// so a card left in the frame isn't scanned twice.
export function processCardFrame(
  frame: Frame,
  cardCameraPoints: Point[],
  session: number,
  autoCapture: boolean,
  onStatus: (status: ScanStatus) => void,
  onReady: (rect: NormalizedRect) => void,
) {
  'worklet';
  // Worklet state persists between frames on this runtime's global object.
  const g = globalThis as any;
  if (g.__cardScan == null || g.__cardScan.session !== session) {
    g.__cardScan = {
      session, last: 0, good: 0, cooldownUntil: 0, lastKey: '', lastGeometryLog: 0, armed: true, empty: 0,
    };
  }
  const s = g.__cardScan;
  const now = Date.now();
  if (now - s.last < SCAN.intervalMs) return;
  s.last = now;

  const w = frame.width;
  const h = frame.height;

  // White frame corners: camera coordinates -> this frame's pixel coordinates.
  const f: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of cardCameraPoints) {
    const q = frame.convertCameraPointToFramePoint(p);
    f.x0 = Math.min(f.x0, q.x);
    f.y0 = Math.min(f.y0, q.y);
    f.x1 = Math.max(f.x1, q.x);
    f.y1 = Math.max(f.y1, q.y);
  }
  f.x0 = Math.max(0, f.x0);
  f.y0 = Math.max(0, f.y0);
  f.x1 = Math.min(w - 1, f.x1);
  f.y1 = Math.min(h - 1, f.y1);
  const fw = f.x1 - f.x0;
  const fh = f.y1 - f.y0;
  if (fw < 20 || fh < 20) {
    if (SCAN.log && now - s.lastGeometryLog > 1000) {
      s.lastGeometryLog = now;
      console.log(
        `[scan-geo] card outside frame: frame=${w}x${h} orientation=${frame.orientation} card=[${f.x0.toFixed(0)},${f.y0.toFixed(0)} -> ${f.x1.toFixed(0)},${f.y1.toFixed(0)}]`,
      );
    }
    return;
  }

  let buffer: ArrayBuffer;
  let stride: number;
  if (frame.isPlanar) {
    const plane = frame.getPlanes()[0];
    buffer = plane.getPixelBuffer();
    stride = plane.bytesPerRow;
  } else {
    buffer = frame.getPixelBuffer();
    stride = frame.bytesPerRow;
  }
  const Y = new Uint8Array(buffer);
  const px = (x: number, y: number) => {
    'worklet';
    const cx = Math.min(Math.max(Math.round(x), 0), w - 1);
    const cy = Math.min(Math.max(Math.round(y), 0), h - 1);
    return Y[cy * stride + cx];
  };

  // Find the card's real edges: along each side, walk from just outside the white frame inwards
  // and take the first strong brightness jump. Returns coverage and the median edge position.
  const SAMPLES = 16;
  const GAP = 3;
  const findEdge = (horizontal: boolean, line: number, inward: number) => {
    'worklet';
    const span = horizontal ? fh : fw;
    const start = line - inward * SCAN.edgeOutside * span;
    const steps = Math.round((SCAN.edgeOutside + SCAN.edgeInside) * span);
    const found: number[] = [];
    for (let k = 0; k < SAMPLES; k++) {
      const t = 0.15 + (0.7 * k) / (SAMPLES - 1);
      const along = horizontal ? f.x0 + fw * t : f.y0 + fh * t;
      for (let d = 0; d < steps; d++) {
        const p = start + inward * d;
        const a = horizontal ? px(along, p) : px(p, along);
        const b = horizontal ? px(along, p + inward * GAP) : px(p + inward * GAP, along);
        if (Math.abs(b - a) >= SCAN.edgeContrast) {
          found.push(p + (inward * GAP) / 2);
          break;
        }
      }
    }
    found.sort((a, b) => a - b);
    return {
      coverage: found.length / SAMPLES,
      pos: found.length > 0 ? found[Math.floor(found.length / 2)] : line,
    };
  };
  // "top/bottom/left/right" here are in frame (sensor) coordinates.
  const top = findEdge(true, f.y0, 1);
  const bottom = findEdge(true, f.y1, -1);
  const left = findEdge(false, f.x0, 1);
  const right = findEdge(false, f.x1, -1);
  const card: Box = { x0: left.pos, y0: top.pos, x1: right.pos, y1: bottom.pos };
  const cw = card.x1 - card.x0;
  const ch = card.y1 - card.y0;
  const coverageOk = [top, bottom, left, right].every((e) => e.coverage >= SCAN.edgeCoverage);
  // Guard against random edges (table texture, art): the found box must be card-shaped and card-sized.
  const shapeOk =
    cw > fw * 0.5 && ch > fh * 0.5 && Math.abs(cw / ch / (fw / fh) - 1) <= SCAN.aspectTolerance;
  const edges = coverageOk && shapeOk;

  // Lighting + sharpness on a grid inside the card (inset 10% to stay off the border).
  const area = edges ? card : f;
  const GX = 24;
  const GY = 32;
  let sum = 0;
  let glare = 0;
  let sharp = 0;
  for (let j = 0; j < GY; j++) {
    for (let i = 0; i < GX; i++) {
      const sx = area.x0 + (area.x1 - area.x0) * (0.1 + (0.8 * i) / (GX - 1));
      const sy = area.y0 + (area.y1 - area.y0) * (0.1 + (0.8 * j) / (GY - 1));
      const v = px(sx, sy);
      sum += v;
      if (v >= SCAN.glareLevel) glare++;
      sharp += Math.abs(px(sx + 1, sy) - v) + Math.abs(px(sx, sy + 1) - v);
    }
  }
  const n = GX * GY;
  const brightness = sum / n;
  const glareFrac = glare / n;
  const sharpness = sharp / (2 * n);

  // Re-arm once the previously captured card has left the frame.
  if (!edges) {
    s.empty++;
    if (s.empty >= SCAN.rearmChecks) s.armed = true;
  } else {
    s.empty = 0;
  }

  let state: ScanState = 'adjusting';
  let hint = 'Hold still';
  if (!edges) {
    state = 'searching';
    hint = 'Hold steady — fit the card in the frame';
  } else if (!s.armed) {
    state = 'done';
    hint = 'Scanned — remove the card to scan the next one';
  } else if (brightness < SCAN.minBrightness) {
    hint = 'Too dark';
  } else if (glareFrac > SCAN.maxGlare) {
    hint = 'Glare - tilt the card slightly';
  } else if (sharpness < SCAN.minSharpness) {
    hint = 'Hold still';
  } else {
    s.good++;
    hint = 'Hold steady…';
    if (!autoCapture) {
      hint = 'Ready — tap Capture';
    } else if (s.good >= SCAN.readyChecks) {
      state = 'ready';
      hint = 'Capturing';
    }
  }
  if (state !== 'ready' && hint !== 'Hold steady…' && hint !== 'Ready — tap Capture') s.good = 0;

  const rect = toUpright(area, w, h, frame.orientation);

  if (SCAN.log) {
    const cov = [top, bottom, left, right].map((e) => e.coverage.toFixed(2)).join('/');
    console.log(
      `[scan] edges=${edges} coverage(t/b/l/r)=${cov} shape=${shapeOk} bright=${brightness.toFixed(0)} glare=${glareFrac.toFixed(3)} sharp=${sharpness.toFixed(1)} -> ${hint}`,
    );
    if (now - s.lastGeometryLog > 1000) {
      s.lastGeometryLog = now;
      console.log(
        `[scan-geo] frame=${w}x${h} orientation=${frame.orientation}` +
          ` whiteFrame=[${f.x0.toFixed(0)},${f.y0.toFixed(0)} -> ${f.x1.toFixed(0)},${f.y1.toFixed(0)}]` +
          ` card=[${card.x0.toFixed(0)},${card.y0.toFixed(0)} -> ${card.x1.toFixed(0)},${card.y1.toFixed(0)}]` +
          ` upright=${JSON.stringify(rect, (_k, v) => (typeof v === 'number' ? +v.toFixed(3) : v))}`,
      );
    }
  }

  const key = `${state}|${hint}`;
  if (key !== s.lastKey) {
    s.lastKey = key;
    scheduleOnRN(onStatus, { state, hint, rect });
  }

  if (state === 'ready' && now >= s.cooldownUntil) {
    s.cooldownUntil = now + SCAN.cooldownMs;
    s.good = 0;
    s.armed = false;
    s.empty = 0;
    scheduleOnRN(onReady, rect);
  }
}
