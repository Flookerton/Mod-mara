/* Op Art Studio: the app. UI, state, undo/redo, favorites, import/export, animation. */
(function () {
  "use strict";
  var S = window.OpArtSpec, RND = window.OpArtRandom;
  var LOOP_SECONDS = 4;
  var FAV_KEY = "opart-studio-favorites-v1";
  var SKIN_KEY = "opart-studio-skin";
  var STATE_KEY = "opart-studio-last-v1";
  var MAX_FAVS = 300;
  var MAX_FILE = 2 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function on(node, ev, fn, opt) { node.addEventListener(ev, fn, opt); }

  // ---------------------------------------------------------------- storage (works when blocked)
  var storageOK = true;
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { storageOK = false; return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { storageOK = false; return false; } }
  };

  // ---------------------------------------------------------------- state
  var state = {
    spec: S.defaultSpec(),
    locks: {},
    stash: {},
    playing: false,
    t: 0,
    speed: 1,
    hist: [],
    hi: -1,
    recording: null
  };
  var engine = null;
  var canvas = $("view");

  // ---------------------------------------------------------------- toast and busy overlay
  var toastTimer = 0;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }
  function busy(text, frac) {
    var b = $("busy");
    if (text === null) { b.hidden = true; return; }
    b.hidden = false;
    $("busy-text").textContent = text;
    $("busy-fill").style.width = Math.round((frac || 0) * 100) + "%";
  }

  // ---------------------------------------------------------------- history
  function pushHistory() {
    var s = JSON.stringify(state.spec);
    if (state.hist[state.hi] === s) return;
    state.hist = state.hist.slice(0, state.hi + 1);
    state.hist.push(s);
    if (state.hist.length > 120) state.hist.shift();
    state.hi = state.hist.length - 1;
    store.set(STATE_KEY, s);
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $("btn-undo").disabled = state.hi <= 0;
    $("btn-redo").disabled = state.hi >= state.hist.length - 1;
  }
  function undo() {
    if (state.hi <= 0) return;
    state.hi--;
    applySpec(JSON.parse(state.hist[state.hi]), false);
  }
  function redo() {
    if (state.hi >= state.hist.length - 1) return;
    state.hi++;
    applySpec(JSON.parse(state.hist[state.hi]), false);
  }

  // replace the whole picture
  function applySpec(spec, push) {
    var oldMotif = JSON.stringify(state.spec.motif || null);
    state.spec = spec;
    if (spec.kind === "illusion") state.stash.illusion = spec.illusion;
    else { state.stash.warp = spec.warp; state.stash.motif = spec.motif; }
    if (push !== false) pushHistory(); else { updateHistoryButtons(); store.set(STATE_KEY, JSON.stringify(spec)); }
    refreshAll();
    if (JSON.stringify(spec.motif || null) !== oldMotif) queueWarpThumbs();
    layoutCanvas();
    requestRender();
  }

  // a small change from a control: draw now, remember it when the control is released
  var commitTimer = 0;
  function changed(commit, rebuild) {
    requestRender();
    if (rebuild) refreshAll();
    else { updateCaption(); updateFavButton(); }
    if (commit) {
      clearTimeout(commitTimer);
      commitTimer = setTimeout(function () {
        pushHistory();
        queueWarpThumbs();
      }, 60);
    }
  }

  // ---------------------------------------------------------------- canvas sizing and render loop
  var phone = window.matchMedia("(max-width: 760px)");
  function layoutCanvas() {
    var info = S.sizeInfo(state.spec.size), aspect = info[2] / info[3];
    var box = $("stage-box");
    if (phone.matches) {
      var bw = box.clientWidth || (window.innerWidth - 32);
      box.style.height = Math.round(Math.min(window.innerHeight * 0.66, bw / aspect)) + "px";
    } else {
      box.style.height = "";
    }
    var w = box.clientWidth, h = box.clientHeight;
    if (w < 10 || h < 10) return;
    var cw, ch;
    if (w / h > aspect) { ch = h; cw = h * aspect; } else { cw = w; ch = w / aspect; }
    cw = Math.floor(cw); ch = Math.floor(ch);
    var frame = $("frame");
    frame.style.width = cw + "px";
    frame.style.height = ch + "px";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(cw * dpr), H = Math.round(ch * dpr);
    var cap = 2600000;
    if (W * H > cap) { var k = Math.sqrt(cap / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W; canvas.height = H;
      requestRender();
    }
  }

  var dirty = true, hiDone = false, lastChange = 0, lastFrame = 0;
  function requestRender() { dirty = true; hiDone = false; lastChange = performance.now(); }
  function liveSS() { return canvas.width * canvas.height > 900000 ? 1 : 2; }
  function hiSS() { return canvas.width * canvas.height > 2200000 ? 2 : 3; }
  function draw(ss) {
    if (!engine) return;
    try { engine.renderView(state.spec, ss, state.spec.kind === "pattern" ? state.t : 0); }
    catch (e) { console.error(e); }
  }
  function frame(now) {
    var dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (state.playing && state.spec.kind === "pattern") {
      state.t = (state.t + dt * state.speed / LOOP_SECONDS) % 1;
      draw(state.recording ? 2 : liveSS());
      hiDone = false;
    } else if (dirty) {
      draw(liveSS());
      dirty = false;
    } else if (!hiDone && now - lastChange > 180) {
      draw(hiSS());
      hiDone = true;
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- thumbnails
  var thumbJobs = [], thumbRAF = 0;
  function queueThumb(cv, spec, size) {
    thumbJobs = thumbJobs.filter(function (j) { return j.cv !== cv; });
    thumbJobs.push({ cv: cv, spec: spec, w: size[0], h: size[1] });
    if (!thumbRAF) thumbRAF = requestAnimationFrame(runThumbs);
  }
  function runThumbs() {
    thumbRAF = 0;
    var t0 = performance.now();
    while (thumbJobs.length && performance.now() - t0 < 14) {
      var j = thumbJobs.shift();
      try { engine.renderThumb(j.spec, j.w, j.h, 2, j.cv); } catch (e) { console.error(e); }
    }
    if (thumbJobs.length) thumbRAF = requestAnimationFrame(runThumbs);
    requestRender();
  }
  function thumbPx() { return Math.round(76 * Math.min(window.devicePixelRatio || 1, 2)); }
  function uiFinish() {
    return document.documentElement.getAttribute("data-skin") === "glitch"
      ? { name: "clean", ink: [0, 0, 0], paper: [208, 208, 208] }
      : { name: "clean", ink: [27, 25, 24], paper: [241, 233, 214] };
  }

  var thumbCanvases = { warp: {}, motif: {}, illusion: {} };
  function buildThumbs(which, ids, labels, onPick) {
    var box = $(which + "-thumbs");
    box.textContent = "";
    ids.forEach(function (id) {
      var b = el("button", "thumb");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.dataset.id = id;
      var cv = el("canvas");
      cv.width = cv.height = 8;
      cv.setAttribute("aria-hidden", "true");
      b.appendChild(cv);
      b.appendChild(el("span", "thumb-label", labels[id].label));
      if (labels[id].hint) b.title = labels[id].hint;
      on(b, "click", function () { onPick(id); });
      box.appendChild(b);
      thumbCanvases[which][id] = cv;
    });
  }
  function queueWarpThumbs() {
    var px = thumbPx(), m = state.spec.motif || state.stash.motif || S.defaultMotif("checker");
    S.WARP_IDS.forEach(function (id) {
      var w = S.defaultWarp(id);
      if (id === "floor") w.core_px = 2.0;
      queueThumb(thumbCanvases.warp[id], { kind: "pattern", seed: 1, warp: w, motif: m, layout: { name: "full", margin: 0 }, finish: uiFinish() }, [px, px]);
    });
  }
  function queueStaticThumbs() {
    var px = thumbPx();
    S.MOTIF_IDS.forEach(function (id) {
      var m = S.defaultMotif(id);
      if (m.alternate === false) m.alternate = id !== "rings";
      queueThumb(thumbCanvases.motif[id], { kind: "pattern", seed: 1, warp: { name: "flat", cells: id === "interlock" ? 3 : 2.6 },
        motif: m, layout: { name: "full", margin: 0 }, finish: uiFinish() }, [px, px]);
    });
    S.ILL_IDS.forEach(function (id) {
      var p = S.defaultIllusion(id);
      queueThumb(thumbCanvases.illusion[id], { kind: "illusion", seed: 1, illusion: p, layout: { name: "full", margin: 0 }, finish: uiFinish() }, [px, px]);
    });
    queueWarpThumbs();
  }
  function markThumbs() {
    var sp = state.spec;
    [["warp", sp.warp], ["motif", sp.motif], ["illusion", sp.illusion]].forEach(function (pair) {
      var cur = pair[1] ? pair[1].name : null;
      Array.prototype.forEach.call($(pair[0] + "-thumbs").children, function (b) {
        b.setAttribute("aria-checked", b.dataset.id === cur ? "true" : "false");
      });
    });
  }

  // ---------------------------------------------------------------- parameter controls
  function getPath(o, path) {
    var parts = path.split("."), v = o;
    for (var i = 0; i < parts.length; i++) { if (v === undefined || v === null) return undefined; v = v[parts[i]]; }
    return v;
  }
  function setPath(o, path, val) {
    var parts = path.split("."), v = o;
    for (var i = 0; i < parts.length - 1; i++) {
      if (v[parts[i]] === undefined || v[parts[i]] === null) v[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      v = v[parts[i]];
    }
    v[parts[parts.length - 1]] = val;
  }

  function matchPreset(list, value) {
    var s = JSON.stringify(value);
    for (var i = 0; i < list.length; i++) if (JSON.stringify(list[i][2]) === s) return list[i][0];
    return list[0][0];
  }
  function presetValue(list, key) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === key) return clone(list[i][2]);
    return clone(list[0][2]);
  }

  // special controls whose value is not a plain key
  var VIRTUAL = {
    "warp.pq": {
      get: function (o) { return (o.p || 6) + "," + (o.q || 4); },
      set: function (o, v) { var a = v.split(","); o.p = +a[0]; o.q = +a[1]; }
    },
    "motif.grade": {
      get: function (o) { return o.grade ? o.grade.type : "none"; },
      set: function (o, v) {
        if (v === "none") { delete o.grade; return; }
        var g = o.grade || {};
        o.grade = { type: v, amount: g.amount !== undefined ? g.amount : 0.4, angle: g.angle !== undefined ? g.angle : 90 };
      }
    },
    "illusion.radii": {
      get: function (o) { return o.radii && o.radii.length >= 3 ? "3" : "2"; },
      set: function (o, v) { o.radii = v === "3" ? [0.36, 0.62, 0.9] : [0.45, 0.88]; }
    },
    "illusion.sense": {
      get: function (o) { return (o.sense || 1) < 0 ? "-1" : "1"; },
      set: function (o, v) { o.sense = +v; }
    },
    "illusion.angle": {   // phase shapes keep the angle as a number
      get: function (o) { return String(o.angle || 0); },
      set: function (o, v) { o.angle = +v; }
    },
    "illusion.tones": {
      get: function (o) { return o.name === "tribar" ? matchPreset(S.TRIBAR_TONES, o.tones) : matchPreset(S.CUBE_TONES, o.tones); },
      set: function (o, v) { o.tones = o.name === "tribar" ? presetValue(S.TRIBAR_TONES, v) : presetValue(S.CUBE_TONES, v); }
    }
  };

  // which controls make sense for the current settings
  function visible(section, o, p) {
    if (p.adv) return false;
    if (p.onlyFor && p.onlyFor.indexOf(o.name) < 0) return false;
    if (p.noFor && p.noFor.indexOf(o.name) >= 0) return false;
    var k = p.key, n = o.name;
    if ((k === "grade.amount" || k === "grade.angle") && !o.grade) return false;
    if (k === "grade.angle" && o.grade && o.grade.type === "radial") return false;
    if (section === "illusion" && k === "angle" && n === "phase_shapes" && !p.virtual) return false;
    if (n === "tunnel") {
      if (k === "spin" && o.shape !== "round") return false;
      if (k === "aspect" && o.shape === "round") return false;
    }
    if (n === "cafe_wall") {
      if (k === "rows" && o.form === "rings") return false;
      if (k === "around" && o.form !== "rings") return false;
    }
    if (n === "drift") {
      var rings = (o.form || "rings") === "rings";
      if ((k === "elements" || k === "ring_step") && !rings) return false;
      if (k === "rows" && rings) return false;
    }
    if (n === "moire") {
      var mr = (o.form || "rings") === "rings";
      if (k === "offset" && !mr) return false;
      if (k === "angle" && mr) return false;
    }
    if (n === "kanizsa" && k === "disk" && o.form === "ehrenstein") return false;
    if (n === "ouchi" && k === "disks.0.2" && o.disks && o.disks.length > 1) return false;
    return true;
  }

  function fmt(v, p) {
    if (typeof v !== "number") return String(v);
    if (p.type === "i") return String(Math.round(v));
    var d = p.step >= 1 ? 0 : p.step >= 0.1 ? 1 : p.step >= 0.01 ? 2 : 3;
    return v.toFixed(d);
  }

  var fieldId = 0;
  function rangeField(label, value, min, max, step, p, onInput, onCommit) {
    var id = "f" + (++fieldId);
    var wrap = el("div", "field");
    var lab = el("label", "field-name");
    lab.htmlFor = id;
    lab.appendChild(document.createTextNode(label + " "));
    var out = el("output", null, fmt(value, p));
    out.setAttribute("for", id);
    lab.appendChild(out);
    var inp = el("input");
    inp.type = "range"; inp.id = id;
    inp.min = min; inp.max = max; inp.step = step;
    inp.value = value;
    on(inp, "input", function () { var v = parseFloat(inp.value); out.textContent = fmt(v, p); onInput(v); });
    on(inp, "change", function () { onCommit(parseFloat(inp.value)); });
    wrap.appendChild(lab);
    wrap.appendChild(inp);
    return wrap;
  }
  function checkField(label, value, onSet) {
    var wrap = el("label", "check");
    var inp = el("input");
    inp.type = "checkbox";
    inp.checked = !!value;
    on(inp, "change", function () { onSet(inp.checked); });
    wrap.appendChild(inp);
    wrap.appendChild(el("span", "check-box"));
    wrap.appendChild(el("span", "check-label", label));
    return wrap;
  }
  function segField(label, options, value, onSet) {
    var wrap = el("div", "field");
    var lab = el("span", "field-name", label);
    wrap.appendChild(lab);
    if (options.length > 4) {
      var sel = el("select");
      sel.setAttribute("aria-label", label);
      options.forEach(function (o) {
        var opt = el("option", null, o[1]);
        opt.value = o[0];
        if (o[0] === value) opt.selected = true;
        sel.appendChild(opt);
      });
      on(sel, "change", function () { onSet(sel.value); });
      wrap.appendChild(sel);
      return wrap;
    }
    var seg = el("div", "seg small");
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", label);
    options.forEach(function (o) {
      var b = el("button", null, o[1]);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", o[0] === value ? "true" : "false");
      on(b, "click", function () { onSet(o[0]); });
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
    return wrap;
  }

  function buildParams(section, obj, schema) {
    var box = $(section + "-params");
    box.textContent = "";
    if (!obj) return;
    schema.params.forEach(function (p) {
      if (!visible(section, obj, p)) return;
      var vkey = section + "." + p.key, virt = VIRTUAL[vkey];
      if (p.key === "angle" && section === "illusion" && obj.name !== "phase_shapes") virt = null;
      var get = function () {
        if (virt) return virt.get(obj);
        var v = getPath(obj, p.key);
        return v === undefined ? p.def : v;
      };
      var set = function (v) { if (virt) virt.set(obj, v); else setPath(obj, p.key, v); };
      if (p.kit) { box.appendChild(kitField(obj)); return; }
      if (p.type === "n" || p.type === "i") {
        var v0 = get();
        box.appendChild(rangeField(p.label, v0, p.min, p.max, p.step, p,
          function (v) { set(v); changed(false); },
          function (v) { set(v); changed(true); }));
      } else if (p.type === "b") {
        box.appendChild(checkField(p.label, get(), function (v) { set(v); changed(true, true); }));
      } else if (p.type === "e") {
        box.appendChild(segField(p.label, p.options, String(get()), function (v) { set(v); changed(true, true); }));
      }
    });
    // extra buttons for list-shaped settings
    if (section === "illusion" && obj.name === "phase_shapes") {
      box.appendChild(actionRow("New hidden shapes", function () { obj.shapes = RND.randomShapes(RND.R(RND.newSeed())); changed(true, true); }));
    }
    if (section === "illusion" && obj.name === "ouchi") {
      var several = obj.disks && obj.disks.length > 1;
      box.appendChild(segField("Disks", [["one", "One"], ["several", "Several"]], several ? "several" : "one", function (v) {
        var r = RND.R(RND.newSeed());
        obj.disks = RND.randomDisks(r, v === "one" ? 1 : r.integers(2, 5));
        changed(true, true);
      }));
    }
    if (section === "motif" && obj.name === "interlock") {
      box.appendChild(actionRow("New tile shape", function () {
        var m = RND.randomMotif(RND.R(RND.newSeed()), "interlock");
        obj.cu = m.cu; obj.cv = m.cv; obj.pu = m.pu; obj.pv = m.pv;
        changed(true, true);
      }));
    }
  }
  function actionRow(label, fn) {
    var row = el("div", "row-btns");
    var b = el("button", "btn small", label);
    b.type = "button";
    on(b, "click", fn);
    row.appendChild(b);
    return row;
  }
  function kitField(obj) {
    var wrap = el("div", "field");
    wrap.appendChild(el("span", "field-name", "Parts"));
    var chips = el("div", "chips");
    if (!Array.isArray(obj.kit) || !obj.kit.length) obj.kit = ["quarter", "half", "triangle"];
    S.SATO_KIT.forEach(function (k) {
      var b = el("button", "chip", S.SATO_LABELS[k]);
      b.type = "button";
      b.setAttribute("aria-pressed", obj.kit.indexOf(k) >= 0 ? "true" : "false");
      on(b, "click", function () {
        var i = obj.kit.indexOf(k);
        if (i >= 0) { if (obj.kit.length > 1) obj.kit.splice(i, 1); else { toast("Keep at least one part."); return; } }
        else obj.kit.push(k);
        changed(true, true);
      });
      chips.appendChild(b);
    });
    wrap.appendChild(chips);
    return wrap;
  }

  // ---------------------------------------------------------------- layout and finish controls
  function buildLayout() {
    var lay = state.spec.layout;
    var seg = $("layout-seg");
    seg.textContent = "";
    S.LAYOUTS.forEach(function (o) {
      var b = el("button", null, o[1]);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", lay.name === o[0] ? "true" : "false");
      on(b, "click", function () {
        var fl = lay.frame_line || 0;
        var nl = S.defaultLayout(o[0]);
        if (o[0] !== "full") nl.frame_line = fl;
        state.spec.layout = nl;
        changed(true, true);
      });
      seg.appendChild(b);
    });
    var box = $("layout-params");
    box.textContent = "";
    if (lay.name !== "full") {
      var mp = { type: "n", step: 0.005 };
      box.appendChild(rangeField("Margin", lay.margin || 0, 0, 0.2, 0.005, mp,
        function (v) { lay.margin = v; changed(false); }, function (v) { lay.margin = v; changed(true); }));
      box.appendChild(checkField("Frame line", (lay.frame_line || 0) > 0, function (v) {
        lay.frame_line = v ? 0.006 : 0.0;
        if (lay.frame_gap === undefined) lay.frame_gap = 0.03;
        changed(true, true);
      }));
    }
    var sel = $("size-select");
    if (!sel.options.length) {
      S.SIZES.forEach(function (s) { var o = el("option", null, s[1]); o.value = s[0]; sel.appendChild(o); });
      on(sel, "change", function () { state.spec.size = sel.value; layoutCanvas(); changed(true); });
    }
    sel.value = state.spec.size;
  }

  function swatchField(label, list, value, onSet) {
    var wrap = el("div", "field");
    wrap.appendChild(el("span", "field-name", label));
    var row = el("div", "swatches");
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", label);
    list.forEach(function (c, i) {
      var b = el("button", "swatch");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", label + " " + (i + 1));
      b.setAttribute("aria-checked", JSON.stringify(c) === JSON.stringify(value) ? "true" : "false");
      b.style.backgroundColor = "rgb(" + c.join(",") + ")";
      on(b, "click", function () { onSet(c.slice()); });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function buildFinish() {
    var f = state.spec.finish;
    Array.prototype.forEach.call($("finish-seg").children, function (b) {
      b.setAttribute("aria-checked", b.dataset.finish === f.name ? "true" : "false");
    });
    var box = $("finish-params");
    box.textContent = "";
    if (f.name === "vintage") {
      box.appendChild(swatchField("Paper", S.PAPERS, f.paper, function (c) { f.paper = c; changed(true, true); }));
      box.appendChild(swatchField("Ink", S.INKS, f.ink, function (c) { f.ink = c; changed(true, true); }));
      [["blur", "Ink spread", 0, 1.5, 0.01], ["specks", "Specks", 0, 2.5, 0.01], ["grain", "Paper grain", 0, 2, 0.01],
        ["wear", "Worn edges", 0, 2, 0.01]].forEach(function (d) {
        var p = { type: "n", step: d[4] };
        box.appendChild(rangeField(d[1], f[d[0]] !== undefined ? f[d[0]] : 1, d[2], d[3], d[4], p,
          function (v) { f[d[0]] = v; changed(false); }, function (v) { f[d[0]] = v; changed(true); }));
      });
      box.appendChild(actionRow("New specks", function () { state.spec.seed = RND.newSeed(); changed(true, true); }));
    } else {
      var inv = f.ink && f.ink[0] > 128;
      box.appendChild(segField("Colors", [["bw", "Black on white"], ["wb", "White on black"]], inv ? "wb" : "bw", function (v) {
        state.spec.finish = v === "wb" ? { name: "clean", ink: [255, 255, 255], paper: [0, 0, 0] } : { name: "clean" };
        changed(true, true);
      }));
    }
  }

  // ---------------------------------------------------------------- whole-panel refresh
  function updateCaption() {
    $("caption-name").textContent = S.describe(state.spec);
    $("caption-seed").textContent = "No. " + state.spec.seed;
  }
  function refreshAll() {
    var sp = state.spec, app = $("app");
    app.classList.toggle("kind-pattern", sp.kind === "pattern");
    app.classList.toggle("kind-illusion", sp.kind === "illusion");
    Array.prototype.forEach.call($("kind-seg").children, function (b) {
      b.setAttribute("aria-checked", b.dataset.kind === sp.kind ? "true" : "false");
    });
    if (sp.kind === "pattern") {
      buildParams("warp", sp.warp, S.WARPS[sp.warp.name]);
      buildParams("motif", sp.motif, S.MOTIFS[sp.motif.name]);
    } else {
      buildParams("illusion", sp.illusion, S.ILLUSIONS[sp.illusion.name]);
      if (state.playing) setPlaying(false);
    }
    buildLayout();
    buildFinish();
    markThumbs();
    updateCaption();
    updateFavButton();
    // number the visible sections
    var n = 0;
    Array.prototype.forEach.call(document.querySelectorAll(".panel .sec"), function (s) {
      if (s.offsetParent === null && getComputedStyle(s).display === "none") return;
      var no = s.querySelector(".sec-no");
      if (no) no.textContent = String(++n).padStart(2, "0");
    });
    $("btn-play").disabled = sp.kind !== "pattern";
    Array.prototype.forEach.call(document.querySelectorAll("[data-lock]"), function (b) {
      b.setAttribute("aria-pressed", state.locks[b.dataset.lock] ? "true" : "false");
    });
  }

  // ---------------------------------------------------------------- actions
  function surprise() {
    var spec = RND.surprise(state.spec, state.locks);
    state.t = 0;
    applySpec(spec);
  }
  function dice(which) {
    var r = RND.R(RND.newSeed()), sp = clone(state.spec);
    if ((which === "warp" || which === "motif") && sp.kind !== "pattern") {
      sp.kind = "pattern"; delete sp.illusion;
      sp.warp = state.stash.warp ? clone(state.stash.warp) : S.defaultWarp("vortex");
      sp.motif = state.stash.motif ? clone(state.stash.motif) : S.defaultMotif("star6");
    }
    if (which === "illusion" && sp.kind !== "illusion") { sp.kind = "illusion"; delete sp.warp; delete sp.motif; }
    if (which === "warp") sp.warp = RND.fitCells(RND.randomWarp(r), sp.motif.name);
    else if (which === "motif") sp.motif = RND.randomMotif(r);
    else if (which === "illusion") sp.illusion = RND.randomIllusion(r);
    else if (which === "layout") sp.layout = RND.randomLayout(r);
    else if (which === "finish") { sp.finish = RND.randomFinish(r); sp.seed = RND.newSeed(); }
    applySpec(sp);
  }
  function pickKind(kind) {
    if (kind === state.spec.kind) return;
    var sp = clone(state.spec);
    sp.kind = kind;
    if (kind === "illusion") {
      sp.illusion = state.stash.illusion ? clone(state.stash.illusion) : RND.randomIllusion(RND.R(RND.newSeed()));
      delete sp.warp; delete sp.motif;
    } else {
      sp.warp = state.stash.warp ? clone(state.stash.warp) : S.defaultWarp("vortex");
      sp.motif = state.stash.motif ? clone(state.stash.motif) : S.defaultMotif("star6");
      delete sp.illusion;
    }
    applySpec(sp);
  }

  function setPlaying(p) {
    if (p && state.spec.kind !== "pattern") { toast("Illusions stay still. Pick a pattern to animate."); p = false; }
    state.playing = p;
    ["btn-play", "btn-play2"].forEach(function (id) {
      var b = $(id);
      b.setAttribute("aria-pressed", p ? "true" : "false");
    });
    $("btn-play").setAttribute("aria-label", p ? "Pause animation" : "Play animation");
    $("btn-play2").textContent = p ? "Pause" : "Play";
    lastFrame = 0;
    if (!p) requestRender();
  }

  // ---------------------------------------------------------------- files
  function slug(spec) {
    return S.describe(spec).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function saveJSON() {
    var data = JSON.stringify(S.exportSpec(state.spec), null, 2);
    download(new Blob([data], { type: "application/json" }), "op-art-" + slug(state.spec) + "-" + state.spec.seed + ".json");
    toast("Settings saved.");
  }

  var exporting = false;
  async function exportPNG(which) {
    if (exporting || !engine) return;
    exporting = true;
    var info = S.sizeInfo(state.spec.size), aspect = info[2] / info[3];
    var W, H;
    if (which === "screen") { W = canvas.width; H = canvas.height; }
    else {
      var L = Math.min(which === "4k" ? 4096 : 2048, engine.maxTex);
      if (aspect >= 1) { W = L; H = Math.round(L / aspect); } else { H = L; W = Math.round(L * aspect); }
    }
    var wasPlaying = state.playing;
    if (wasPlaying) setPlaying(false);
    try {
      busy("Rendering " + W + " x " + H, 0);
      var out = await engine.renderLarge(state.spec, W, H, 3, state.spec.kind === "pattern" ? state.t : 0, function (f) {
        busy("Rendering " + W + " x " + H, f);
      });
      busy("Saving PNG", 1);
      var blob = await new Promise(function (res) { out.toBlob(res, "image/png"); });
      if (!blob) throw new Error("The browser could not make the PNG file.");
      download(blob, "op-art-" + slug(state.spec) + "-" + state.spec.seed + "-" + W + "x" + H + ".png");
      toast("Picture saved (" + W + " x " + H + ").");
    } catch (e) {
      toast(e && e.message ? e.message : "Could not render that size here.");
    } finally {
      busy(null);
      exporting = false;
      requestRender();
      if (wasPlaying) setPlaying(true);
    }
  }

  function readFile(file) {
    if (!file) return Promise.reject(new Error("No file."));
    if (file.size > MAX_FILE) return Promise.reject(new Error("That file is too big to be a settings file."));
    return file.text().then(function (txt) {
      try { return JSON.parse(txt); } catch (e) { throw new Error("That file is not a settings file (it is not valid JSON)."); }
    });
  }
  function isFavBackup(d) {
    return Array.isArray(d) || (d && typeof d === "object" && Array.isArray(d.favorites));
  }
  function loadData(d) {
    if (isFavBackup(d)) { restoreFavs(d); return; }
    var spec = S.sanitize(d);
    state.t = 0;
    applySpec(spec);
    toast("Settings loaded: " + S.describe(spec) + ".");
  }
  function handleFile(file) {
    readFile(file).then(loadData).catch(function (e) { toast(e.message); });
  }

  // ---------------------------------------------------------------- favorites
  var favs = [];
  function loadFavs() {
    var raw = store.get(FAV_KEY);
    if (!raw) return [];
    try {
      var d = JSON.parse(raw);
      if (!Array.isArray(d)) return [];
      var out = [];
      d.slice(0, MAX_FAVS).forEach(function (it) {
        try { out.push({ spec: S.sanitize(it && it.spec), added: typeof it.added === "number" ? it.added : 0 }); } catch (e) { /* skip */ }
      });
      return out;
    } catch (e) { return []; }
  }
  function saveFavs() {
    var ok = store.set(FAV_KEY, JSON.stringify(favs));
    if (!ok) toast("This browser is blocking storage, so favorites will be lost when you close the page. Use Back up all.");
  }
  function key(spec) { return JSON.stringify(spec); }
  function favIndex(spec) {
    var k = key(spec);
    for (var i = 0; i < favs.length; i++) if (key(favs[i].spec) === k) return i;
    return -1;
  }
  function updateFavButton() {
    var on_ = favIndex(state.spec) >= 0;
    var b = $("btn-fav");
    b.setAttribute("aria-pressed", on_ ? "true" : "false");
    b.setAttribute("aria-label", on_ ? "Remove from favorites" : "Add to favorites");
    $("fav-count").textContent = String(favs.length);
  }
  function toggleFav() {
    var i = favIndex(state.spec);
    if (i >= 0) { favs.splice(i, 1); toast("Removed from favorites."); }
    else {
      if (favs.length >= MAX_FAVS) { toast("Favorites are full (" + MAX_FAVS + "). Remove some first."); return; }
      favs.unshift({ spec: clone(state.spec), added: Date.now() });
      toast("Added to favorites.");
      var b = $("btn-fav");
      b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
    }
    saveFavs();
    updateFavButton();
    if (!$("drawer").hidden) renderFavs();
  }
  function renderFavs() {
    var grid = $("fav-grid");
    grid.textContent = "";
    $("fav-empty").hidden = favs.length > 0;
    var px = Math.round(150 * Math.min(window.devicePixelRatio || 1, 2));
    favs.forEach(function (f, i) {
      var item = el("div", "fav");
      var b = el("button", "fav-pick");
      b.type = "button";
      b.setAttribute("aria-label", "Open " + S.describe(f.spec));
      var cv = el("canvas");
      cv.width = cv.height = 8;
      b.appendChild(cv);
      b.appendChild(el("span", "fav-label", S.describe(f.spec)));
      on(b, "click", function () { state.t = 0; applySpec(clone(f.spec)); closeDrawer(); });
      var x = el("button", "fav-x");
      x.type = "button";
      x.setAttribute("aria-label", "Remove " + S.describe(f.spec));
      x.textContent = "×";
      on(x, "click", function () { favs.splice(i, 1); saveFavs(); updateFavButton(); renderFavs(); });
      item.appendChild(b);
      item.appendChild(x);
      grid.appendChild(item);
      var info = S.sizeInfo(f.spec.size), a = info[2] / info[3];
      queueThumb(cv, f.spec, a >= 1 ? [px, Math.round(px / a)] : [Math.round(px * a), px]);
    });
  }
  function openDrawer() {
    var d = $("drawer");
    d.hidden = false;
    $("btn-gallery").setAttribute("aria-expanded", "true");
    renderFavs();
    $("drawer-close").focus();
  }
  function closeDrawer() {
    $("drawer").hidden = true;
    $("btn-gallery").setAttribute("aria-expanded", "false");
  }
  function backupFavs() {
    if (!favs.length) { toast("No favorites to back up yet."); return; }
    var data = { app: "op-art-studio", type: "favorites", version: 1, favorites: favs.map(function (f) { return S.exportSpec(f.spec); }) };
    download(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), "mod-mara-favorites.json");
    toast("Favorites backed up.");
  }
  function restoreFavs(d) {
    var list = Array.isArray(d) ? d : d.favorites;
    var added = 0, bad = 0;
    list.slice(0, MAX_FAVS).forEach(function (it) {
      var raw = it && it.spec && !it.kind ? it.spec : it;
      try {
        var spec = S.sanitize(raw);
        if (favIndex(spec) < 0 && favs.length < MAX_FAVS) { favs.push({ spec: spec, added: Date.now() }); added++; }
      } catch (e) { bad++; }
    });
    saveFavs();
    updateFavButton();
    if (!$("drawer").hidden) renderFavs();
    toast("Restored " + added + " favorite" + (added === 1 ? "" : "s") + (bad ? " (" + bad + " skipped)" : "") + ".");
  }

  // ---------------------------------------------------------------- recording a loop
  function recordLoop() {
    if (state.recording) return;
    if (state.spec.kind !== "pattern") { toast("Only patterns move. Pick a pattern first."); return; }
    if (!canvas.captureStream || !window.MediaRecorder) { toast("This browser cannot record video. Try Chrome, Edge or Firefox."); return; }
    var types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    var mime = types.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0];
    if (!mime) { toast("This browser cannot record WebM video."); return; }
    var stream = canvas.captureStream(30);
    var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10000000 });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      state.recording = null;
      $("btn-record").textContent = "Record loop";
      $("btn-record").classList.remove("rec");
      download(new Blob(chunks, { type: "video/webm" }), "op-art-loop-" + slug(state.spec) + "-" + state.spec.seed + ".webm");
      toast("Loop saved as a WebM video.");
    };
    state.recording = rec;
    state.t = 0;
    setPlaying(true);
    rec.start();
    $("btn-record").textContent = "Recording";
    $("btn-record").classList.add("rec");
    setTimeout(function () { if (rec.state !== "inactive") rec.stop(); }, LOOP_SECONDS / state.speed * 1000);
  }

  // ---------------------------------------------------------------- skin
  function setSkin(s) {
    document.documentElement.setAttribute("data-skin", s);
    store.set(SKIN_KEY, s);
    queueStaticThumbs();
  }

  // ---------------------------------------------------------------- wire up
  function wire() {
    on($("btn-surprise"), "click", surprise);
    on($("btn-undo"), "click", undo);
    on($("btn-redo"), "click", redo);
    on($("btn-play"), "click", function () { setPlaying(!state.playing); });
    on($("btn-play2"), "click", function () { setPlaying(!state.playing); });
    on($("btn-record"), "click", recordLoop);
    on($("btn-fav"), "click", toggleFav);
    on($("btn-gallery"), "click", function () { if ($("drawer").hidden) openDrawer(); else closeDrawer(); });
    on($("drawer-close"), "click", closeDrawer);
    on($("btn-fav-backup"), "click", backupFavs);
    on($("btn-fav-restore"), "click", function () { $("fav-in").click(); });
    on($("fav-in"), "change", function (e) {
      var f = e.target.files[0];
      e.target.value = "";
      readFile(f).then(function (d) { if (isFavBackup(d)) restoreFavs(d); else restoreFavs([d]); }).catch(function (er) { toast(er.message); });
    });
    on($("btn-skin"), "click", function () {
      setSkin(document.documentElement.getAttribute("data-skin") === "glitch" ? "vintage" : "glitch");
    });
    var help = $("help");
    on($("btn-help"), "click", function () { if (help.showModal) help.showModal(); else help.setAttribute("open", ""); });
    on($("help-close"), "click", function () { if (help.close) help.close(); else help.removeAttribute("open"); });
    on(help, "click", function (e) { if (e.target === help) help.close(); });
    on($("speed"), "input", function () {
      state.speed = parseFloat($("speed").value);
      $("speed-out").textContent = state.speed.toFixed(2).replace(/\.?0+$/, "") + "x";
    });
    on($("btn-json"), "click", saveJSON);
    on($("btn-load"), "click", function () { $("file-in").click(); });
    on($("file-in"), "change", function (e) { var f = e.target.files[0]; e.target.value = ""; handleFile(f); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-png]"), function (b) {
      on(b, "click", function () { exportPNG(b.dataset.png); });
    });
    Array.prototype.forEach.call($("kind-seg").children, function (b) { on(b, "click", function () { pickKind(b.dataset.kind); }); });
    Array.prototype.forEach.call($("finish-seg").children, function (b) {
      on(b, "click", function () {
        if (state.spec.finish.name === b.dataset.finish) return;
        state.spec.finish = b.dataset.finish === "vintage" ? S.defaultFinish("vintage") : S.defaultFinish("clean");
        changed(true, true);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-dice]"), function (b) {
      on(b, "click", function () { dice(b.dataset.dice); });
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-lock]"), function (b) {
      on(b, "click", function () {
        var k = b.dataset.lock;
        state.locks[k] = !state.locks[k];
        b.setAttribute("aria-pressed", state.locks[k] ? "true" : "false");
        toast(state.locks[k] ? "Locked: Surprise me will keep this." : "Unlocked.");
      });
    });

    // drag and drop a settings file anywhere
    var depth = 0;
    on(window, "dragenter", function (e) { if (hasFiles(e)) { depth++; document.body.classList.add("dragging"); e.preventDefault(); } });
    on(window, "dragover", function (e) { if (hasFiles(e)) e.preventDefault(); });
    on(window, "dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) document.body.classList.remove("dragging"); });
    on(window, "drop", function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      document.body.classList.remove("dragging");
      handleFile(e.dataTransfer.files[0]);
    });

    on(document, "keydown", function (e) {
      var t = e.target, tag = t && t.tagName;
      if ($("help").open) return;
      if (e.key === "Escape" && !$("drawer").hidden) { closeDrawer(); return; }
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
      if (mod || e.altKey) return;
      if (e.key === " " && tag !== "BUTTON") { e.preventDefault(); setPlaying(!state.playing); }
      else if (e.key === "r" || e.key === "R") surprise();
      else if (e.key === "f" || e.key === "F") toggleFav();
    });

    on(window, "resize", layoutCanvas);
    if (window.ResizeObserver) new ResizeObserver(function () { layoutCanvas(); }).observe($("stage-box"));
  }
  function hasFiles(e) {
    var dt = e.dataTransfer;
    return dt && Array.prototype.indexOf.call(dt.types || [], "Files") >= 0;
  }

  // ---------------------------------------------------------------- start
  function start() {
    try {
      engine = new window.OpArtEngine(canvas);
    } catch (e) {
      document.body.classList.add("no-gl");
      var msg = el("div", "no-gl-msg");
      msg.appendChild(el("h2", null, "This browser cannot draw the art"));
      msg.appendChild(el("p", null, "Op Art Studio needs WebGL2. Try a current version of Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is turned on."));
      $("stage").appendChild(msg);
      console.error(e);
      return;
    }
    engine.onRestore = function () { requestRender(); queueStaticThumbs(); };
    favs = loadFavs();
    var last = store.get(STATE_KEY);
    if (last) { try { state.spec = S.sanitize(JSON.parse(last)); } catch (e) { /* use the default */ } }
    if (state.spec.kind === "illusion") state.stash.illusion = state.spec.illusion;
    else { state.stash.warp = state.spec.warp; state.stash.motif = state.spec.motif; }
    buildThumbs("warp", S.WARP_IDS, S.WARPS, function (id) {
      var sp = clone(state.spec);
      sp.warp = S.defaultWarp(id);
      if (id === "floor") sp.warp.core_px = 2.0;
      applySpec(sp);
    });
    buildThumbs("motif", S.MOTIF_IDS, S.MOTIFS, function (id) {
      var sp = clone(state.spec);
      var alt = sp.motif && sp.motif.alternate;
      sp.motif = S.defaultMotif(id);
      if (alt && id !== "checker" && id !== "interlock") sp.motif.alternate = true;
      applySpec(sp);
    });
    buildThumbs("illusion", S.ILL_IDS, S.ILLUSIONS, function (id) {
      var sp = clone(state.spec);
      sp.illusion = S.defaultIllusion(id);
      applySpec(sp);
    });
    wire();
    pushHistory();
    refreshAll();
    layoutCanvas();
    queueStaticThumbs();
    if (!storageOK) $("fav-note").textContent = "This browser is blocking storage, so favorites last only until you close the page. Use Back up all to keep them.";
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
