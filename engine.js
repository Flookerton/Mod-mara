/* Op Art Studio: WebGL2 engine. Two passes: coverage (pattern -> ink amount per pixel,
   supersampled) into a one-channel texture, then finish (clean or vintage) to the screen
   or to an offscreen buffer for thumbnails and big PNG exports. */
(function () {
  "use strict";
  var SH = window.OpArtShaders, SP = window.OpArtSpec;

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error("Shader error: " + log);
    }
    return s;
  }
  function program(gl, vs, fs, names) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Shader link error: " + gl.getProgramInfoLog(p));
    var u = {};
    names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); });
    return { prog: p, u: u };
  }

  var COV_U = ["uRes", "uSS", "uT", "uP", "uKind", "uWarp", "uMotif", "uIll", "uWP", "uMP", "uIP", "uPoly", "uBox", "uList", "uLay", "uLay2"];
  var FIN_U = ["uCov", "uRes", "uVintage", "uPaper", "uInk", "uBlur", "uSpecks", "uGrain", "uWear", "uSeed", "uLines", "uNLines", "uLineW"];

  function Engine(canvas) {
    this.canvas = canvas;
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("This browser cannot run WebGL2, which the studio needs.");
    this.gl = gl;
    this.lost = false;
    this.init();
    var self = this;
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); self.lost = true; });
    canvas.addEventListener("webglcontextrestored", function () { self.lost = false; self.init(); if (self.onRestore) self.onRestore(); });
  }

  Engine.prototype.init = function () {
    var gl = this.gl;
    this.cov = program(gl, SH.VERT, SH.COVERAGE, COV_U);
    this.fin = program(gl, SH.VERT, SH.FINISH, FIN_U);
    this.vao = gl.createVertexArray();
    this.maxTex = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
    var vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    this.maxTex = Math.min(this.maxTex, vp[0], vp[1]);
    this.targets = {};
  };

  // a texture + framebuffer pair, cached by name and size
  Engine.prototype.target = function (name, w, h, fmt) {
    var gl = this.gl, t = this.targets[name];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (fmt === "r8") gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("This picture size is too big for this device.");
    t = this.targets[name] = { tex: tex, fb: fb, w: w, h: h };
    return t;
  };

  Engine.prototype.dropTarget = function (name) {
    var t = this.targets[name], gl = this.gl;
    if (!t) return;
    gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb);
    delete this.targets[name];
  };

  Engine.prototype.setCoverage = function (P, W, H, ss, t) {
    var gl = this.gl, u = this.cov.u;
    gl.useProgram(this.cov.prog);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform1i(u.uSS, Math.max(1, Math.min(4, ss | 0)));
    gl.uniform1f(u.uT, t || 0);
    gl.uniform1f(u.uP, P.period);
    gl.uniform1i(u.uKind, P.kind);
    gl.uniform1i(u.uWarp, P.warp);
    gl.uniform1i(u.uMotif, P.motif);
    gl.uniform1i(u.uIll, P.ill);
    gl.uniform4fv(u.uWP, P.WP);
    gl.uniform4fv(u.uMP, P.MP);
    gl.uniform4fv(u.uIP, P.IP);
    gl.uniform4fv(u.uPoly, P.POLY);
    gl.uniform4fv(u.uBox, P.BOX);
    gl.uniform4fv(u.uList, P.LIST);
    gl.uniform4fv(u.uLay, P.lay);
    gl.uniform4fv(u.uLay2, P.lay2);
  };

  Engine.prototype.setFinish = function (P, W, H, covTex) {
    var gl = this.gl, u = this.fin.u, f = P.finish;
    gl.useProgram(this.fin.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, covTex);
    gl.uniform1i(u.uCov, 0);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform1i(u.uVintage, f.vintage ? 1 : 0);
    gl.uniform3f(u.uPaper, f.paper[0], f.paper[1], f.paper[2]);
    gl.uniform3f(u.uInk, f.ink[0], f.ink[1], f.ink[2]);
    gl.uniform1f(u.uBlur, f.blur);
    gl.uniform1f(u.uSpecks, f.specks);
    gl.uniform1f(u.uGrain, f.grain);
    gl.uniform1f(u.uWear, f.wear);
    gl.uniform1ui(u.uSeed, P.seed >>> 0);
    var L = new Float32Array(48);
    f.lines.forEach(function (l, i) { L.set(l, i * 4); });
    gl.uniform4fv(u.uLines, L);
    gl.uniform1i(u.uNLines, f.lines.length);
    gl.uniform1f(u.uLineW, f.lineW);
  };

  // Render to the visible canvas at its current pixel size.
  Engine.prototype.renderView = function (spec, ss, t) {
    if (this.lost) return;
    var gl = this.gl, W = this.canvas.width, H = this.canvas.height;
    var P = SP.pack(spec, W, H);
    var cov = this.target("view", W, H, "r8");
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cov.fb);
    gl.viewport(0, 0, W, H);
    this.setCoverage(P, W, H, ss, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    this.setFinish(P, W, H, cov.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Small synchronous render into a 2D canvas (thumbnails, favorites).
  Engine.prototype.renderThumb = function (spec, w, h, ss, out, t) {
    if (this.lost) return;
    var gl = this.gl;
    var P = SP.pack(spec, w, h);
    var cov = this.target("thumbCov", w, h, "r8");
    var rgb = this.target("thumbRGB", w, h, "rgba");
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cov.fb);
    gl.viewport(0, 0, w, h);
    this.setCoverage(P, w, h, ss || 2, t || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rgb.fb);
    this.setFinish(P, w, h, cov.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    var px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    out.width = w; out.height = h;
    var ctx = out.getContext("2d");
    var img = ctx.createImageData(w, h), row = w * 4;
    for (var y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
  };

  function nextFrame() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // Big render in tiles so the GPU never gets one huge job. Returns a 2D canvas.
  Engine.prototype.renderLarge = async function (spec, W, H, ss, t, progress) {
    var gl = this.gl;
    if (W > this.maxTex || H > this.maxTex) throw new Error("This device can make pictures up to " + this.maxTex + " pixels wide.");
    var P = SP.pack(spec, W, H);
    var cov = this.target("bigCov", W, H, "r8");
    var TILE = 512, tiles = [], x, y;
    for (y = 0; y < H; y += TILE) for (x = 0; x < W; x += TILE) tiles.push([x, y, Math.min(TILE, W - x), Math.min(TILE, H - y)]);
    var total = tiles.length * 2 + 1, done = 0;
    gl.bindVertexArray(this.vao);
    gl.enable(gl.SCISSOR_TEST);
    try {
      for (var i = 0; i < tiles.length; i++) {
        var tl = tiles[i];
        gl.bindVertexArray(this.vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, cov.fb);
        gl.viewport(0, 0, W, H);
        gl.scissor(tl[0], tl[1], tl[2], tl[3]);
        this.setCoverage(P, W, H, ss, t);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
        if (progress) progress(++done / total);
        await nextFrame();
        if (this.lost) throw new Error("The graphics card was reset. Try a smaller size.");
      }
      var rgb = this.target("bigRGB", W, H, "rgba");
      for (i = 0; i < tiles.length; i++) {
        tl = tiles[i];
        gl.bindVertexArray(this.vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, rgb.fb);
        gl.viewport(0, 0, W, H);
        gl.scissor(tl[0], tl[1], tl[2], tl[3]);
        this.setFinish(P, W, H, cov.tex);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.flush();
        if (progress) progress(++done / total);
        await nextFrame();
        if (this.lost) throw new Error("The graphics card was reset. Try a smaller size.");
      }
    } finally {
      gl.disable(gl.SCISSOR_TEST);
    }
    var out = document.createElement("canvas");
    out.width = W; out.height = H;
    var ctx = out.getContext("2d");
    var band = Math.max(1, Math.floor(4000000 / (W * 4))), row = W * 4;
    gl.bindFramebuffer(gl.FRAMEBUFFER, rgb.fb);
    for (y = 0; y < H; y += band) {
      var bh = Math.min(band, H - y);
      var px = new Uint8Array(W * bh * 4);
      // GL rows count from the bottom
      gl.readPixels(0, H - y - bh, W, bh, gl.RGBA, gl.UNSIGNED_BYTE, px);
      var img = ctx.createImageData(W, bh);
      for (var r = 0; r < bh; r++) img.data.set(px.subarray((bh - 1 - r) * row, (bh - r) * row), r * row);
      ctx.putImageData(img, 0, y);
      await nextFrame();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.dropTarget("bigCov");
    this.dropTarget("bigRGB");
    if (progress) progress(1);
    return out;
  };

  window.OpArtEngine = Engine;
})();
