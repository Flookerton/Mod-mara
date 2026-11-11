/* Op Art Studio: random but tasteful settings. A port of the Python randomizer's ranges
   and weights. It uses its own seeded generator, so a seed number here does not make the
   same picture as the Python tool; the saved .json file is what describes a picture exactly. */
(function () {
  "use strict";
  var S = window.OpArtSpec;

  var WEIGHTS = { hermann: 0.4, phase_shapes: 0.6, flat: 0.5, zollner: 0.7, moire: 0.8,
    vortex: 1.4, bulge: 1.3, tunnel: 1.2, droste: 1.1, poincare: 1.1 };

  function R(seed) {
    var next = S.rng(seed);
    var r = {
      random: next,
      integers: function (a, b) { return a + Math.floor(next() * (b - a)); },   // a <= n < b
      uniform: function (a, b) { return a + next() * (b - a); },
      u: function (a, b) { return Math.round(r.uniform(a, b) * 1000) / 1000; },
      pick: function (opts) { return opts[Math.floor(next() * opts.length)]; },
      wpick: function (opts) {
        var w = opts.map(function (o) { return WEIGHTS[o] || 1; });
        var tot = w.reduce(function (a, b) { return a + b; }, 0), x = next() * tot;
        for (var i = 0; i < opts.length; i++) { x -= w[i]; if (x < 0) return opts[i]; }
        return opts[opts.length - 1];
      },
      shuffle: function (a) {
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      }
    };
    return r;
  }

  function randomWarp(r, name) {
    name = name || r.wpick(S.WARP_IDS);
    var p = { name: name };
    if (name === "flat") {
      p.cells = r.integers(6, 20); p.rotate = r.pick([0, 0, 45, r.u(-20, 20)]);
    } else if (name === "floor") {
      p.horizon = r.u(0.1, 0.6); p.height = r.u(0.6, 1.4); p.cells = r.integers(2, 6);
      p.angle = r.pick([0, 0, 45, r.u(-30, 30)]); p.ceiling = r.random() < 0.4; p.core_px = 2.0;
      if (p.ceiling) p.horizon = r.u(-0.15, 0.15);
    } else if (name === "tunnel") {
      p.cells = r.integers(3, 8) * 2; p.shape = r.pick(["square", "square", "round"]); p.aspect = r.pick([1.0, 1.0, r.u(1.0, 1.6)]);
      if (p.shape === "round") { p.cells = r.integers(5, 12) * 4; p.spin = r.pick([0.0, 0.0, r.u(-0.5, 0.5)]); }
    } else if (name === "bulge") {
      p.radius = r.u(0.55, 1.1); p.amount = r.u(0.35, 0.65); p.cells = r.integers(10, 22);
      p.cx = r.pick([0.0, 0.0, r.u(-0.35, 0.35)]); p.cy = r.pick([0.0, 0.0, r.u(-0.35, 0.35)]);
    } else if (name === "pinch") {
      p.radius = r.u(0.7, 1.2); p.amount = r.u(1.5, 2.8); p.cells = r.integers(8, 18);
    } else if (name === "vortex") {
      p.N = r.integers(5, 13) * 4; p.M = r.integers(-3, 4) * 4;
      if (p.M === 0 && r.random() < 0.7) p.M = 4;
    } else if (name === "wave") {
      p.cells = r.integers(10, 26); p.amp = r.u(0.4, 1.6); p.freq = r.u(0.8, 3.0);
      p.amp2 = r.pick([0.0, 0.0, r.u(0.2, 0.8)]); p.freq2 = r.u(0.5, 2.0); p.swell = r.u(0.0, 0.8);
    } else if (name === "twist") {
      p.radius = r.u(0.7, 1.2); p.turn = Math.round(r.u(1.0, 3.5) * r.pick([1, -1]) * 1000) / 1000; p.cells = r.integers(10, 20);
    } else if (name === "droste") {
      p.S = r.pick([2, 2, 3]); p.cells = r.pick([2, 3, 4, 4, 6]); p.twist = r.random() < 0.75; p.frame = r.pick([0.0, 0.04, 0.06]);
    } else if (name === "poincare") {
      var pq = r.pick([[6, 4], [4, 6], [5, 4], [8, 4], [4, 8], [3, 8], [7, 4]]);
      p.p = pq[0]; p.q = pq[1]; p.angle = r.u(0, 360);
    }
    return p;
  }

  function randomMotif(r, name) {
    name = name || r.pick(S.MOTIF_IDS);
    var p = { name: name, alternate: false };
    if (name === "dots") { p.radius = r.u(0.62, 0.86); p.alternate = r.random() < 0.6; }
    else if (name === "star4") { p.power = r.u(0.55, 0.75); p.k = r.u(0.8, 0.98); p.rot45 = r.random() < 0.3; p.alternate = r.random() < 0.6; }
    else if (name === "star6") { p.radius = r.u(0.8, 1.0); p.alternate = r.random() < 0.5; }
    else if (name === "hexagon") { p.radius = r.u(0.65, 0.9); p.ring = r.random() < 0.3; p.alternate = r.random() < 0.6; }
    else if (name === "cross") { p.width = r.u(0.22, 0.36); p.length = r.u(0.75, 1.0); p.rot45 = r.random() < 0.3; p.alternate = r.random() < 0.6; }
    else if (name === "rings") { p.count = r.integers(2, 4); p.alternate = r.random() < 0.5; }
    else if (name === "stripes") {
      p.count = r.integers(1, 4); p.duty = r.u(0.4, 0.6); p.direction = r.pick(["u", "v", "diag"]); p.alternate = r.random() < 0.6;
    } else if (name === "sato_parts") {
      var k = r.shuffle(S.SATO_KIT.slice());
      p.kit = k.slice(0, r.integers(1, 4)); p.rule = r.pick(["random", "random", "spin", "mirror"]);
      p.seed = r.integers(1, 10000); p.alternate = r.random() < 0.4;
    } else if (name === "interlock") {
      p.cu = [r.u(-0.2, 0.2), r.u(-0.08, 0.08), r.u(-0.04, 0.04)];
      p.cv = [r.u(-0.2, 0.2), r.u(-0.08, 0.08), r.u(-0.04, 0.04)];
      p.pu = [r.u(0, 1), r.u(0, 1), r.u(0, 1)];
      p.pv = [r.u(0, 1), r.u(0, 1), r.u(0, 1)];
    }
    if (r.random() < 0.15 && ["dots", "star4", "stripes", "cross"].indexOf(name) >= 0) {
      p.grade = { type: r.pick(["radial", "linear"]), amount: r.u(0.25, 0.5), angle: r.u(0, 360) };
    }
    if (name === "checker" || name === "interlock") delete p.alternate;
    return p;
  }

  function randomIllusion(r, name) {
    name = name || r.wpick(S.ILL_IDS);
    var p = { name: name };
    if (name === "cafe_wall") {
      p.rows = r.integers(7, 15); p.tile_ratio = r.u(1.0, 1.8); p.cycle = r.pick([4, 6, 8]);
      p.form = r.pick(["rows", "rows", "rings"]); p.around = r.integers(16, 36) * 2; p.mortar = r.u(0.07, 0.12);
    } else if (name === "fraser") {
      p.ring_step = r.u(0.24, 0.34); p.strands = r.integers(36, 60) * 2; p.slant = Math.round(r.u(1.4, 2.4) * r.pick([1, -1]) * 1000) / 1000;
      p.cord = r.u(0.3, 0.4); p.bg_spokes = r.integers(8, 14) * 2; p.bg_step = r.u(0.15, 0.35);
    } else if (name === "zollner") {
      p.angle = r.pick([45, -45, 90, r.u(20, 70)]); p.spacing = r.u(0.16, 0.28); p.hatch_angle = r.u(35, 60); p.hatch_step = r.u(0.06, 0.1);
    } else if (name === "ouchi") {
      var a = r.u(0.1, 0.2);
      var disks = [[0.0, 0.0, r.u(0.3, 0.55)]];
      if (r.random() < 0.4) {
        disks = [];
        var nd = r.integers(2, 5);
        for (var i = 0; i < nd; i++) disks.push([r.u(-0.6, 0.6), r.u(-0.6, 0.6), r.u(0.15, 0.35)]);
      }
      p.brick_long = a; p.brick_short = Math.round(a / r.u(3, 5) * 10000) / 10000; p.disks = disks;
    } else if (name === "hermann") {
      p.cells = r.integers(6, 13); p.street = r.u(0.12, 0.22); p.form = r.pick(["plain", "scintillating"]);
    } else if (name === "drift") {
      p.form = r.pick(["rings", "rings", "rows"]); p.elements = r.integers(8, 20) * 2; p.ring_step = r.u(0.2, 0.34);
      p.rows = r.integers(5, 10); p.curve = r.u(0.0, 0.4);
    } else if (name === "pinna") {
      var n = r.integers(2, 4);
      p.radii = n === 2 ? [0.45, 0.88] : [0.36, 0.62, 0.9]; p.size = r.u(0.08, 0.12); p.spacing = r.u(0.13, 0.18);
    } else if (name === "kanizsa") {
      p.form = r.pick(["triangles", "squares", "ehrenstein"]); p.spacing = r.u(0.25, 0.45); p.disk = r.u(0.26, 0.34);
      p.invert = r.random() < 0.3;
    } else if (name === "bulge_check") {
      p.cells = r.integers(7, 11) * 2; p.radius = r.u(0.7, 1.0);
    } else if (name === "tribar") {
      p.width = r.u(0.8, 1.2);
      p.tones = JSON.parse(JSON.stringify(r.pick(S.TRIBAR_TONES)[2]));
    } else if (name === "cubes") {
      p.size = r.u(0.1, 0.22); p.tones = r.pick(S.CUBE_TONES)[2].slice();
    } else if (name === "moire") {
      p.form = r.pick(["rings", "rings", "lines"]); p.pitch = r.u(0.02, 0.04); p.offset = r.u(0.05, 0.25);
      p.ratio = r.pick([1.0, r.u(0.92, 1.08)]); p.angle = r.u(2, 8); p.combine = r.pick(["xor", "and"]);
    } else if (name === "phase_shapes") {
      p.shapes = randomShapes(r);
      p.pitch = r.u(0.02, 0.035); p.angle = r.pick([0, 90, 45]); p.wobble = r.pick([0.0, 0.0, r.u(0.05, 0.2)]);
    }
    return p;
  }

  function randomShapes(r) {
    var shapes = [], n = r.integers(1, 5);
    for (var i = 0; i < n; i++) shapes.push([r.pick(["circle", "square", "diamond"]), r.u(-0.5, 0.5), r.u(-0.5, 0.5), r.u(0.2, 0.6)]);
    return shapes;
  }
  function randomDisks(r, count) {
    if (count <= 1) return [[0.0, 0.0, r.u(0.3, 0.55)]];
    var d = [];
    for (var i = 0; i < count; i++) d.push([r.u(-0.6, 0.6), r.u(-0.6, 0.6), r.u(0.15, 0.35)]);
    return d;
  }

  function randomLayout(r, name) {
    name = name || r.pick(["margin", "margin", "margin", "full", "circle"]);
    if (name === "full") return { name: "full", margin: 0.0 };
    if (name === "circle") return { name: "circle", shape: "circle", margin: 0.08, frame_line: r.pick([0.0, 0.006]), frame_gap: 0.03 };
    return { name: "margin", margin: r.u(0.05, 0.09), frame_line: r.pick([0.0, 0.0, 0.006]), frame_gap: 0.03 };
  }

  function randomFinish(r, name) {
    name = name || r.pick(["clean", "vintage", "vintage"]);
    if (name === "clean") return { name: "clean" };
    if (name === "phosphor") {
      return {
        name: "phosphor", color: r.pick([S.PHOSPHORS[0], S.PHOSPHORS[0], S.PHOSPHORS[0], S.PHOSPHORS[1], S.PHOSPHORS[2]]).slice(),
        glow: r.u(0.4, 0.9), scanlines: r.u(0.4, 0.8), bleed: r.u(0.2, 0.7), vignette: r.u(0.3, 0.7),
        noise: r.u(0.2, 0.6), afterglow: r.u(0.4, 0.8)
      };
    }
    return {
      name: "vintage", paper: r.pick(S.PAPERS).slice(), ink: r.pick(S.INKS).slice(),
      blur: r.u(0.4, 0.9), specks: r.u(0.5, 1.5), grain: r.u(0.7, 1.3), wear: r.u(0.4, 1.2)
    };
  }

  // detailed motifs need bigger tiles to stay readable (same rule as the Python tool)
  function fitCells(w, motifName) {
    var f = { rings: 0.55, sato_parts: 0.75, star6: 0.75, star4: 0.8, cross: 0.8, hexagon: 0.85, stripes: 0.8 }[motifName] || 1.0;
    if (f >= 1) return w;
    if ("cells" in w && w.name !== "droste" && w.name !== "floor") {
      var step = (w.name === "tunnel" && w.shape === "round") ? 4 : (w.name === "tunnel" ? 2 : 1);
      w.cells = Math.max(step * 2, S.pyRound(w.cells * f / step) * step);
    }
    if (w.name === "vortex") w.N = Math.max(16, S.pyRound(w.N * f / 4) * 4);
    return w;
  }

  function newSeed() { return 1 + Math.floor(Math.random() * 99999998); }

  // locks: {kind, warp, motif, illusion, layout, finish}: true keeps that part of `cur`
  function surprise(cur, locks, seed, finishName) {
    seed = seed || newSeed();
    var r = R(seed);
    locks = locks || {};
    var kind = locks.kind ? cur.kind : (r.random() < 0.3 ? "illusion" : "pattern");
    if (!locks.kind && cur.kind === "pattern" && (locks.warp || locks.motif)) kind = "pattern";
    if (!locks.kind && cur.kind === "illusion" && locks.illusion) kind = "illusion";
    var spec = { kind: kind, seed: seed };
    if (kind === "illusion") {
      spec.illusion = locks.illusion && cur.illusion ? cur.illusion : randomIllusion(r);
    } else {
      var keepW = locks.warp && cur.warp, keepM = locks.motif && cur.motif;
      spec.warp = keepW ? cur.warp : randomWarp(r);
      spec.motif = keepM ? cur.motif : randomMotif(r);
      if (!keepW) spec.warp = fitCells(spec.warp, spec.motif.name);
    }
    spec.layout = locks.layout ? cur.layout : randomLayout(r);
    spec.finish = locks.finish ? cur.finish : randomFinish(r, finishName);
    spec.size = cur.size || "square";
    return JSON.parse(JSON.stringify(spec));
  }

  window.OpArtRandom = {
    R: R, newSeed: newSeed, surprise: surprise, randomWarp: randomWarp, randomMotif: randomMotif,
    randomIllusion: randomIllusion, randomLayout: randomLayout, randomFinish: randomFinish,
    randomShapes: randomShapes, randomDisks: randomDisks, fitCells: fitCells
  };
})();
