// 依存なしの小さな力学モデルで SVG にグラフを描く。製品では可視化ライブラリに置き換える想定。
window.LinkaGraph = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function create(svg, { onSelect }) {
    let nodes = new Map(); // id -> node
    let edges = []; // {key, s, t, type, fresh}
    let selected = null;
    let alpha = 0;
    let raf = 0;
    let width = 400;
    let height = 330;
    const edgeLayer = document.createElementNS(NS, "g");
    const nodeLayer = document.createElementNS(NS, "g");
    svg.append(edgeLayer, nodeLayer);

    function measure() {
      const r = svg.getBoundingClientRect();
      width = r.width || 400;
      height = r.height || 330;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    // data: {nodes:[{id, kind, ctype, label}], edges:[{s,t,type}]}, fresh: Set of ids/keys to animate
    function setData(data, fresh = new Set()) {
      measure();
      const next = new Map();
      for (const n of data.nodes) {
        const prev = nodes.get(n.id);
        if (prev) {
          next.set(n.id, Object.assign(prev, n));
        } else {
          // 新しいノードは、つながっている既存ノードの近くから出す
          const anchor = data.edges
            .filter((e) => e.s === n.id || e.t === n.id)
            .map((e) => nodes.get(e.s === n.id ? e.t : e.s))
            .find(Boolean);
          next.set(n.id, {
            ...n,
            x: (anchor ? anchor.x : width / 2) + (Math.random() - 0.5) * 40,
            y: (anchor ? anchor.y : height / 2) + (Math.random() - 0.5) * 40,
            vx: 0,
            vy: 0,
          });
        }
      }
      nodes = next;
      edges = data.edges
        .filter((e) => nodes.has(e.s) && nodes.has(e.t))
        .map((e) => ({ ...e, key: `${e.s}|${e.type}|${e.t}` }));
      if (selected && !nodes.has(selected)) selected = null;
      build(fresh);
      kick(fresh.size ? 0.6 : 1);
    }

    function build(fresh) {
      edgeLayer.replaceChildren();
      nodeLayer.replaceChildren();
      for (const e of edges) {
        const line = document.createElementNS(NS, "line");
        line.setAttribute("class", `edge ${e.type === "ADDRESSES" ? "addresses" : ""} ${fresh.has(e.key) ? "fresh" : ""}`);
        line.dataset.key = e.key;
        e.el = line;
        edgeLayer.append(line);
      }
      for (const n of nodes.values()) {
        const g = document.createElementNS(NS, "g");
        g.setAttribute("class", `node ${fresh.has(n.id) ? "fresh" : ""} ${selected === n.id ? "selected" : ""}`);
        g.dataset.id = n.id;
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.setAttribute("aria-label", `${{ page: "ページ", concept: "概念", claim: "主張" }[n.kind]}：${n.title || n.label}`);
        const halo = document.createElementNS(NS, "circle");
        halo.setAttribute("class", "halo");
        halo.setAttribute("r", n.kind === "claim" ? 8 : 12);
        halo.setAttribute("fill", "transparent");
        g.append(halo);
        let shape;
        if (n.kind === "page") {
          shape = document.createElementNS(NS, "rect");
          shape.setAttribute("x", -7);
          shape.setAttribute("y", -7);
          shape.setAttribute("width", 14);
          shape.setAttribute("height", 14);
          shape.setAttribute("rx", 3);
          shape.setAttribute("class", "shape shape-page");
        } else {
          shape = document.createElementNS(NS, "circle");
          shape.setAttribute("r", n.kind === "concept" ? 7 : 4.5);
          const cls = n.kind === "concept" ? "concept" : n.ctype === "concern" || n.ctype === "solution" ? n.ctype : "other";
          shape.setAttribute("class", `shape shape-${cls}`);
        }
        g.append(shape);
        if (n.kind !== "claim") {
          const t = document.createElementNS(NS, "text");
          t.textContent = n.label;
          t.setAttribute("x", 10);
          t.setAttribute("y", 4);
          if (n.kind === "page") t.setAttribute("font-weight", "600");
          g.append(t);
        }
        g.addEventListener("click", () => select(n.id));
        g.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            select(n.id);
          }
        });
        n.el = g;
        nodeLayer.append(g);
      }
      draw();
    }

    function select(id) {
      selected = id;
      for (const n of nodes.values()) n.el.classList.toggle("selected", n.id === id);
      onSelect(id);
    }

    function highlight(ids, edgeKeys) {
      if (!ids) {
        svg.classList.remove("dim");
        svg.querySelectorAll(".hl").forEach((el) => el.classList.remove("hl"));
        return;
      }
      svg.classList.add("dim");
      for (const n of nodes.values()) n.el.classList.toggle("hl", ids.has(n.id));
      for (const e of edges) e.el.classList.toggle("hl", edgeKeys.has(e.key));
    }

    function kick(a) {
      alpha = Math.max(alpha, a);
      if (reduceMotion) {
        for (let i = 0; i < 300; i++) step();
        draw();
        return;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }

    function loop() {
      step();
      draw();
      raf = alpha > 0.01 ? requestAnimationFrame(loop) : 0;
    }

    function step() {
      const list = [...nodes.values()];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy || 0.01;
          if (d2 > 90000) continue;
          const f = (2600 / d2) * alpha;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          a.vx -= dx * f;
          a.vy -= dy * f;
          b.vx += dx * f;
          b.vy += dy * f;
        }
      }
      for (const e of edges) {
        const a = nodes.get(e.s);
        const b = nodes.get(e.t);
        const len = e.type === "ASSERTS" ? 30 : e.type === "ABOUT" ? 70 : e.type === "ADDRESSES" ? 80 : 75;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const k = ((d - len) / d) * 0.06 * alpha * (e.type === "ABOUT" ? 0.4 : 1);
        a.vx += dx * k;
        a.vy += dy * k;
        b.vx -= dx * k;
        b.vy -= dy * k;
      }
      for (const n of list) {
        n.vx += (width / 2 - n.x) * 0.003 * alpha;
        n.vy += (height / 2 - n.y) * 0.006 * alpha;
        n.vx *= 0.6;
        n.vy *= 0.6;
        n.x = Math.min(width - (n.kind === "claim" ? 12 : n.kind === "page" ? 140 : 90), Math.max(12, n.x + n.vx));
        n.y = Math.min(height - 12, Math.max(12, n.y + n.vy));
      }
      alpha *= 0.985;
    }

    function draw() {
      for (const e of edges) {
        const a = nodes.get(e.s);
        const b = nodes.get(e.t);
        e.el.setAttribute("x1", a.x);
        e.el.setAttribute("y1", a.y);
        e.el.setAttribute("x2", b.x);
        e.el.setAttribute("y2", b.y);
      }
      for (const n of nodes.values()) n.el.setAttribute("transform", `translate(${n.x},${n.y})`);
    }

    window.addEventListener("resize", () => {
      measure();
      kick(0.3);
    });

    return { setData, highlight, select };
  }

  return { create };
})();
