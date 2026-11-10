/* Op Art Studio: settings ("spec") schema, defaults, safe import, and uniform packing.
   Defaults match the Python generator so exported .json files render the same there. */
(function () {
  "use strict";
  var TAU = Math.PI * 2;

  // Python's round(): halves go to the even neighbor
  function pyRound(x) {
    var f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }
  function pyInt(x) { return Math.trunc(x); }
  function pmod(a, m) { return ((a % m) + m) % m; }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

  // ---------------------------------------------------------------- schema
  // n: number, i: whole number, b: on/off, e: choice. lim = allowed range on import,
  // min/max = slider range. adv: hidden from the panel but kept and checked.
  function N(key, label, def, min, max, step, lim, extra) {
    var p = { key: key, label: label, type: "n", def: def, min: min, max: max, step: step, lim: lim || [min, max] };
    return Object.assign(p, extra || {});
  }
  function I(key, label, def, min, max, step, lim, extra) {
    var p = N(key, label, def, min, max, step || 1, lim, extra);
    p.type = "i";
    return p;
  }
  function B(key, label, def, extra) { return Object.assign({ key: key, label: label, type: "b", def: def }, extra || {}); }
  function E(key, label, def, options, extra) {
    return Object.assign({ key: key, label: label, type: "e", def: def, options: options }, extra || {});
  }

  var WARP_COMMON = [
    N("rotate", "Rotate", 0, -180, 180, 1, [-360, 360]),
    E("core", "Tiny-tile center", "ink", [["ink", "Ink"], ["paper", "Paper"]], { adv: true }),
    N("core_px", "Center size", 3, 1, 8, 0.5, [0.5, 20], { adv: true })
  ];

  var WARPS = {
    flat: { label: "Flat", hint: "Plain even grid", params: [I("cells", "Tiles across", 12, 2, 40, 1, [1, 200])] },
    floor: { label: "Floor", hint: "Checkered floor running to the horizon", params: [
      N("horizon", "Horizon", 0.35, -0.6, 0.9, 0.01, [-2, 2]),
      N("height", "Eye height", 1.0, 0.3, 2.0, 0.01, [0.05, 10]),
      I("cells", "Tile size", 4, 1, 10, 1, [1, 100]),
      N("angle", "Turn", 0, -60, 60, 1, [-360, 360]),
      B("ceiling", "Ceiling too", false)] },
    tunnel: { label: "Tunnel", hint: "Corridor into the distance", params: [
      I("cells", "Tiles around", 8, 4, 48, 2, [2, 200]),
      E("shape", "Shape", "square", [["square", "Square"], ["round", "Round"]]),
      N("aspect", "Width", 1.0, 0.5, 2.0, 0.01, [0.1, 10]),
      N("spin", "Spin", 0, -1, 1, 0.01, [-5, 5])] },
    bulge: { label: "Bulge", hint: "Grid swelling toward you", params: [
      N("radius", "Size", 0.8, 0.3, 1.4, 0.01, [0.05, 5]),
      N("amount", "Swell", 0.5, -0.9, 0.9, 0.01, [-3, 3]),
      I("cells", "Tiles across", 14, 4, 40, 1, [1, 200]),
      N("cx", "Center left/right", 0, -0.8, 0.8, 0.01, [-3, 3]),
      N("cy", "Center up/down", 0, -0.8, 0.8, 0.01, [-3, 3]),
      B("breathe", "Breathe when playing", true)] },
    pinch: { label: "Funnel", hint: "Tiles shrink into a hole", params: [
      N("radius", "Size", 0.9, 0.3, 1.5, 0.01, [0.05, 5]),
      N("amount", "Depth", 2.5, 0.2, 2.85, 0.01, [-5, 5]),
      I("cells", "Tiles across", 14, 4, 40, 1, [1, 200]),
      N("cx", "Center left/right", 0, -0.8, 0.8, 0.01, [-3, 3]),
      N("cy", "Center up/down", 0, -0.8, 0.8, 0.01, [-3, 3]),
      B("breathe", "Breathe when playing", true)] },
    vortex: { label: "Vortex", hint: "Spiral that never ends", params: [
      I("N", "Spokes", 36, 4, 80, 4, [4, 400]),
      I("M", "Twist", 4, -24, 24, 4, [-400, 400]),
      N("cx", "Center left/right", 0, -0.8, 0.8, 0.01, [-3, 3]),
      N("cy", "Center up/down", 0, -0.8, 0.8, 0.01, [-3, 3])] },
    wave: { label: "Wave", hint: "Rippling lines", params: [
      I("cells", "Tiles across", 16, 4, 48, 1, [1, 200]),
      N("amp", "Ripple", 0.6, 0, 2.5, 0.01, [-10, 10]),
      N("freq", "Ripples", 1.5, 0.2, 5, 0.01, [0, 50]),
      N("amp2", "Cross ripple", 0, 0, 1.5, 0.01, [-10, 10]),
      N("freq2", "Cross ripples", 1.0, 0.2, 5, 0.01, [0, 50]),
      N("swell", "Swell", 0.5, 0, 1, 0.01, [-5, 5])] },
    twist: { label: "Twist", hint: "Grid wrung like a cloth", params: [
      N("radius", "Size", 0.9, 0.3, 1.5, 0.01, [0.05, 5]),
      N("turn", "Turn", 2.0, -5, 5, 0.01, [-50, 50]),
      I("cells", "Tiles across", 14, 4, 40, 1, [1, 200]),
      N("cx", "Center left/right", 0, -0.8, 0.8, 0.01, [-3, 3]),
      N("cy", "Center up/down", 0, -0.8, 0.8, 0.01, [-3, 3])] },
    droste: { label: "Droste", hint: "Picture inside itself", params: [
      I("S", "Zoom step", 2, 2, 5, 1, [2, 20]),
      I("cells", "Tiles", 4, 1, 10, 1, [1, 50]),
      B("twist", "Spiral", true),
      N("frame", "Frame", 0.06, 0, 0.15, 0.005, [0, 1])] },
    poincare: { label: "Hyperbolic", hint: "Endless tiles in a disk", params: [
      E("pq", "Tiling", "6,4", [["6,4", "Hexagons"], ["4,6", "Squares"], ["5,4", "Pentagons"], ["8,4", "Octagons"],
        ["4,8", "Fine squares"], ["3,8", "Triangles"], ["7,4", "Heptagons"]], { virtual: true }),
      N("angle", "Turn", 0, 0, 360, 1, [-3600, 3600]),
      N("disk", "Disk size", 0.98, 0.5, 1.0, 0.01, [0.1, 2]),
      I("p", "p", 6, 3, 12, 1, [3, 12], { adv: true }),
      I("q", "q", 4, 3, 12, 1, [3, 12], { adv: true })] }
  };
  Object.keys(WARPS).forEach(function (k) { WARPS[k].params = WARPS[k].params.concat(WARP_COMMON); });

  var GRADE_MOTIFS = ["dots", "star4", "star6", "hexagon", "cross", "stripes"];
  var SATO_KIT = ["quarter", "half", "triangle", "arcs", "bar", "ring"];
  var SATO_LABELS = { quarter: "Quarter disk", half: "Half disk", triangle: "Triangle", arcs: "Arcs", bar: "Bar", ring: "Quarter ring" };

  var MOTIFS = {
    checker: { label: "Checker", params: [] },
    dots: { label: "Dots", params: [N("radius", "Dot size", 0.8, 0.2, 1.0, 0.01, [0, 2])] },
    star4: { label: "4-point star", params: [
      N("power", "Pointiness", 0.62, 0.35, 1.2, 0.01, [0.1, 4]),
      N("k", "Star size", 0.85, 0.4, 1.2, 0.01, [0, 3]),
      B("rot45", "Turn 45 degrees", false)] },
    star6: { label: "6-point star", params: [N("radius", "Star size", 0.95, 0.4, 1.2, 0.01, [0, 3])] },
    hexagon: { label: "Hexagon", params: [
      N("radius", "Size", 0.8, 0.3, 1.1, 0.01, [0, 3]),
      B("ring", "Outline only", false)] },
    cross: { label: "Cross", params: [
      N("width", "Arm width", 0.3, 0.08, 0.6, 0.01, [0, 2]),
      N("length", "Arm length", 0.9, 0.4, 1.2, 0.01, [0, 3]),
      B("rot45", "Turn 45 degrees", false)] },
    rings: { label: "Rings", params: [I("count", "Rings", 3, 1, 6, 1, [1, 20])] },
    stripes: { label: "Stripes", params: [
      I("count", "Stripes per tile", 2, 1, 6, 1, [1, 30]),
      N("duty", "Stripe width", 0.5, 0.05, 0.95, 0.01, [0, 1]),
      E("direction", "Direction", "u", [["u", "Across"], ["v", "Along"], ["diag", "Diagonal"]])] },
    sato_parts: { label: "Parts kit", params: [
      E("kit", "Parts", null, null, { kit: true }),
      E("rule", "Rule", "random", [["random", "Random"], ["spin", "Spin"], ["mirror", "Mirror"]]),
      I("seed", "Shuffle", 1, 1, 9999, 1, [-1e9, 1e9]),
      I("period", "Repeat", 4, 1, 8, 1, [1, 64], { adv: true })] },
    interlock: { label: "Interlock", params: [
      N("cu.0", "Bend 1", 0.18, -0.25, 0.25, 0.005, [-1, 1]),
      N("cv.0", "Bend 2", 0.15, -0.25, 0.25, 0.005, [-1, 1]),
      N("cu.1", "Wiggle 1", 0.06, -0.1, 0.1, 0.002, [-1, 1]),
      N("cv.1", "Wiggle 2", -0.07, -0.1, 0.1, 0.002, [-1, 1]),
      N("pu.0", "Shift", 0.0, 0, 1, 0.01, [-10, 10])] }
  };
  var MOTIF_COMMON = [
    B("alternate", "Swap colors tile by tile", false, { noFor: ["checker", "interlock"] }),
    B("invert", "Invert", false),
    E("grade", "Size ramp", "none", [["none", "None"], ["radial", "From the middle"], ["linear", "Side to side"]],
      { onlyFor: GRADE_MOTIFS, virtual: true }),
    N("grade.amount", "Ramp amount", 0.4, 0.05, 0.8, 0.01, [0, 2], { onlyFor: GRADE_MOTIFS, virtual: true }),
    N("grade.angle", "Ramp direction", 90, 0, 360, 1, [-3600, 3600], { onlyFor: GRADE_MOTIFS, virtual: true }),
    N("min_cell_px", "Detail limit", 0, 0, 30, 1, [0, 200], { adv: true, optional: true })
  ];
  Object.keys(MOTIFS).forEach(function (k) { MOTIFS[k].params = MOTIFS[k].params.concat(MOTIF_COMMON); });

  var TRIBAR_TONES = [
    ["light", "Light top", { top: "white", x: "black", y: "hatch" }],
    ["hatched", "Hatched top", { top: "hatch", x: "black", y: "white" }],
    ["side", "Hatched side", { top: "white", x: "hatch", y: "white" }]
  ];
  var CUBE_TONES = [
    ["wbh", "Light tops", ["white", "black", "hatch"]],
    ["hbw", "Hatched tops", ["hatch", "black", "white"]],
    ["bwh", "Dark tops", ["black", "white", "hatch"]]
  ];

  var ILLUSIONS = {
    cafe_wall: { label: "Cafe wall", params: [
      E("form", "Form", "rows", [["rows", "Rows"], ["rings", "Rings"]]),
      I("rows", "Rows", 10, 4, 24, 1, [1, 200]),
      I("around", "Tiles around", 40, 16, 96, 2, [8, 400]),
      N("tile_ratio", "Tile length", 1.4, 0.8, 2.4, 0.01, [0.1, 10]),
      N("mortar", "Mortar", 0.09, 0.03, 0.2, 0.005, [0, 1]),
      I("cycle", "Shift cycle", 6, 2, 12, 1, [1, 100]),
      N("shift", "Shift", 0.5, 0, 1, 0.01, [-5, 5]),
      N("mortar_level", "Mortar gray", 0.5, 0, 1, 0.01, [0, 1])] },
    fraser: { label: "Fraser spiral", params: [
      N("ring_step", "Ring spacing", 0.3, 0.15, 0.5, 0.005, [0.02, 3]),
      I("strands", "Strands", 72, 24, 140, 2, [2, 1000]),
      N("slant", "Slant", 1.6, -3, 3, 0.01, [-20, 20]),
      N("cord", "Cord width", 0.34, 0.15, 0.6, 0.01, [0, 1]),
      I("bg_spokes", "Background checks", 20, 8, 40, 2, [2, 400]),
      N("bg_step", "Background step", 0.25, 0, 0.6, 0.01, [-5, 5]),
      N("gap", "Gap", 0.06, 0, 0.15, 0.005, [0, 1], { adv: true }),
      N("core", "Center dot", 0.06, 0, 0.2, 0.005, [0, 2], { adv: true })] },
    zollner: { label: "Zollner lines", params: [
      N("angle", "Line angle", 45, -90, 90, 1, [-360, 360]),
      N("spacing", "Spacing", 0.22, 0.1, 0.4, 0.005, [0.02, 3]),
      N("line", "Line width", 0.035, 0.01, 0.08, 0.001, [0.001, 1]),
      N("hatch_angle", "Hatch angle", 45, 20, 70, 1, [-360, 360]),
      N("hatch_step", "Hatch spacing", 0.08, 0.04, 0.16, 0.002, [0.01, 2]),
      N("hatch_len", "Hatch length", 0, 0, 1, 0.01, [0, 5], { adv: true, optional: true }),
      N("hatch_w", "Hatch width", 0, 0, 1, 0.001, [0, 1], { adv: true, optional: true })] },
    ouchi: { label: "Ouchi", params: [
      N("brick_long", "Brick length", 0.16, 0.06, 0.3, 0.005, [0.005, 3]),
      N("brick_short", "Brick height", 0.04, 0.01, 0.1, 0.002, [0.002, 3]),
      N("disks.0.2", "Disk size", 0.42, 0.1, 0.8, 0.01, [0, 5], { virtual: true })] },
    hermann: { label: "Grid", params: [
      E("form", "Form", "plain", [["plain", "Plain"], ["scintillating", "Sparkling"]]),
      I("cells", "Squares across", 9, 4, 20, 1, [1, 200]),
      N("street", "Street width", 0.18, 0.06, 0.4, 0.005, [0, 1])] },
    drift: { label: "Drift", params: [
      E("form", "Form", "rings", [["rings", "Rings"], ["rows", "Rows"]]),
      I("elements", "Steps around", 24, 8, 48, 2, [1, 400]),
      I("rows", "Rows", 8, 3, 16, 1, [1, 200]),
      N("ring_step", "Ring spacing", 0.28, 0.15, 0.45, 0.005, [0.02, 3]),
      N("curve", "Curve", 0.25, 0, 0.6, 0.01, [-5, 5]),
      N("gap", "Gap", 0.04, 0, 0.15, 0.005, [0, 0.5], { adv: true }),
      N("core", "Center dot", 0.08, 0, 0.2, 0.005, [0, 2], { adv: true })] },
    pinna: { label: "Pinna rings", params: [
      E("radii", "Rings", "2", [["2", "Two"], ["3", "Three"]], { virtual: true }),
      N("size", "Square size", 0.11, 0.05, 0.18, 0.002, [0.005, 1]),
      N("spacing", "Spacing", 0.16, 0.1, 0.25, 0.002, [0.02, 2]),
      N("bg", "Background gray", 0.3, 0, 0.7, 0.01, [0, 1]),
      N("edge", "Edge width", 0.2, 0.1, 0.4, 0.01, [0, 0.5]),
      N("extra_tilt", "Extra tilt", 0, -45, 45, 1, [-360, 360]),
      N("dot", "Center dot", 0.02, 0, 0.06, 0.002, [0, 1], { adv: true })] },
    kanizsa: { label: "Hidden shapes", params: [
      E("form", "Form", "triangles", [["triangles", "Triangles"], ["squares", "Squares"], ["ehrenstein", "Glowing gaps"]]),
      N("spacing", "Spacing", 0.36, 0.15, 0.6, 0.005, [0.02, 3]),
      N("disk", "Disk size", 0.3, 0.15, 0.45, 0.005, [0, 1]),
      B("invert", "Invert", false),
      N("line", "Line width", 0.024, 0.008, 0.05, 0.001, [0.001, 1], { adv: true }),
      N("gap", "Gap size", 0.17, 0.05, 0.35, 0.005, [0, 1], { adv: true })] },
    bulge_check: { label: "Bulging check", params: [
      I("cells", "Squares across", 14, 8, 28, 2, [2, 200]),
      N("radius", "Bulge size", 0.85, 0.4, 1.4, 0.01, [0, 5]),
      N("dot", "Corner squares", 0.2, 0.08, 0.35, 0.005, [0, 0.5]),
      N("inset", "Inset", 0.05, 0, 0.15, 0.005, [0, 0.5]),
      E("sense", "Direction", "1", [["1", "Out"], ["-1", "In"]], { virtual: true }),
      N("cx", "Center left/right", 0, -0.6, 0.6, 0.01, [-3, 3]),
      N("cy", "Center up/down", 0, -0.6, 0.6, 0.01, [-3, 3])] },
    tribar: { label: "Impossible triangle", params: [
      E("tones", "Shading", "light", TRIBAR_TONES.map(function (t) { return [t[0], t[1]]; }), { virtual: true }),
      N("width", "Bar width", 1.0, 0.6, 1.5, 0.01, [0.1, 3]),
      N("scale", "Size", 0.3, 0.15, 0.36, 0.005, [0.01, 2]),
      N("hatch", "Hatch spacing", 0.12, 0.06, 0.25, 0.005, [0.01, 1]),
      N("line", "Outline", 0.01, 0, 0.03, 0.001, [0, 0.2]),
      N("length", "Bar length", 5, 3, 8, 0.1, [1.5, 20], { adv: true })] },
    cubes: { label: "Tumbling blocks", params: [
      E("tones", "Shading", "wbh", CUBE_TONES.map(function (t) { return [t[0], t[1]]; }), { virtual: true }),
      N("size", "Block size", 0.16, 0.06, 0.3, 0.005, [0.01, 3]),
      N("hatch", "Hatch spacing", 0.14, 0.06, 0.3, 0.005, [0.01, 1]),
      N("line", "Edge lines", 0, 0, 0.02, 0.001, [0, 0.2])] },
    moire: { label: "Moire", params: [
      E("form", "Form", "rings", [["rings", "Rings"], ["lines", "Lines"]]),
      E("combine", "Mix", "xor", [["xor", "Swap"], ["and", "Overlap"]]),
      N("pitch", "Line spacing", 0.035, 0.012, 0.06, 0.001, [0.003, 1]),
      N("offset", "Ring offset", 0.12, 0, 0.4, 0.005, [-3, 3]),
      N("angle", "Line angle", 4, 0, 20, 0.1, [-360, 360]),
      N("ratio", "Spacing ratio", 1.0, 0.85, 1.15, 0.005, [0.1, 10])] },
    phase_shapes: { label: "Shimmer shapes", params: [
      N("pitch", "Line spacing", 0.03, 0.012, 0.05, 0.001, [0.003, 1]),
      E("angle", "Line angle", "0", [["0", "Upright"], ["90", "Flat"], ["45", "Slanted"]], { virtual: true }),
      N("wobble", "Wobble", 0, 0, 0.3, 0.005, [-2, 2]),
      N("duty", "Line width", 0.5, 0.2, 0.8, 0.01, [0, 1])] }
  };

  var LAYOUTS = [["margin", "Margin"], ["full", "Full bleed"], ["circle", "Circle"]];
  var PAPERS = [[241, 233, 214], [238, 228, 205], [244, 239, 226]];
  var INKS = [[27, 25, 24], [22, 22, 26], [35, 30, 26]];

  // picture formats: names match the Python presets so exported files work there
  var SIZES = [
    ["square", "Square", 2160, 2160],
    ["print_8x10", "Portrait 4:5", 2400, 3000],
    ["print_24x36", "Poster 2:3", 7200, 10800],
    ["print_36x24", "Landscape 3:2", 10800, 7200],
    ["story", "Phone 9:16", 1080, 1920],
    ["hd", "Wide 16:9", 1920, 1080],
    ["book_cover", "Book cover", 1600, 2560]
  ];
  function sizeInfo(name) {
    for (var i = 0; i < SIZES.length; i++) if (SIZES[i][0] === name) return SIZES[i];
    return SIZES[0];
  }

  var MIN_CELL_PX = { checker: 3, dots: 7, star4: 9, star6: 10, hexagon: 8, cross: 8, rings: 14, stripes: 8, sato_parts: 8, interlock: 6 };
  var PERIOD = { sato_parts: 4, interlock: 2, checker: 2 };
  var WARP_IDS = ["flat", "floor", "tunnel", "bulge", "pinch", "vortex", "wave", "twist", "droste", "poincare"];
  var MOTIF_IDS = ["checker", "dots", "star4", "star6", "hexagon", "cross", "rings", "stripes", "sato_parts", "interlock"];
  var ILL_IDS = ["cafe_wall", "fraser", "zollner", "ouchi", "hermann", "drift", "pinna", "kanizsa", "bulge_check", "tribar",
    "cubes", "moire", "phase_shapes"];

  // ---------------------------------------------------------------- defaults
  function defaultsFor(schema, name) {
    var o = { name: name };
    schema[name].params.forEach(function (p) {
      if (p.virtual || p.optional || p.kit || p.key.indexOf(".") >= 0) return;
      o[p.key] = p.def;
    });
    return o;
  }
  function defaultWarp(name) {
    var w = defaultsFor(WARPS, name);
    delete w.core; delete w.core_px; delete w.rotate;
    if (name !== "flat") delete w.rotate;
    return w;
  }
  function defaultMotif(name) {
    var m = defaultsFor(MOTIFS, name);
    delete m.min_cell_px;
    if (name === "sato_parts") { m.kit = ["quarter", "half", "triangle"]; m.seed = 1; delete m.period; }
    if (name === "interlock") {
      m.cu = [0.18, 0.06, 0.03]; m.cv = [0.15, -0.07, 0.02]; m.pu = [0.0, 0.3, 0.7]; m.pv = [0.2, 0.5, 0.1];
    }
    if (name === "checker" || name === "interlock") delete m.alternate;
    return m;
  }
  function defaultIllusion(name) {
    var o = defaultsFor(ILLUSIONS, name);
    if (name === "ouchi") o.disks = [[0.0, 0.0, 0.42]];
    if (name === "pinna") o.radii = [0.5, 0.86];
    if (name === "bulge_check") o.sense = 1;
    if (name === "tribar") o.tones = { top: "white", x: "black", y: "hatch" };
    if (name === "cubes") o.tones = ["white", "black", "hatch"];
    if (name === "phase_shapes") { o.angle = 0; o.shapes = [["circle", 0.0, 0.0, 0.55]]; }
    if (name === "cafe_wall") { delete o.around; }
    if (name === "drift") { delete o.rows; }
    return o;
  }
  function defaultLayout(name) {
    if (name === "full") return { name: "full", margin: 0.0 };
    if (name === "circle") return { name: "circle", shape: "circle", margin: 0.08, frame_line: 0.0, frame_gap: 0.03 };
    return { name: "margin", margin: 0.06, frame_line: 0.0, frame_gap: 0.03 };
  }
  function defaultFinish(name) {
    if (name === "vintage") return { name: "vintage", paper: [241, 233, 214], ink: [27, 25, 24], blur: 0.6, specks: 1.0, grain: 1.0, wear: 1.0 };
    return { name: "clean" };
  }
  function defaultSpec() {
    return {
      kind: "pattern", seed: 1,
      warp: { name: "vortex", N: 36, M: 4 },
      motif: { name: "star6", radius: 0.9, alternate: true },
      layout: defaultLayout("margin"),
      finish: defaultFinish("vintage"),
      size: "square"
    };
  }

  // ---------------------------------------------------------------- safe import
  function num(v, def, lim) {
    if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) v = Number(v);
    if (typeof v !== "number" || !isFinite(v)) return def;
    if (lim) v = clamp(v, lim[0], lim[1]);
    return v;
  }
  function bool(v, def) { return typeof v === "boolean" ? v : (v === 0 || v === 1 ? !!v : def); }
  function pick(v, opts, def) { return opts.indexOf(v) >= 0 ? v : def; }
  function numList(v, n, lim, def) {
    if (!Array.isArray(v)) return def.slice();
    var out = [];
    for (var i = 0; i < Math.min(v.length, n); i++) out.push(num(v[i], 0, lim));
    while (out.length < def.length && out.length < n) out.push(def[out.length]);
    return out;
  }
  function optKeys(p) { return p.options ? p.options.map(function (o) { return o[0]; }) : []; }

  // copy only known keys, type-check and clamp each
  function cleanParams(src, schema, name) {
    var out = { name: name };
    schema[name].params.forEach(function (p) {
      if (p.virtual || p.kit || p.key.indexOf(".") >= 0) return;
      if (!(p.key in src)) return;
      var v = src[p.key];
      if (p.type === "n") out[p.key] = num(v, p.def, p.lim);
      else if (p.type === "i") out[p.key] = Math.round(num(v, p.def, p.lim));
      else if (p.type === "b") out[p.key] = bool(v, p.def);
      else if (p.type === "e") out[p.key] = pick(v, optKeys(p), p.def);
    });
    return out;
  }

  function cleanWarp(w) {
    if (!w || typeof w !== "object") return defaultWarp("vortex");
    var name = pick(w.name, WARP_IDS, null);
    if (!name) return defaultWarp("vortex");
    var o = cleanParams(w, WARPS, name);
    if (name === "poincare") {
      if ("p" in w) o.p = Math.round(num(w.p, 6, [3, 12]));
      if ("q" in w) o.q = Math.round(num(w.q, 4, [3, 12]));
    }
    return o;
  }
  function cleanMotif(m) {
    if (!m || typeof m !== "object") return defaultMotif("star6");
    var name = pick(m.name, MOTIF_IDS, null);
    if (!name) return defaultMotif("star6");
    var o = cleanParams(m, MOTIFS, name);
    if ("alternate" in m) o.alternate = bool(m.alternate, false);
    if ("invert" in m) o.invert = bool(m.invert, false);
    if (name === "sato_parts") {
      var kit = Array.isArray(m.kit) ? m.kit.filter(function (k) { return SATO_KIT.indexOf(k) >= 0; }).slice(0, 6) : [];
      o.kit = kit.length ? kit : ["quarter", "half", "triangle"];
    }
    if (name === "interlock") {
      o.cu = numList(m.cu, 3, [-1, 1], [0.18, 0.06, 0.03]);
      o.cv = numList(m.cv, 3, [-1, 1], [0.15, -0.07, 0.02]);
      o.pu = numList(m.pu, 3, [-10, 10], [0.0, 0.3, 0.7]);
      o.pv = numList(m.pv, 3, [-10, 10], [0.2, 0.5, 0.1]);
    }
    if (m.grade && typeof m.grade === "object") {
      o.grade = {
        type: m.grade.type === "radial" ? "radial" : "linear",
        amount: num(m.grade.amount, 0.4, [0, 2]),
        angle: num(m.grade.angle, 90, [-3600, 3600])
      };
    }
    return o;
  }
  function cleanIllusion(p) {
    if (!p || typeof p !== "object") return defaultIllusion("cafe_wall");
    var name = pick(p.name, ILL_IDS, null);
    if (!name) return defaultIllusion("cafe_wall");
    var o = cleanParams(p, ILLUSIONS, name);
    if (name === "cafe_wall" && "around" in p) o.around = Math.round(num(p.around, 40, [8, 400]));
    if (name === "drift") {
      if ("rows" in p) o.rows = Math.round(num(p.rows, 8, [1, 200]));
      if (Array.isArray(p.widths)) {
        var w = numList(p.widths, 4, [0.001, 10], [0.38, 0.12, 0.38, 0.12]);
        if (w.length === 4) o.widths = w;
      }
    }
    if (name === "ouchi") {
      var disks = Array.isArray(p.disks) ? p.disks.slice(0, 8) : [];
      o.disks = disks.filter(Array.isArray).map(function (d) {
        return [num(d[0], 0, [-5, 5]), num(d[1], 0, [-5, 5]), num(d[2], 0.4, [0, 5])];
      });
      if (!o.disks.length) o.disks = [[0.0, 0.0, 0.42]];
    }
    if (name === "pinna") o.radii = numList(p.radii, 4, [0.02, 3], [0.5, 0.86]);
    if (name === "bulge_check" && "sense" in p) o.sense = num(p.sense, 1, [-1, 1]) < 0 ? -1 : 1;
    if (name === "tribar") {
      var tn = p.tones && typeof p.tones === "object" ? p.tones : {};
      var tv = ["white", "black", "hatch"];
      o.tones = { top: pick(tn.top, tv, "white"), x: pick(tn.x, tv, "black"), y: pick(tn.y, tv, "hatch") };
      if (Array.isArray(p.order)) {
        var ord = p.order.slice(0, 3).map(function (v) { return Math.round(num(v, 0, [0, 2])); });
        if (ord.length) o.order = ord;
      }
      if ("close" in p) o.close = bool(p.close, true);
    }
    if (name === "cubes") {
      var tv2 = ["white", "black", "hatch"];
      var t = Array.isArray(p.tones) ? p.tones : [];
      o.tones = [pick(t[0], tv2, "white"), pick(t[1], tv2, "black"), pick(t[2], tv2, "hatch")];
    }
    if (name === "phase_shapes") {
      o.angle = num(p.angle, 0, [-360, 360]);
      var sh = Array.isArray(p.shapes) ? p.shapes.slice(0, 8) : [];
      o.shapes = sh.filter(Array.isArray).map(function (s) {
        return [pick(s[0], ["circle", "square", "diamond"], "circle"), num(s[1], 0, [-5, 5]), num(s[2], 0, [-5, 5]), num(s[3], 0.3, [0, 5])];
      });
      if (!o.shapes.length) o.shapes = [["circle", 0.0, 0.0, 0.55]];
    }
    return o;
  }
  function cleanLayout(l) {
    if (!l || typeof l !== "object") return { name: "full", margin: 0.0 };   // Python draws edge to edge without a layout
    var o = { name: pick(l.name, ["margin", "full", "circle"], "margin") };
    if (l.shape === "circle") o.shape = "circle";
    o.margin = num(l.margin, 0, [0, 0.4]);
    if ("frame_line" in l) o.frame_line = num(l.frame_line, 0, [0, 0.05]);
    if ("frame_gap" in l) o.frame_gap = num(l.frame_gap, 0.025, [0, 0.2]);
    return o;
  }
  function color(v, def) {
    if (!Array.isArray(v) || v.length < 3) return def.slice();
    return [0, 1, 2].map(function (i) { return Math.round(num(v[i], def[i], [0, 255])); });
  }
  function cleanFinish(f) {
    if (!f || typeof f !== "object") return defaultFinish("clean");
    if (f.name === "vintage") {
      return {
        name: "vintage", paper: color(f.paper, [241, 233, 214]), ink: color(f.ink, [27, 25, 24]),
        blur: num(f.blur, 0.6, [0, 3]), specks: num(f.specks, 1.0, [0, 3]),
        grain: num(f.grain, 1.0, [0, 3]), wear: num(f.wear, 1.0, [0, 3])
      };
    }
    var o = { name: "clean" };
    if (f.ink) o.ink = color(f.ink, [0, 0, 0]);
    if (f.paper) o.paper = color(f.paper, [255, 255, 255]);
    return o;
  }

  // Imported files are untrusted: rebuild a fresh spec from checked values only
  function sanitize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("That file is not a picture settings file.");
    var kind = raw.kind === "illusion" ? "illusion" : "pattern";
    var spec = { kind: kind, seed: Math.round(num(raw.seed, 1, [0, 4294967295])) };
    if (kind === "illusion") {
      if (!raw.illusion) throw new Error("This settings file has no illusion in it.");
      spec.illusion = cleanIllusion(raw.illusion);
    } else {
      if (!raw.warp || !raw.motif) throw new Error("This settings file has no pattern in it.");
      spec.warp = cleanWarp(raw.warp);
      spec.motif = cleanMotif(raw.motif);
    }
    spec.layout = cleanLayout(raw.layout);
    spec.finish = cleanFinish(raw.finish);
    var sz = typeof raw.size === "string" ? raw.size : "square";
    spec.size = SIZES.some(function (s) { return s[0] === sz; }) ? sz : "square";
    if (sz !== spec.size && typeof raw.width === "number" && typeof raw.height === "number" && raw.width > 0 && raw.height > 0) {
      // keep the shape of an unknown size by picking the closest format
      var ar = raw.width / raw.height, best = SIZES[0], bd = 1e9;
      SIZES.forEach(function (s) { var d = Math.abs(Math.log((s[2] / s[3]) / ar)); if (d < bd) { bd = d; best = s; } });
      spec.size = best[0];
    }
    return spec;
  }

  // what gets written to a .json file (Python spec format)
  function exportSpec(spec) {
    var s = JSON.parse(JSON.stringify(spec));
    var info = sizeInfo(s.size);
    var out = { kind: s.kind, seed: s.seed };
    if (s.kind === "illusion") out.illusion = s.illusion;
    else { out.warp = s.warp; out.motif = s.motif; }
    out.layout = s.layout;
    out.finish = s.finish;
    out.size = info[0];
    out.width = info[2];
    out.height = info[3];
    out.quality = 3;
    out.note = "Made with Mod Mara. Load this file in the app to get the same picture back.";
    return out;
  }

  // ---------------------------------------------------------------- packing for the shaders
  function g(o, k, d) { return o && o[k] !== undefined && o[k] !== null ? o[k] : d; }

  function geometry(W, H, lay) {
    var m = g(lay, "margin", 0.0) * Math.min(W, H);
    var aw = W - 2 * m, ah = H - 2 * m;
    var sc = Math.min(aw, ah) / 2;
    return { cx: W / 2, cy: H / 2, sc: sc, hx: aw / 2 / sc, hy: ah / 2 / sc };
  }

  function motifPeriod(mp) {
    var base = PERIOD[mp.name] || 1;
    if (mp.alternate) base = Math.max(base, 2);
    return base;
  }

  function packWarp(wp, mp, WP) {
    var n = wp.name;
    if (n === "flat") WP[0] = g(wp, "cells", 12);
    else if (n === "floor") {
      WP[0] = g(wp, "horizon", 0.35); WP[1] = g(wp, "height", 1.0); WP[2] = g(wp, "cells", 4);
      WP[3] = g(wp, "angle", 0); WP[4] = g(wp, "ceiling", false) ? 1 : 0;
    } else if (n === "tunnel") {
      var c = pyInt(g(wp, "cells", 8));
      var round = g(wp, "shape", "square") === "round";
      WP[0] = round ? Math.max(4, pyRound(c / 4) * 4) : Math.max(2, pyRound(c / 2) * 2);
      WP[1] = round ? 1 : 0; WP[2] = g(wp, "aspect", 1.0); WP[3] = g(wp, "spin", 0);
    } else if (n === "bulge" || n === "pinch") {
      WP[0] = g(wp, "radius", n === "bulge" ? 0.8 : 0.9); WP[1] = g(wp, "amount", n === "bulge" ? 0.5 : 2.5);
      WP[2] = g(wp, "cells", 14); WP[3] = g(wp, "cx", 0); WP[4] = g(wp, "cy", 0); WP[5] = g(wp, "breathe", true) ? 1 : 0;
    } else if (n === "vortex") {
      WP[0] = Math.max(4, pyRound(g(wp, "N", 36) / 4) * 4); WP[1] = pyRound(g(wp, "M", 4) / 4) * 4;
      WP[2] = g(wp, "cx", 0); WP[3] = g(wp, "cy", 0);
    } else if (n === "wave") {
      WP[0] = g(wp, "cells", 16); WP[1] = g(wp, "amp", 0.6); WP[2] = g(wp, "amp2", 0); WP[3] = g(wp, "freq", 1.5);
      WP[4] = g(wp, "freq2", 1.0); WP[5] = g(wp, "swell", 0.5);
    } else if (n === "twist") {
      WP[0] = g(wp, "radius", 0.9); WP[1] = g(wp, "turn", 2.0); WP[2] = g(wp, "cells", 14); WP[3] = g(wp, "cx", 0); WP[4] = g(wp, "cy", 0);
    } else if (n === "droste") {
      WP[0] = Math.max(2, pyInt(g(wp, "S", 2))); WP[1] = pyInt(g(wp, "cells", 4)); WP[2] = g(wp, "twist", true) ? 1 : 0;
      WP[3] = g(wp, "frame", 0.06);
    } else if (n === "poincare") {
      var pp = pyInt(g(wp, "p", 6)), q = pyInt(g(wp, "q", 4));
      pp = clamp(pp, 3, 12);
      if (q % 2) q += 1;
      if (1 / pp + 1 / q >= 0.5) q = pp <= 4 ? 6 : 4;
      var h = Math.acosh(Math.cos(Math.PI / q) / Math.sin(Math.PI / pp));
      var e = Math.tanh(h / 2);
      var cc = (1 + e * e) / (2 * e);
      var rv = Math.tanh(Math.acosh(1 / (Math.tan(Math.PI / pp) * Math.tan(Math.PI / q))) / 2);
      var sym = ["checker", "dots", "rings"].indexOf(mp.name) >= 0;
      WP[0] = pp; WP[1] = q; WP[2] = g(wp, "disk", 0.98); WP[3] = g(wp, "angle", 0);
      WP[5] = sym ? TAU / pp : TAU; WP[6] = cc; WP[7] = cc - e; WP[8] = rv;
    }
    WP[12] = g(wp, "core", "ink") === "ink" ? 1 : 0;
    WP[13] = g(wp, "core_px", 3.0);
    WP[14] = g(wp, "rotate", 0);
  }

  function packMotif(mp, MP) {
    var n = mp.name;
    if (n === "dots") MP[0] = g(mp, "radius", 0.8);
    else if (n === "star4") { MP[0] = g(mp, "power", 0.62); MP[1] = g(mp, "k", 0.85); MP[2] = g(mp, "rot45", false) ? 1 : 0; }
    else if (n === "star6") MP[0] = g(mp, "radius", 0.95);
    else if (n === "hexagon") { MP[0] = g(mp, "radius", 0.8); MP[1] = g(mp, "ring", false) ? 1 : 0; }
    else if (n === "cross") { MP[0] = g(mp, "width", 0.3); MP[1] = g(mp, "length", 0.9); MP[2] = g(mp, "rot45", false) ? 1 : 0; }
    else if (n === "rings") MP[0] = g(mp, "count", 3);
    else if (n === "stripes") {
      MP[0] = g(mp, "count", 2); MP[1] = g(mp, "duty", 0.5);
      var d = g(mp, "direction", "u"); MP[2] = d === "u" ? 0 : d === "v" ? 1 : 2;
    } else if (n === "sato_parts") {
      var kit = g(mp, "kit", ["quarter", "half", "triangle"]);
      MP[0] = pmod(pyInt(g(mp, "seed", 1)), 100003);
      var rule = g(mp, "rule", "random"); MP[1] = rule === "random" ? 0 : rule === "spin" ? 1 : 2;
      MP[2] = Math.max(1, pyInt(g(mp, "period", 4))); MP[3] = kit.length;
      for (var i = 0; i < kit.length && i < 6; i++) MP[4 + i] = SATO_KIT.indexOf(kit[i]);
    } else if (n === "interlock") {
      var cu = g(mp, "cu", [0.18, 0.06, 0.03]), cv = g(mp, "cv", [0.15, -0.07, 0.02]);
      var pu = g(mp, "pu", [0.0, 0.3, 0.7]), pv = g(mp, "pv", [0.2, 0.5, 0.1]);
      var nu = Math.min(cu.length, pu.length, 3), nv = Math.min(cv.length, pv.length, 3);
      for (var k = 0; k < 3; k++) {
        MP[k] = k < nu ? cu[k] : 0; MP[6 + k] = k < nu ? pu[k] : 0;
        MP[3 + k] = k < nv ? cv[k] : 0; MP[9 + k] = k < nv ? pv[k] : 0;
      }
    }
    var gr = mp.grade;
    if (gr && GRADE_MOTIFS.indexOf(n) >= 0) {
      MP[16] = gr.type === "radial" ? 1 : 2; MP[17] = g(gr, "amount", 0.4); MP[18] = g(gr, "angle", 90);
    }
    MP[20] = mp.alternate && n !== "checker" && n !== "interlock" ? 1 : 0;
    MP[21] = mp.invert ? 1 : 0;
    MP[22] = mp.min_cell_px ? mp.min_cell_px : (MIN_CELL_PX[n] || 4);
  }

  function iso(x, y, z, s, ox, oy) { return [(x - y) * 0.8660254 * s + ox, (z - (x + y) / 2) * s + oy]; }

  function packTribar(p, IP, POLY, BOX) {
    var L = g(p, "length", 5.0), w = g(p, "width", 1.0);
    var s = g(p, "scale", 0.3) * 6.0 / (L + w);
    var ox = (w - L) * 0.8660254 * s / 2.0, oy = (L - w) * s / 2.0;
    var hp = g(p, "hatch", 0.12) * w * s, lw = g(p, "line", 0.01);
    var tones = g(p, "tones", { top: "white", x: "black", y: "hatch" });
    var boxes = [[[0, L], [0, w], [0, w]], [[L - w, L], [0, L], [0, w]], [[L - w, L], [L - w, L], [0, L]]];
    function P(x, y, z) { return iso(x, y, z, s, ox, oy); }
    function faces(b) {
      var x0 = b[0][0], x1 = b[0][1], y0 = b[1][0], y1 = b[1][1], z0 = b[2][0], z1 = b[2][1];
      return [
        ["top", [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]],
        ["x", [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)]],
        ["y", [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)]]
      ];
    }
    var xmax = ox + 0.8660254 * w * s + lw;
    var ops = [];
    g(p, "order", [0, 1, 2]).forEach(function (bi) { faces(boxes[bi]).forEach(function (f) { ops.push([f[0], f[1], false]); }); });
    if (g(p, "close", true)) faces(boxes[0]).forEach(function (f) { if (f[0] !== "x") ops.push([f[0], f[1], true]); });
    ops = ops.slice(0, 12);
    var ang = { top: 0, x: 150, y: 30 };
    ops.forEach(function (op, i) {
      var pts = op[1];
      var xs = pts.map(function (q) { return q[0]; }), ys = pts.map(function (q) { return q[1]; });
      var x0 = Math.min.apply(null, xs) - lw, x1 = Math.max.apply(null, xs) + lw;
      if (op[2]) x1 = Math.min(x1, xmax);
      BOX.set([x0, Math.min.apply(null, ys) - lw, x1, Math.max.apply(null, ys) + lw], i * 4);
      POLY.set([pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]], i * 8);
      var tn = tones[op[0]];
      IP[3 + i] = tn === "black" ? 1 : tn === "white" ? 0 : 2 + ang[op[0]];
    });
    IP[0] = hp; IP[1] = lw; IP[2] = ops.length;
  }

  function packIllusion(p, IP, POLY, BOX, LIST) {
    var n = p.name;
    if (n === "cafe_wall") {
      IP[0] = g(p, "rows", 10); IP[1] = g(p, "tile_ratio", 1.4); IP[2] = g(p, "mortar", 0.09); IP[3] = g(p, "cycle", 6);
      IP[4] = g(p, "shift", 0.5); IP[5] = g(p, "form", "rows") === "rings" ? 1 : 0;
      IP[6] = Math.max(8, pyRound(g(p, "around", 40) / 2) * 2); IP[7] = g(p, "mortar_level", 0.5);
    } else if (n === "fraser") {
      IP[0] = g(p, "ring_step", 0.3); IP[1] = Math.floor(pyInt(g(p, "strands", 72)) / 2) * 2; IP[2] = g(p, "slant", 1.6);
      IP[3] = g(p, "cord", 0.34); IP[4] = g(p, "gap", 0.06); IP[5] = Math.floor(pyInt(g(p, "bg_spokes", 20)) / 2) * 2;
      IP[6] = g(p, "bg_step", 0.25); IP[7] = g(p, "core", 0.06);
    } else if (n === "zollner") {
      var D = g(p, "spacing", 0.22), lw = g(p, "line", 0.035);
      var hs = g(p, "hatch_step", 0.08), hl = p.hatch_len ? p.hatch_len : D * 0.6, ha = g(p, "hatch_angle", 45);
      IP[0] = g(p, "angle", 45); IP[1] = D; IP[2] = lw; IP[3] = hs; IP[4] = hl;
      IP[5] = p.hatch_w ? p.hatch_w : lw * 0.45; IP[6] = ha;
      IP[7] = Math.min(16, Math.ceil(hl / 2 * Math.abs(Math.cos(ha * Math.PI / 180)) / hs) + 1);
    } else if (n === "ouchi") {
      var disks = g(p, "disks", [[0, 0, 0.42]]).slice(0, 8);
      IP[0] = g(p, "brick_long", 0.16); IP[1] = g(p, "brick_short", 0.04); IP[2] = disks.length;
      disks.forEach(function (d, i) { LIST.set([d[0], d[1], d[2], 0], i * 4); });
    } else if (n === "hermann") {
      IP[0] = g(p, "cells", 9); IP[1] = g(p, "street", 0.18); IP[2] = g(p, "form", "plain") === "scintillating" ? 1 : 0;
    } else if (n === "drift") {
      var wd = g(p, "widths", [0.38, 0.12, 0.38, 0.12]);
      var sum = wd[0] + wd[1] + wd[2] + wd[3];
      IP[0] = g(p, "form", "rings") === "rings" ? 1 : 0;
      IP[1] = wd[0] / sum; IP[2] = (wd[0] + wd[1]) / sum; IP[3] = (wd[0] + wd[1] + wd[2]) / sum;
      IP[4] = g(p, "ring_step", 0.28); IP[5] = pyInt(g(p, "elements", 24)); IP[6] = g(p, "rows", 8);
      IP[7] = g(p, "curve", 0.25); IP[8] = g(p, "gap", 0.04); IP[9] = g(p, "core", 0.08);
    } else if (n === "pinna") {
      var radii = g(p, "radii", [0.5, 0.86]).slice(0, 4), sp = g(p, "spacing", 0.16);
      IP[0] = g(p, "bg", 0.3); IP[1] = radii.length; IP[7] = g(p, "size", 0.11); IP[8] = g(p, "edge", 0.2);
      IP[9] = g(p, "extra_tilt", 0); IP[10] = g(p, "dot", 0.02);
      radii.forEach(function (R, i) { LIST.set([R, Math.max(1, pyRound(TAU * R / sp)), 0, 0], i * 4); });
    } else if (n === "kanizsa") {
      var f = g(p, "form", "triangles");
      IP[0] = f === "triangles" ? 0 : f === "squares" ? 1 : 2; IP[1] = g(p, "spacing", 0.36); IP[2] = g(p, "disk", 0.3);
      IP[3] = g(p, "line", 0.024); IP[4] = g(p, "gap", 0.17); IP[5] = g(p, "invert", false) ? 1 : 0;
    } else if (n === "bulge_check") {
      IP[0] = Math.max(2, Math.floor(pyInt(g(p, "cells", 14)) / 2) * 2); IP[1] = g(p, "cx", 0); IP[2] = g(p, "cy", 0);
      IP[3] = g(p, "radius", 0.85); IP[4] = g(p, "dot", 0.2); IP[5] = g(p, "inset", 0.05); IP[6] = g(p, "sense", 1);
    } else if (n === "tribar") {
      packTribar(p, IP, POLY, BOX);
    } else if (n === "cubes") {
      var t = g(p, "tones", ["white", "black", "hatch"]);
      var code = function (s) { return s === "white" ? 0 : s === "black" ? 1 : 2; };
      IP[0] = g(p, "size", 0.16); IP[1] = g(p, "hatch", 0.14); IP[2] = code(t[0]); IP[3] = code(t[1]); IP[4] = code(t[2]);
      IP[5] = g(p, "line", 0);
    } else if (n === "moire") {
      IP[0] = g(p, "form", "rings") === "rings" ? 0 : 1; IP[1] = g(p, "pitch", 0.035); IP[2] = g(p, "offset", 0.12);
      IP[3] = g(p, "ratio", 1.0); IP[4] = g(p, "angle", 4.0); IP[5] = g(p, "combine", "xor") === "xor" ? 0 : 1;
    } else if (n === "phase_shapes") {
      var shapes = g(p, "shapes", [["circle", 0, 0, 0.55]]).slice(0, 8);
      IP[0] = g(p, "pitch", 0.03); IP[1] = g(p, "angle", 0); IP[2] = shapes.length; IP[3] = g(p, "wobble", 0);
      IP[4] = g(p, "duty", 0.5);
      shapes.forEach(function (s, i) {
        LIST.set([s[0] === "circle" ? 0 : s[0] === "square" ? 1 : 2, s[1], s[2], s[3]], i * 4);
      });
    }
  }

  // small seeded random generator (mulberry32)
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function packFinish(f, seed, W, H) {
    var base = Math.min(W, H);
    var out = { vintage: false, paper: [255, 255, 255], ink: [0, 0, 0], blur: 0, specks: 0, grain: 0, wear: 0, lines: [], lineW: 1 };
    if (f && f.name === "vintage") {
      out.vintage = true;
      out.paper = g(f, "paper", [241, 233, 214]); out.ink = g(f, "ink", [27, 25, 24]);
      out.blur = g(f, "blur", 0.6) * Math.max(1, base / 2000);
      out.specks = g(f, "specks", 1.0); out.grain = g(f, "grain", 1.0); out.wear = g(f, "wear", 1.0);
      var r = rng((seed >>> 0) ^ 0x5bd1e995), s = base / 2000;
      var nl = Math.min(12, Math.floor(out.specks * 6));
      for (var i = 0; i < nl; i++) {
        var x0 = r() * W, y0 = r() * H, L = (r() * 0.06 + 0.01) * base, a = r() * Math.PI;
        out.lines.push([x0, y0, x0 + L * Math.cos(a), y0 + L * Math.sin(a)]);
      }
      out.lineW = Math.max(1, Math.trunc(s));
    } else if (f) {
      if (f.ink) out.ink = f.ink;
      if (f.paper) out.paper = f.paper;
    }
    return out;
  }

  function pack(spec, W, H) {
    var P = {
      kind: spec.kind === "illusion" ? 1 : 0, warp: 0, motif: 0, ill: 0, period: 1,
      WP: new Float32Array(16), MP: new Float32Array(24), IP: new Float32Array(64),
      POLY: new Float32Array(96), BOX: new Float32Array(48), LIST: new Float32Array(32)
    };
    if (P.kind === 1) {
      P.ill = ILL_IDS.indexOf(spec.illusion.name);
      packIllusion(spec.illusion, P.IP, P.POLY, P.BOX, P.LIST);
    } else {
      P.warp = WARP_IDS.indexOf(spec.warp.name);
      P.motif = MOTIF_IDS.indexOf(spec.motif.name);
      P.period = motifPeriod(spec.motif);
      packWarp(spec.warp, spec.motif, P.WP);
      packMotif(spec.motif, P.MP);
    }
    var lay = spec.layout || {};
    var geo = geometry(W, H, lay);
    P.lay = [geo.cx, geo.cy, geo.sc, lay.shape === "circle" ? 1 : 0];
    P.lay2 = [geo.hx, geo.hy, g(lay, "frame_line", 0), g(lay, "frame_gap", 0.025)];
    P.finish = packFinish(spec.finish, spec.seed || 1, W, H);
    P.seed = (spec.seed || 1) >>> 0;
    return P;
  }

  function describe(spec) {
    if (spec.kind === "illusion") return ILLUSIONS[spec.illusion.name].label;
    var m = spec.motif;
    return WARPS[spec.warp.name].label + " + " + MOTIFS[m.name].label + (m.alternate ? " (alt)" : "");
  }

  window.OpArtSpec = {
    WARPS: WARPS, MOTIFS: MOTIFS, ILLUSIONS: ILLUSIONS, LAYOUTS: LAYOUTS, SIZES: SIZES, PAPERS: PAPERS, INKS: INKS,
    SATO_KIT: SATO_KIT, SATO_LABELS: SATO_LABELS, TRIBAR_TONES: TRIBAR_TONES, CUBE_TONES: CUBE_TONES,
    GRADE_MOTIFS: GRADE_MOTIFS, WARP_IDS: WARP_IDS, MOTIF_IDS: MOTIF_IDS, ILL_IDS: ILL_IDS,
    defaultWarp: defaultWarp, defaultMotif: defaultMotif, defaultIllusion: defaultIllusion,
    defaultLayout: defaultLayout, defaultFinish: defaultFinish, defaultSpec: defaultSpec,
    sanitize: sanitize, exportSpec: exportSpec, pack: pack, sizeInfo: sizeInfo, describe: describe,
    rng: rng, pyRound: pyRound, clamp: clamp
  };
})();
