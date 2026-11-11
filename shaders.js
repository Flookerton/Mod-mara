/* Op Art Studio: GPU shaders (WebGL2 / GLSL ES 3.00).
   A straight port of the Python engine: warps, motifs, illusions, layout, finish.
   Parameter slots are packed by spec.js (see packPattern / packIllusion). */
(function () {
  "use strict";

  var VERT = [
    "#version 300 es",
    "void main(){",
    "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));",
    "  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);",
    "}"
  ].join("\n");

  var COVERAGE = String.raw`#version 300 es
precision highp float;
precision highp int;

uniform vec2 uRes;          // full picture size in pixels
uniform int uSS;            // samples per pixel side
uniform float uT;           // animation phase 0..1
uniform float uP;           // motif repeat in tiles
uniform int uKind;          // 0 pattern, 1 illusion
uniform int uWarp;
uniform int uMotif;
uniform int uIll;
uniform vec4 uWP[4];
uniform vec4 uMP[6];
uniform vec4 uIP[16];
uniform vec4 uPoly[24];
uniform vec4 uBox[12];
uniform vec4 uList[8];
uniform vec4 uLay;          // cx, cy (pixels), scale, shape (1 circle)
uniform vec4 uLay2;         // hx, hy (picture units), frame_line, frame_gap
uniform vec4 uCam;          // camera move: cos, sin of the turn, zoom (1 = none)

out vec4 outColor;

const float TAU = 6.283185307179586;
const float PI = 3.141592653589793;

float WP(int i) { return uWP[i >> 2][i & 3]; }
float MP(int i) { return uMP[i >> 2][i & 3]; }
float IP(int i) { return uIP[i >> 2][i & 3]; }

float fmod1(float x) { return x - floor(x); }
float pmod(float x, float m) { return x - m * floor(x / m); }
bool even(float x) { return pmod(x, 2.0) < 0.5; }

// ---------------------------------------------------------------- warps
struct WOut { vec2 uv; float valid; float par; float dens; float frame; };

WOut warpAt(vec2 q) {
  WOut o; o.valid = 1.0; o.par = -1.0; o.dens = -1.0; o.frame = 0.0;
  float X = q.x, Y = q.y, t = uT, P = uP;
  if (uWarp == 0) {                         // flat
    float c = WP(0) / 2.0;
    o.uv = vec2(X * c + t * P, Y * c);
  } else if (uWarp == 1) {                  // floor
    float yh = WP(0), h = WP(1), k = WP(2) / 2.0, ang = radians(WP(3));
    bool below = Y < yh;
    float dy = below ? yh - Y : Y - yh;
    o.valid = (below || WP(4) > 0.5) ? 1.0 : 0.0;
    dy = max(dy, 1e-6);
    float z = h / dy, xw = X * z, ca = cos(ang), sa = sin(ang);
    o.uv = vec2((xw * ca - z * sa) * k, (xw * sa + z * ca) * k + t * P);
  } else if (uWarp == 2) {                  // tunnel
    float n = WP(0);
    if (WP(1) > 0.5) {
      float r = sqrt(X * X + Y * Y) + 1e-9;
      float th = atan(Y, X);
      o.uv = vec2(th / TAU * n + WP(3) * log(r) * n / TAU, (1.0 / r) * n / TAU - t * P);
      o.dens = n / (TAU * r * r);
    } else {
      float a = WP(2);
      float xa = X / a;
      float d = max(abs(xa), abs(Y)) + 1e-9;
      bool side = abs(xa) >= abs(Y);
      float Pm;
      if (side && xa > 0.0) Pm = (Y / d + 1.0) / 2.0;
      else if (!side && Y > 0.0) Pm = 1.0 + (1.0 - xa / d) / 2.0;
      else if (side) Pm = 2.0 + (1.0 - Y / d) / 2.0;
      else Pm = 3.0 + (xa / d + 1.0) / 2.0;
      o.uv = vec2(Pm * n, (1.0 / d) * n / 2.0 - t * P);
      o.dens = n / (2.0 * d * d);
    }
  } else if (uWarp == 3 || uWarp == 4) {    // bulge, pinch
    float R = WP(0), A = WP(1), c = WP(2) / 2.0, cx = WP(3), cy = WP(4);
    float dx = X - cx, dy = Y - cy, r = sqrt(dx * dx + dy * dy), s = r / R, m;
    if (uWarp == 3) {
      if (WP(5) > 0.5) A = A * (1.0 + 0.35 * sin(TAU * t));
      float u = 1.0 - s * s;
      m = s < 1.0 ? 1.0 - A * u * u : 1.0;
    } else {
      A = min(2.85, abs(A));
      if (WP(5) > 0.5) A = min(2.85, A * (1.0 + 0.15 * sin(TAU * t)));
      m = s < 1.0 ? 1.0 + A * (1.0 - s) * (1.0 - s) : 1.0;
    }
    o.uv = vec2((cx + dx * m) * c, (cy + dy * m) * c);
  } else if (uWarp == 5) {                  // vortex
    float N = WP(0), a = WP(1) / N;
    float dx = X - WP(2), dy = Y - WP(3);
    float lr = log(sqrt(dx * dx + dy * dy) + 1e-12);
    float th = atan(dy, dx), k = N / TAU;
    o.uv = vec2(k * (th + a * lr) + t * P, k * (lr - a * th));
  } else if (uWarp == 6) {                  // wave
    float c = WP(0) / 2.0, ph = TAU * t;
    float env = 1.0 + WP(5) * sin(PI * X * 0.5 + 0.7);
    o.uv = vec2(X * c + WP(1) * env * sin(TAU * WP(3) * Y * 0.5 + ph),
                Y * c + WP(2) * sin(TAU * WP(4) * X * 0.5 + ph));
  } else if (uWarp == 7) {                  // twist
    float R = WP(0), T = WP(1) * (1.0 + 0.25 * sin(TAU * t)), c = WP(2) / 2.0, cx = WP(3), cy = WP(4);
    float dx = X - cx, dy = Y - cy, s = sqrt(dx * dx + dy * dy) / R;
    float ang = s < 1.0 ? T * (1.0 - s) * (1.0 - s) : 0.0;
    float ca = cos(ang), sa = sin(ang);
    o.uv = vec2((cx + dx * ca - dy * sa) * c, (cy + dx * sa + dy * ca) * c);
  } else if (uWarp == 8) {                  // droste
    float S = WP(0), m = WP(1), lnS = log(S);
    float zx = X + 1e-12, zy = Y;
    float wr = log(sqrt(zx * zx + zy * zy)), wi = atan(zy, zx);
    if (WP(2) > 0.5) {
      float k = lnS / TAU;
      float nr = wr + wi * k, ni = wi - wr * k;
      wr = nr; wi = ni;
    }
    wr -= t * lnS;
    float e = exp(wr);
    vec2 zs = vec2(e * cos(wi), e * sin(wi));
    float mx = max(abs(zs.x), abs(zs.y));
    float kk = floor(log(mx) / lnS);
    zs = zs / pow(S, kk);
    o.uv = zs * m;
    if (WP(3) > 0.0) {
      float mx2 = max(abs(zs.x), abs(zs.y));
      o.frame = mx2 < 1.0 + WP(3) ? 1.0 : 0.0;
    }
  } else {                                  // poincare
    int np = int(WP(0) + 0.5);
    float rot = WP(5) * t + radians(WP(3));
    vec2 z = vec2(X, Y) / WP(2);
    float cr = cos(-rot), sr = sin(-rot);
    z = vec2(z.x * cr - z.y * sr, z.x * sr + z.y * cr);
    if (length(z) >= 0.9999) { o.valid = 0.0; z = vec2(0.0); }
    float c = WP(6), R = WP(7), R2 = R * R;
    int flips = 0;
    for (int it = 0; it < 80; it++) {
      bool moved = false;
      for (int k = 0; k < 12; k++) {
        if (k >= np) break;
        float a = TAU * float(k) / float(np);
        vec2 C = c * vec2(cos(a), sin(a));
        vec2 d = z - C;
        float ad2 = dot(d, d);
        if (ad2 < R2) { z = C + R2 * d / ad2; flips++; moved = true; }
      }
      if (!moved) break;
    }
    float rv = WP(8);
    o.uv = vec2(0.5 + z.x / (2.0 * rv), 0.5 + z.y / (2.0 * rv));
    o.par = float(flips & 1);
  }
  return o;
}

vec2 rotIn(vec2 q) {
  float a = radians(WP(14));
  float c = cos(a), s = sin(a);
  return vec2(q.x * c + q.y * s, -q.x * s + q.y * c);
}

// ---------------------------------------------------------------- motifs
uint cellHash(float iu, float iv, float seedm, float period) {
  uint a = uint(pmod(iu, period));
  uint b = uint(pmod(iv, period));
  uint x = a * 374761393u + b * 668265263u + uint(seedm) * 1274126177u;
  x = (x ^ (x >> 13u)) * 1274126177u;
  x = x ^ (x >> 16u);
  return x;
}

float sizeField(vec2 XY) {
  float g = MP(16);
  if (g < 0.5) return 1.0;
  float amt = MP(17);
  if (g < 1.5) {
    float f = clamp(1.0 - length(XY) / 1.4, 0.0, 1.0);
    return 1.0 - amt + 2.0 * amt * f;
  }
  float ang = radians(MP(18));
  float d = XY.x * cos(ang) + XY.y * sin(ang);
  return 1.0 - amt * clamp(d, -1.0, 1.0);
}

bool parityOf(vec2 uv, float par) {
  if (par >= 0.0) return par > 0.5;
  return !even(floor(uv.x) + floor(uv.y));
}

float ppow(float x, float p) { return pow(max(abs(x), 1e-30), p); }

bool satoPart(int name, float a, float b) {
  if (name == 0) return a * a + b * b < 1.0;
  if (name == 1) return (a - 0.5) * (a - 0.5) + b * b < 0.25;
  if (name == 2) return a + b < 1.0;
  if (name == 3) {
    float r1 = sqrt(a * a + b * b), r2 = sqrt((1.0 - a) * (1.0 - a) + (1.0 - b) * (1.0 - b));
    return (r1 > 0.3 && r1 < 0.7) || (r2 > 0.3 && r2 < 0.7);
  }
  if (name == 4) return a < 0.5;
  float r = sqrt(a * a + b * b);
  return r > 0.5 && r < 1.0;
}

bool motifInk(vec2 uv, vec2 XY, float par) {
  vec2 ic = floor(uv);
  vec2 f = uv - ic;
  float x = 2.0 * f.x - 1.0, y = 2.0 * f.y - 1.0;
  if (uMotif == 0) return parityOf(uv, par);
  if (uMotif == 1) {
    float r = MP(0) * sizeField(XY);
    return x * x + y * y < r * r;
  }
  if (uMotif == 2) {
    if (MP(2) > 0.5) { float c = sqrt(0.5); float nx = (x - y) * c, ny = (x + y) * c; x = nx * 1.414; y = ny * 1.414; }
    float pw = MP(0), k = MP(1) * sizeField(XY);
    return ppow(x, pw) + ppow(y, pw) < ppow(k, pw);
  }
  if (uMotif == 3) {
    float h = MP(0) * sizeField(XY) / 2.0;
    bool up = (-y < h) && (0.866 * x + 0.5 * y < h) && (-0.866 * x + 0.5 * y < h);
    bool dn = (y < h) && (0.866 * x - 0.5 * y < h) && (-0.866 * x - 0.5 * y < h);
    return up || dn;
  }
  if (uMotif == 4) {
    float a = MP(0) * sizeField(XY);
    float d = max(abs(x), max(abs(0.5 * x + 0.866 * y), abs(0.5 * x - 0.866 * y)));
    if (MP(1) > 0.5) return d < a && d > a * 0.55;
    return d < a;
  }
  if (uMotif == 5) {
    if (MP(2) > 0.5) { float c = sqrt(0.5); float nx = (x - y) * c, ny = (x + y) * c; x = nx * 1.3; y = ny * 1.3; }
    float w = MP(0) * sizeField(XY), L = MP(1);
    float ax = abs(x), ay = abs(y);
    return (ax < w && ay < L) || (ay < w && ax < L);
  }
  if (uMotif == 6) {
    float r = sqrt(x * x + y * y);
    float band = floor(r * MP(0) * 2.0 * 0.98);
    return r < 0.98 && even(band);
  }
  if (uMotif == 7) {
    float duty = clamp(MP(1) * sizeField(XY), 0.05, 0.95);
    float d = MP(2);
    float tt = d < 0.5 ? f.x : (d < 1.5 ? f.y : fmod1(f.x + f.y));
    return fmod1(tt * MP(0)) < duty;
  }
  if (uMotif == 8) {
    float rule = MP(1), klen = MP(3);
    float k, which;
    if (rule < 0.5) {
      uint h = cellHash(ic.x, ic.y, MP(0), MP(2));
      k = float(h & 3u);
      which = float((h >> 2u) % uint(klen));
    } else if (rule < 1.5) {
      k = pmod(ic.x + ic.y, 4.0);
      which = pmod(floor(ic.x / 2.0) + floor(ic.y / 2.0), klen);
    } else {
      float kk = pmod(ic.x, 2.0) + 2.0 * pmod(ic.y, 2.0);
      k = kk < 1.5 ? kk : (kk < 2.5 ? 3.0 : 2.0);
      which = 0.0;
    }
    float a, b;
    if (k < 0.5) { a = f.x; b = f.y; }
    else if (k < 1.5) { a = 1.0 - f.y; b = f.x; }
    else if (k < 2.5) { a = 1.0 - f.x; b = 1.0 - f.y; }
    else { a = f.y; b = 1.0 - f.x; }
    int wi = int(which + 0.5);
    return satoPart(int(MP(4 + wi) + 0.5), a, b);
  }
  // interlock
  float U = uv.x, V = uv.y, fu = 0.0, gv = 0.0;
  for (int k = 0; k < 3; k++) {
    float ph = MP(6 + k);
    fu += MP(k) * (sin(TAU * (float(k + 1) * U + ph)) - sin(TAU * ph));
  }
  float V2 = V + fu;
  for (int k = 0; k < 3; k++) {
    float ph = MP(9 + k);
    gv += MP(3 + k) * (sin(TAU * (float(k + 1) * V2 + ph)) - sin(TAU * ph));
  }
  float U2 = U + gv;
  return !even(floor(U2) + floor(V2));
}

// ---------------------------------------------------------------- illusions
float screenA(float level, float X, float Y, float px, float ang) {
  float a = radians(ang);
  float d = (X * cos(a) + Y * sin(a)) / (4.0 * px);
  return abs(fmod1(d) - 0.5) < level / 2.0 ? 1.0 : 0.0;
}
float screenL(float level, float X, float Y, float px) {
  float d = (X - Y) * 0.70710678 / (4.0 * px);
  return abs(fmod1(d) - 0.5) < level / 2.0 ? 1.0 : 0.0;
}
float hatchF(float X, float Y, float pitch, float ang, float duty) {
  float a = radians(ang);
  float d = (X * cos(a) + Y * sin(a)) / pitch;
  return fmod1(d) < duty ? 1.0 : 0.0;
}
float triW(float x) { return 1.0 - abs(2.0 * fmod1(x) - 1.0); }
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 d = b - a;
  float L2 = dot(d, d) + 1e-18;
  float t = clamp(dot(p - a, d) / L2, 0.0, 1.0);
  return length(p - (a + t * d));
}
float degAng(float y, float x) { return pmod(degrees(atan(y, x)), 360.0); }

float illusion(float X, float Y, float px) {
  if (uIll == 0) {                                  // cafe wall
    float h = 2.0 / IP(0), tile = h * IP(1), Xs = X, Ys = Y;
    bool rings = IP(5) > 0.5, core = false;
    if (rings) {
      float r = sqrt(X * X + Y * Y) + 1e-12;
      tile = TAU / IP(6); h = tile / IP(1);
      Xs = atan(Y, X); Ys = log(r);
      core = r * tile < 6.0 * px;
    }
    float j = floor(Ys / h), fy = Ys / h - j;
    float off = IP(4) * tile * 2.0 * triW(j / IP(3)) * 0.5 * 2.0;
    float i = floor((Xs - off) / tile);
    float ink = even(i) ? 1.0 : 0.0;
    if (fy < IP(2)) ink = screenA(IP(7), X, Y, px, 45.0);
    if (core) ink = 1.0;
    return ink;
  }
  if (uIll == 1) {                                  // fraser
    float r = sqrt(X * X + Y * Y) + 1e-12, th = atan(Y, X), lr = log(r);
    float dl = IP(0), b = floor(lr / dl), fl = lr / dl - b;
    float K = IP(1), slant = IP(2), cw = IP(3), gap = IP(4);
    float dist = abs(fl - 0.5);
    bool cord = dist < cw / 2.0;
    bool halo = dist >= cw / 2.0 && dist < cw / 2.0 + gap;
    float q = th * K / TAU + slant * (fl - 0.5) / cw;
    bool strand = even(floor(q));
    float qb = th * IP(5) / TAU + IP(6) * sign(slant) * b;
    bool bg = even(floor(qb) + floor(fl * 2.0));
    float ink = cord ? (strand ? 1.0 : 0.0) : (halo ? 0.0 : (bg ? 1.0 : 0.0));
    return r < IP(7) ? 1.0 : ink;
  }
  if (uIll == 2) {                                  // zollner
    float ang = radians(IP(0));
    float s = X * cos(ang) + Y * sin(ang), t = -X * sin(ang) + Y * cos(ang);
    float D = IP(1), lw = IP(2);
    float j = floor(t / D + 0.5), dt = t - j * D;
    bool ink = abs(dt) < lw / 2.0;
    float hs = IP(3), hl = IP(4), hw = IP(5), ha = radians(IP(6));
    float sgn = even(j) ? 1.0 : -1.0;
    float k0 = floor(s / hs + 0.5);
    float ux = cos(ha), uy = sin(ha) * sgn;
    int reach = int(IP(7) + 0.5);
    for (int dk = -16; dk <= 16; dk++) {
      if (dk < -reach || dk > reach) continue;
      float ls = s - (k0 + float(dk)) * hs;
      float along = ls * ux + dt * uy;
      float perp = abs(-ls * uy + dt * ux);
      if (perp < hw / 2.0 && abs(along) < hl / 2.0) ink = true;
    }
    return ink ? 1.0 : 0.0;
  }
  if (uIll == 3) {                                  // ouchi
    float a = IP(0), b = IP(1);
    int nd = int(IP(2) + 0.5);
    bool inside = false;
    for (int i = 0; i < 8; i++) {
      if (i >= nd) break;
      vec4 d = uList[i];
      if ((X - d.x) * (X - d.x) + (Y - d.y) * (Y - d.y) < d.z * d.z) inside = true;
    }
    bool outv = even(floor(X / a) + floor(Y / b));
    bool insv = even(floor(X / b) + floor(Y / a));
    return (inside ? insv : outv) ? 1.0 : 0.0;
  }
  if (uIll == 4) {                                  // hermann
    float c = 2.0 / IP(0), w = IP(1);
    float fx = fmod1(X / c), fy = fmod1(Y / c);
    bool street = fx < w || fy < w;
    if (IP(2) > 0.5) {
      float ink = street ? screenA(0.55, X, Y, px, 45.0) : 1.0;
      float dx = fx - w / 2.0, dy = fy - w / 2.0;
      dx = min(abs(dx), abs(dx - 1.0)); dy = min(abs(dy), abs(dy - 1.0));
      if (dx * dx + dy * dy < (w * 0.75) * (w * 0.75)) ink = 0.0;
      return ink;
    }
    return street ? 0.0 : 1.0;
  }
  if (uIll == 5) {                                  // drift
    float b, fl, q; bool core = false;
    if (IP(0) > 0.5) {
      float r = sqrt(X * X + Y * Y) + 1e-12, th = atan(Y, X), lr = log(r);
      float dl = IP(4);
      b = floor(lr / dl); fl = lr / dl - b;
      float dirn = even(b) ? 1.0 : -1.0;
      q = dirn * (th * IP(5) / TAU) + 0.5 * b + IP(7) * sin(PI * fl);
      core = r < IP(9);
    } else {
      float h = 2.0 / IP(6);
      b = floor(Y / h); fl = Y / h - b;
      float dirn = even(b) ? 1.0 : -1.0;
      q = dirn * X / (h * 1.6) + 0.5 * b + IP(7) * sin(PI * fl);
    }
    float f = fmod1(q);
    float level;
    if (f < IP(1)) level = 1.0;
    else if (f < IP(2)) level = 0.62;
    else if (f < IP(3)) level = 0.0;
    else level = 0.28;
    if (abs(fl - 0.5) > 0.5 - IP(8)) level = 0.0;
    float ink = (level > 0.0 && level < 1.0) ? screenL(level, X, Y, px) : level;
    return core ? 1.0 : ink;
  }
  if (uIll == 6) {                                  // pinna
    float r = sqrt(X * X + Y * Y) + 1e-12, th = atan(Y, X);
    float ink = screenL(IP(0), X, Y, px);
    int nr = int(IP(1) + 0.5);
    float size = IP(7), lw = size * IP(8), half_ = size / 2.0;
    for (int ri = 0; ri < 4; ri++) {
      if (ri >= nr) break;
      float R = uList[ri].x, n = uList[ri].y;
      float k = roundEven(th / TAU * n);
      float phi = k * TAU / n;
      float cxp = R * cos(phi), cyp = R * sin(phi);
      float tilt = phi + radians((ri % 2 == 0) ? 45.0 : -45.0) + radians(IP(9));
      float dx = X - cxp, dy = Y - cyp;
      float a = dx * cos(tilt) + dy * sin(tilt);
      float bb = -dx * sin(tilt) + dy * cos(tilt);
      bool insq = abs(a) < half_ && abs(bb) < half_;
      bool border = insq && (abs(a) > half_ - lw || abs(bb) > half_ - lw);
      bool dark = abs(a) >= abs(bb) ? a > 0.0 : bb > 0.0;
      if (border) ink = dark ? 1.0 : 0.0;
    }
    return r < IP(10) ? 1.0 : ink;
  }
  if (uIll == 7) {                                  // kanizsa
    float form = IP(0), d = IP(1), rd = IP(2) * d;
    bool ink;
    if (form < 0.5) {
      vec2 ex = vec2(d, 0.0), ey = vec2(0.5, sqrt(3.0) / 2.0) * d;
      float jj = roundEven(Y / ey.y);
      float ii = roundEven((X - jj * ey.x) / ex.x);
      float bd = 1e30, bcx = 0.0, bcy = 0.0, bci = 0.0, bcj = 0.0;
      for (int di = -1; di <= 1; di++) {
        for (int dj = -1; dj <= 1; dj++) {
          float ci = ii + float(di), cj = jj + float(dj);
          float cx = ci * ex.x + cj * ey.x, cy = cj * ey.y;
          float dd = (X - cx) * (X - cx) + (Y - cy) * (Y - cy);
          if (dd < bd) { bd = dd; bcx = cx; bcy = cy; bci = ci; bcj = cj; }
        }
      }
      bool disk = bd < rd * rd;
      float ang = degAng(Y - bcy, X - bcx);
      float r0 = pmod(bci + 2.0 * bcj, 3.0);
      bool cut;
      if (r0 < 0.5) cut = ang < 60.0;
      else if (r0 < 1.5) cut = ang >= 120.0 && ang < 180.0;
      else cut = ang >= 240.0 && ang < 300.0;
      ink = disk && !cut;
    } else if (form < 1.5) {
      float ci = roundEven(X / d), cj = roundEven(Y / d);
      float dx = X - ci * d, dy = Y - cj * d;
      bool disk = dx * dx + dy * dy < rd * rd;
      float qx = dx >= 0.0 ? 0.0 : -1.0, qy = dy >= 0.0 ? 0.0 : -1.0;
      bool illusory = even(ci + qx) && even(cj + qy);
      ink = disk && !illusory;
    } else {
      float lw = IP(3);
      rd = IP(4) * d;
      float fx = X / d - roundEven(X / d), fy = Y / d - roundEven(Y / d);
      bool lines = abs(fx) * d < lw / 2.0 || abs(fy) * d < lw / 2.0;
      lines = lines || abs(fx - fy) * d < lw / 1.4 || abs(fx + fy) * d < lw / 1.4;
      float hx = fmod1(X / d) - 0.5, hy = fmod1(Y / d) - 0.5;
      float rr = (rd / d) * (rd / d);
      bool gap = fx * fx + fy * fy < rr || hx * hx + hy * hy < rr * 0.5;
      ink = lines && !gap;
    }
    if (IP(5) > 0.5) ink = !ink;
    return ink ? 1.0 : 0.0;
  }
  if (uIll == 8) {                                  // bulge check
    float c = 2.0 / IP(0);
    float i = floor(X / c), j = floor(Y / c);
    float fx = X / c - i, fy = Y / c - j;
    bool base = even(i + j);
    float ccx = (i + 0.5) * c - IP(1), ccy = (j + 0.5) * c - IP(2);
    bool within = ccx * ccx + ccy * ccy < IP(3) * IP(3);
    float ds = IP(4), g = IP(5);
    bool diagA = ccx * ccy > 0.0;
    if (IP(6) < 0.0) diagA = !diagA;
    bool lo = fx > g && fx < g + ds, hi = fx < 1.0 - g && fx > 1.0 - g - ds;
    bool loy = fy > g && fy < g + ds, hiy = fy < 1.0 - g && fy > 1.0 - g - ds;
    bool dA = (lo && loy) || (hi && hiy);
    bool dB = (hi && loy) || (lo && hiy);
    bool dot_ = within && (diagA ? dA : dB);
    return (base != dot_) ? 1.0 : 0.0;
  }
  if (uIll == 9) {                                  // tribar
    float hp = IP(0), lw = IP(1);
    int nops = int(IP(2) + 0.5);
    float ink = 0.0;
    vec2 p = vec2(X, Y);
    for (int op = 0; op < 12; op++) {
      if (op >= nops) break;
      vec4 bx = uBox[op];
      if (X < bx.x || X > bx.z || Y < bx.y || Y > bx.w) continue;
      vec2 pt[4];
      pt[0] = uPoly[2 * op].xy; pt[1] = uPoly[2 * op].zw;
      pt[2] = uPoly[2 * op + 1].xy; pt[3] = uPoly[2 * op + 1].zw;
      bool inside = false;
      float od = 1e9;
      for (int e = 0; e < 4; e++) {
        vec2 a = pt[e], b = pt[(e + 1) & 3];
        od = min(od, segDist(p, a, b));
        if (a.y == b.y) continue;
        bool cond = Y >= min(a.y, b.y) && Y < max(a.y, b.y);
        float xc = a.x + (Y - a.y) * (b.x - a.x) / (b.y - a.y);
        if (cond && X < xc) inside = !inside;
      }
      if (inside) {
        float tn = IP(3 + op);
        ink = tn < 0.5 ? 0.0 : (tn < 1.5 ? 1.0 : hatchF(X, Y, hp, tn - 2.0, 0.45));
      }
      if (od < lw / 2.0) ink = 1.0;
    }
    return ink;
  }
  if (uIll == 10) {                                 // cubes
    float sz = IP(0);
    float q = (sqrt(3.0) / 3.0 * X - Y / 3.0) / sz;
    float r = (2.0 / 3.0 * Y) / sz;
    float x3 = q, z3 = r, y3 = -x3 - z3;
    float rx = roundEven(x3), ry = roundEven(y3), rz = roundEven(z3);
    float dx = abs(rx - x3), dy = abs(ry - y3), dz = abs(rz - z3);
    bool m1 = dx > dy && dx > dz;
    bool m2 = !m1 && dy > dz;
    if (m1) rx = -ry - rz;
    if (m2) ry = -rx - rz;
    if (!m1 && !m2) rz = -rx - ry;
    float cx = sz * sqrt(3.0) * (rx + rz / 2.0), cy = sz * 1.5 * rz;
    float ang = degAng(Y - cy, X - cx);
    bool top = ang >= 30.0 && ang < 150.0;
    bool left = ang >= 150.0 && ang < 270.0;
    float hp = sz * IP(1);
    float tc = top ? IP(2) : (left ? IP(3) : IP(4));
    float fa = top ? 0.0 : (left ? 150.0 : 30.0);
    float ink = tc < 0.5 ? 0.0 : (tc < 1.5 ? 1.0 : hatchF(X, Y, hp, fa, 0.45));
    float lw = IP(5);
    if (lw > 0.0) {
      float rr = sqrt((X - cx) * (X - cx) + (Y - cy) * (Y - cy));
      for (int i = 0; i < 3; i++) {
        float a0 = i == 0 ? 30.0 : (i == 1 ? 150.0 : 270.0);
        float dd = abs(radians(pmod(ang - a0 + 180.0, 360.0) - 180.0)) * rr;
        if (dd < lw / 2.0) ink = 1.0;
      }
    }
    return ink;
  }
  if (uIll == 11) {                                 // moire
    float pitch = IP(1);
    bool a, b;
    if (IP(0) < 0.5) {
      float d = IP(2);
      float r1 = sqrt((X - d) * (X - d) + Y * Y), r2 = sqrt((X + d) * (X + d) + Y * Y);
      a = fmod1(r1 / pitch) < 0.5;
      b = fmod1(r2 / (pitch * IP(3))) < 0.5;
    } else {
      float ang = radians(IP(4));
      a = fmod1(X / pitch) < 0.5;
      b = fmod1((X * cos(ang) + Y * sin(ang)) / (pitch * IP(3))) < 0.5;
    }
    if (IP(5) < 0.5) return (a != b) ? 1.0 : 0.0;
    return (a && b) ? 1.0 : 0.0;
  }
  // phase shapes
  float pitch = IP(0), ang = radians(IP(1));
  float d = (X * cos(ang) + Y * sin(ang)) / pitch;
  int ns = int(IP(2) + 0.5);
  bool inside = false;
  for (int i = 0; i < 8; i++) {
    if (i >= ns) break;
    vec4 s = uList[i];
    bool m;
    if (s.x < 0.5) m = (X - s.y) * (X - s.y) + (Y - s.z) * (Y - s.z) < s.w * s.w;
    else if (s.x < 1.5) m = abs(X - s.y) < s.w && abs(Y - s.z) < s.w;
    else m = abs(X - s.y) + abs(Y - s.z) < s.w;
    if (m) inside = !inside;
  }
  float wob = IP(3) * sin(Y * 6.0);
  if (inside) d += 0.5 + wob;
  return fmod1(d) < IP(4) ? 1.0 : 0.0;
}

// ---------------------------------------------------------------- per sample
// camera move: turn and zoom the art inside a fixed frame
vec2 camQ(vec2 q) {
  return vec2(q.x * uCam.x - q.y * uCam.y, q.x * uCam.y + q.y * uCam.x) / uCam.z;
}

float patternInk(vec2 q, float fp) {
  vec2 qw = rotIn(camQ(q));
  WOut w = warpAt(qw);
  bool ink = motifInk(w.uv, qw, w.par);
  bool simpleOK = uMotif != 0 && uMotif != 9;
  if (MP(20) > 0.5 && simpleOK) ink = ink != parityOf(w.uv, w.par);
  bool inv = MP(21) > 0.5;
  if (inv) ink = !ink;
  if (w.dens >= 0.0) fp = w.dens / uLay.z / uCam.z;
  float minpx = MP(22);
  if (minpx > 4.0 && simpleOK && fp > 1.0 / minpx) {
    bool chk = parityOf(w.uv, w.par);
    ink = inv ? !chk : chk;
  }
  bool core = fp > 1.0 / WP(13);
  if (core) ink = WP(12) > 0.5;
  if (w.frame > 0.5 && !core) ink = true;
  if (w.valid < 0.5) ink = false;
  return ink ? 1.0 : 0.0;
}

// tiles per output pixel, robust to jumps: smaller of the two one-sided differences per axis
float footprint(vec2 q, float e) {
  vec2 c = warpAt(rotIn(camQ(q))).uv;
  vec2 xp = warpAt(rotIn(camQ(q + vec2(e, 0.0)))).uv;
  vec2 xm = warpAt(rotIn(camQ(q - vec2(e, 0.0)))).uv;
  vec2 yp = warpAt(rotIn(camQ(q + vec2(0.0, e)))).uv;
  vec2 ym = warpAt(rotIn(camQ(q - vec2(0.0, e)))).uv;
  float mx = min(length(xp - c), length(c - xm));
  float my = min(length(yp - c), length(c - ym));
  return max(mx, my) / e / uLay.z;
}

float layoutInk(float ink, vec2 q) {
  bool circle = uLay.w > 0.5;
  bool inside = circle ? dot(q, q) < 1.0 : (abs(q.x) <= uLay2.x && abs(q.y) <= uLay2.y);
  if (!inside) ink = 0.0;
  float fl = uLay2.z, gap = uLay2.w;
  if (fl > 0.0) {
    float d = circle ? length(q) - 1.0 : max(abs(q.x) - uLay2.x, abs(q.y) - uLay2.y);
    if (d > gap && d < gap + fl) ink = 1.0;
  }
  return ink;
}

void main() {
  float sc = uLay.z;
  float px = 1.0 / sc;
  vec2 pc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);   // pixel center, rows from the top
  float fp = 0.0;
  bool pattern = uKind == 0;
  if (pattern) {
    vec2 qc = vec2(pc.x - uLay.x, uLay.y - pc.y) / sc;
    fp = footprint(qc, px / 3.0);
  }
  float acc = 0.0;
  float ss = float(uSS);
  for (int sy = 0; sy < 4; sy++) {
    if (sy >= uSS) break;
    for (int sx = 0; sx < 4; sx++) {
      if (sx >= uSS) break;
      vec2 P = pc - 0.5 + (vec2(float(sx), float(sy)) + 0.5) / ss;
      vec2 q = vec2(P.x - uLay.x, uLay.y - P.y) / sc;
      vec2 cq = camQ(q);
      float ink = pattern ? patternInk(q, fp) : illusion(cq.x, cq.y, px / uCam.z);
      acc += layoutInk(ink, q);
    }
  }
  outColor = vec4(acc / (ss * ss), 0.0, 0.0, 1.0);
}
`;

  var FINISH = String.raw`#version 300 es
precision highp float;
precision highp int;

uniform sampler2D uCov;
uniform vec2 uRes;
uniform int uVintage;       // 0 clean, 1 vintage print, 2 phosphor screen
uniform vec3 uPaper;
uniform vec3 uInk;
uniform float uBlur;        // gaussian sigma in pixels
uniform float uSpecks;
uniform float uGrain;
uniform float uWear;
uniform uint uSeed;
uniform vec4 uLines[12];    // hairline scratches (pixel coords, rows from the top)
uniform int uNLines;
uniform float uLineW;
uniform float uGlow;        // phosphor: glow, scanlines, color bleed, dark corners
uniform float uScan;
uniform float uBleed;
uniform float uVig;

out vec4 outColor;

uint hash3(uint x, uint y, uint z) {
  uint h = x * 0x8da6b343u ^ y * 0xd8163841u ^ z * 0xcb1ab31fu ^ uSeed * 0x9e3779b9u;
  h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
  return h;
}
float rnd(int x, int y, int z) { return float(hash3(uint(x), uint(y), uint(z)) >> 8u) / 16777216.0; }

float covAt(ivec2 p) {
  ivec2 sz = ivec2(uRes);
  p = clamp(p, ivec2(0), sz - 1);
  return texelFetch(uCov, p, 0).r;
}

float cubicW(float x) {             // bicubic kernel, a = -0.5
  x = abs(x);
  if (x < 1.0) return (1.5 * x - 2.5) * x * x + 1.0;
  if (x < 2.0) return ((-0.5 * x + 2.5) * x - 4.0) * x + 2.0;
  return 0.0;
}

// smooth random field, like a small random grid resized up with bicubic
float field(vec2 pix, float cells, int layer) {
  vec2 g = max(vec2(2.0), floor(uRes / cells));
  vec2 c = (pix + 0.5) * g / uRes - 0.5;
  vec2 i0 = floor(c);
  vec2 f = c - i0;
  float acc = 0.0;
  for (int j = -1; j <= 2; j++) {
    float wy = cubicW(f.y - float(j));
    for (int i = -1; i <= 2; i++) {
      vec2 gi = clamp(i0 + vec2(float(i), float(j)), vec2(0.0), g - 1.0);
      acc += wy * cubicW(f.x - float(i)) * rnd(int(gi.x), int(gi.y), layer);
    }
  }
  return clamp(acc, 0.0, 1.0);
}

void main() {
  ivec2 gp = ivec2(gl_FragCoord.xy);
  float c = covAt(gp);
  if (uVintage == 0) {
    vec3 col = mix(uInk, uPaper, 1.0 - c);
    outColor = vec4(col / 255.0, 1.0);
    return;
  }
  if (uVintage == 2) {
    // phosphor screen: glowing ink on a dark tube, scanlines, a little color bleed, darker corners
    float W2 = uRes.x, H2 = uRes.y, base2 = min(W2, H2), s = base2 / 1000.0;
    vec2 pix2 = vec2(gl_FragCoord.x - 0.5, H2 - gl_FragCoord.y - 0.5);
    int ab = int(floor(uBleed * 2.5 * max(1.0, s) + 0.5));
    float cr = covAt(gp + ivec2(ab, 0)), cb = covAt(gp - ivec2(ab, 0));
    float gr = (1.5 + 9.0 * uGlow) * max(0.6, s);
    float g = 0.0;
    for (int ring = 1; ring <= 3; ring++) {
      float rr = gr * float(ring) / 3.0;
      for (int k = 0; k < 12; k++) {
        float a = 6.2831853 * (float(k) + 0.5 * float(ring)) / 12.0;
        g += covAt(gp + ivec2(int(floor(rr * cos(a) + 0.5)), int(floor(rr * sin(a) + 0.5))));
      }
    }
    g /= 36.0;
    vec3 P = uInk / 255.0, bg = uPaper / 255.0;
    vec3 lit = vec3(P.r * cr, P.g * c, P.b * cb) * 0.84;
    vec3 col = bg + lit * (1.0 - bg);
    col += P * g * uGlow * 0.95 * (1.0 - 0.55 * c);
    col += vec3(c * c * 0.06);
    float sp = max(3.0, base2 / 260.0);
    float sl = 0.5 + 0.5 * cos(6.2831853 * (pix2.y + 0.5) / sp);
    col *= 1.0 - uScan * 0.7 * (1.0 - sl) * (1.0 - sl);
    vec2 uv = ((pix2 + 0.5) / uRes - 0.5) * uRes / base2;
    col *= 1.0 - uVig * 0.6 * smoothstep(0.35, 0.95, length(uv));
    col += (rnd(int(pix2.x), int(pix2.y), 9) - 0.5) * uGrain * 0.06;
    outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    return;
  }
  float W = uRes.x, H = uRes.y, base = min(W, H);
  vec2 pix = vec2(gl_FragCoord.x - 0.5, H - gl_FragCoord.y - 0.5);   // rows from the top

  // 1. ink spread
  if (uBlur > 0.05) {
    int rad = int(min(ceil(uBlur * 2.5), 8.0));
    float acc = 0.0, ws = 0.0;
    float k = -0.5 / (uBlur * uBlur);
    for (int j = -8; j <= 8; j++) {
      if (j < -rad || j > rad) continue;
      for (int i = -8; i <= 8; i++) {
        if (i < -rad || i > rad) continue;
        float w = exp(float(i * i + j * j) * k);
        acc += w * covAt(gp + ivec2(i, j));
        ws += w;
      }
    }
    c = acc / ws;
  }

  // 2. specks (ink dots) and flecks (paper spots), about one per 9000 pixels at amount 1
  float s = base / 2000.0;
  float sp = 0.0, fk = 0.0;
  float G = 94.87;
  vec2 cell = floor(pix / G);
  float soft = s > 0.8 ? 0.7 * s : 0.5;
  for (int cj = -1; cj <= 1; cj++) {
    for (int ci = -1; ci <= 1; ci++) {
      ivec2 cc = ivec2(cell) + ivec2(ci, cj) + 4096;
      for (int n = 0; n < 3; n++) {
        int z = 100 + n * 7;
        if (rnd(cc.x, cc.y, z) >= uSpecks / 3.0) continue;
        vec2 pos = (vec2(cc - 4096) + vec2(rnd(cc.x, cc.y, z + 1), rnd(cc.x, cc.y, z + 2))) * G;
        float u = rnd(cc.x, cc.y, z + 3);
        float r = (u * u * u * 2.2 + 0.4) * s;
        float d = length(pix + 0.5 - pos);
        float cov = clamp((r + soft - d) / (2.0 * soft), 0.0, 1.0);
        if (rnd(cc.x, cc.y, z + 4) < 0.45) sp = max(sp, cov); else fk = max(fk, cov);
      }
    }
  }
  for (int i = 0; i < 12; i++) {
    if (i >= uNLines) break;
    vec4 L = uLines[i];
    vec2 d = L.zw - L.xy;
    float t = clamp(dot(pix + 0.5 - L.xy, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    float dist = length(pix + 0.5 - (L.xy + t * d));
    fk = max(fk, 0.784 * clamp(uLineW / 2.0 + 0.5 - dist, 0.0, 1.0));
  }

  // 3. paper texture, ink density, fine grain
  float m1 = field(pix, base / 7.0, 1) - 0.5;
  float m2 = field(pix, max(3.0, base / 60.0), 2) - 0.5;
  float dn = field(pix, base / 12.0, 3);
  float fine = rnd(int(pix.x), int(pix.y), 4) - 0.5;

  // 4. worn edges
  float ey = clamp(min(pix.y, H - 1.0 - pix.y) / (0.08 * base), 0.0, 1.0);
  float ex = clamp(min(pix.x, W - 1.0 - pix.x) / (0.08 * base), 0.0, 1.0);
  float edge = min(ey, ex);
  edge = 1.0 - (1.0 - edge) * (1.0 - edge);

  float ink = c * (0.9 + 0.1 * dn);
  ink = max(ink, sp * 0.85);
  ink = ink * (1.0 - fk * 0.8);
  ink = clamp(ink + fine * 0.05 * uGrain * c, 0.0, 1.0);

  float tex = 1.0 + uGrain * (0.035 * m1 + 0.025 * m2 + 0.03 * fine);
  tex = tex - uWear * 0.07 * (1.0 - edge);
  vec3 pap = uPaper * tex;
  pap.b -= uWear * 18.0 * (1.0 - edge);
  pap.g -= uWear * 6.0 * (1.0 - edge);
  vec3 col = pap * (1.0 - ink) + uInk * ink;
  outColor = vec4(clamp(col, 0.0, 255.0) / 255.0, 1.0);
}
`;

  var TRAIL = String.raw`#version 300 es
precision highp float;
uniform sampler2D uCur;
uniform sampler2D uPrev;
uniform float uDecay;
uniform vec3 uBg;
out vec4 outColor;
void main() {
  ivec2 gp = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uCur, gp, 0).rgb;
  vec3 p = texelFetch(uPrev, gp, 0).rgb;
  vec3 bg = uBg / 255.0;
  vec3 tr = bg + max(p - bg, vec3(0.0)) * uDecay;
  outColor = vec4(max(c, tr), 1.0);
}
`;

  window.OpArtShaders = { VERT: VERT, COVERAGE: COVERAGE, FINISH: FINISH, TRAIL: TRAIL };
})();
