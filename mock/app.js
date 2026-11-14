// Linka モックの挙動。製品の UC1〜UC5 をクリックでたどれるようにしたもの。
(function () {
  const PAGES = window.LINKA_PAGES;
  const CONCEPTS = window.LINKA_CONCEPTS;
  const TABS = window.LINKA_TABS;
  const CHROME_TAB = { title: "設定", short: "設定", url: "chrome://settings" };
  const STEP_MS = 650;
  // 記憶ボタンのアイコン。未記憶はしおり＋、記憶済みは塗りつぶしたしおり＋✓、処理中は回転する円。
  const CLIP_ICONS = {
    add: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4.2-6 4.2z"/><path d="M12 7.5v6M9 10.5h6"/></svg>',
    saved: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12v17l-6-4.2-6 4.2z" fill="currentColor" stroke="currentColor" stroke-width="2"/><path d="M9 10.5l2.2 2.2 4-4.2" fill="none" stroke="#fff" stroke-width="2"/></svg>',
    busy: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path class="spin" d="M12 4a8 8 0 1 1-8 8"/></svg>',
  };
  const TYPE_LABEL = { concern: "課題", solution: "解決策", fact: "事実", benefit: "利点" };

  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  };

  // ---------- state ----------
  let state;
  function initialState() {
    const clipped = new Map();
    const linked = new Set();
    for (const [id, p] of Object.entries(PAGES)) {
      if (p.clipped) {
        clipped.set(id, { full: true, at: p.clippedAt });
        for (const c of p.claims) if (c.addresses) linked.add(c.id);
      }
    }
    return {
      clipped, // pageId -> {full, at}
      linked, // solution claim ids whose ADDRESSES edge exists
      selectionClaims: [], // {id, pageId, type, text}
      activeTab: "t1",
      ai: "ready",
      download: 0,
      locked: false,
      busy: false,
    };
  }

  const pageOf = (id) => (id === "chrome" ? CHROME_TAB : PAGES[id]);

  function claimsOf(pageId) {
    const info = state.clipped.get(pageId);
    if (!info) return [];
    const base = info.full ? PAGES[pageId].claims.map((c) => ({ ...c, pageId })) : [];
    return base.concat(state.selectionClaims.filter((c) => c.pageId === pageId));
  }

  function allClaims() {
    return [...state.clipped.keys()].flatMap(claimsOf);
  }

  function findClaim(id) {
    return allClaims().find((c) => c.id === id);
  }

  function addressEdges() {
    const present = new Set(allClaims().map((c) => c.id));
    return allClaims()
      .filter((c) => c.addresses && state.linked.has(c.id) && present.has(c.addresses))
      .map((c) => ({ s: c.id, t: c.addresses }));
  }

  function deriveGraph() {
    const nodes = [];
    const edges = [];
    const conceptIds = new Set();
    for (const [pid, info] of state.clipped) {
      const p = PAGES[pid];
      nodes.push({ id: pid, kind: "page", label: p.short, title: p.title });
      if (info.full) {
        for (const k of p.concepts) {
          conceptIds.add(k);
          edges.push({ s: pid, t: `c:${k}`, type: "MENTIONS" });
        }
      }
      for (const c of claimsOf(pid)) {
        nodes.push({ id: c.id, kind: "claim", ctype: c.type, label: "", title: c.text });
        edges.push({ s: pid, t: c.id, type: "ASSERTS" });
        for (const k of c.about || []) {
          conceptIds.add(k);
          edges.push({ s: c.id, t: `c:${k}`, type: "ABOUT" });
        }
      }
    }
    for (const k of conceptIds) nodes.push({ id: `c:${k}`, kind: "concept", label: CONCEPTS[k], title: CONCEPTS[k] });
    for (const e of addressEdges()) edges.push({ ...e, type: "ADDRESSES" });
    return { nodes, edges };
  }

  // ---------- graph ----------
  const graph = window.LinkaGraph.create($("#graph"), { onSelect: showDetail });
  const edgeKey = (s, type, t) => `${s}|${type}|${t}`;

  function renderGraph(fresh) {
    graph.setData(deriveGraph(), fresh);
    const pages = state.clipped.size;
    const concepts = deriveGraph().nodes.filter((n) => n.kind === "concept").length;
    const conns = addressEdges().length;
    $("#graph-count").textContent = `${pages} ページ、${concepts} 概念、${conns} 件のつながり`;
  }

  function highlight(ids, keys) {
    graph.highlight(ids, keys);
    $("#clear-hl").hidden = !ids;
  }

  // ---------- browser ----------
  function renderTabs() {
    const strip = $("#tabstrip");
    strip.replaceChildren(
      ...TABS.map((id) => {
        const p = pageOf(id);
        const info = state.clipped.get(id);
        return el(
          "button",
          {
            class: "tab",
            role: "tab",
            "aria-selected": String(id === state.activeTab),
            title: p.title,
            onclick: () => {
              state.activeTab = id;
              closePopup();
              renderAction();
              renderTabs();
              renderPage();
              renderClip();
            },
          },
          info ? el("span", { class: "dot", title: "Linka に記憶済み" }) : null,
          p.short,
        );
      }),
    );
  }

  function renderPage() {
    const id = state.activeTab;
    const p = pageOf(id);
    $("#omnibox").textContent = p.url;
    const web = $("#webpage");
    if (id === "chrome") {
      web.className = "webpage internal";
      web.replaceChildren(el("p", {}, "Chrome の設定"));
      return;
    }
    web.className = "webpage";
    web.replaceChildren(
      el(
        "article",
        {},
        el("h1", {}, p.title),
        el("div", { class: "byline" }, new URL(p.url).host),
        ...(p.body || [p.summary]).map((t) => el("p", {}, t)),
      ),
    );
  }

  // ---------- AI status ----------
  let downloadTimer = 0;
  function setAi(mode) {
    state.ai = mode;
    $("#mock-ai").value = mode;
    clearInterval(downloadTimer);
    if (mode === "downloading") {
      state.download = 8;
      downloadTimer = setInterval(() => {
        state.download = Math.min(100, state.download + 6);
        if (state.download >= 100) setAi("ready");
        else renderAi();
      }, 450);
    }
    renderAi();
    renderClip();
    renderAsk();
    if (!state.busy) showIdle();
  }

  function renderAi() {
    const s = $("#ai-status");
    s.dataset.state = state.ai;
    s.textContent =
      state.ai === "ready"
        ? "端末内 AI 使用可"
        : state.ai === "downloading"
          ? `モデルをダウンロード中 ${state.download}%`
          : "端末内 AI 使用不可";
    s.title = state.ai === "unavailable" ? UNAVAILABLE_REASON : "";
  }

  const UNAVAILABLE_REASON =
    "この端末は Gemini Nano の動作条件（空きディスク 22GB 以上、かつ VRAM 4GB 超の GPU または RAM 16GB 以上）を満たしていません。";

  // ---------- clip ----------
  function renderClip() {
    const id = state.activeTab;
    const p = pageOf(id);
    const info = state.clipped.get(id);
    const btn = $("#clip-btn");
    const note = $("#clip-note");
    $("#clip-title").textContent = p.title;
    note.className = "clip-note";
    btn.disabled = state.busy;
    const label = state.busy ? "記憶しています" : info?.full ? "記憶し直す" : "このページを記憶";
    btn.innerHTML = state.busy ? CLIP_ICONS.busy : info?.full ? CLIP_ICONS.saved : CLIP_ICONS.add;
    btn.dataset.state = state.busy ? "busy" : info?.full ? "saved" : "";
    btn.setAttribute("aria-label", label);
    btn.title = label;

    const reason = clipBlockReason(id);
    if (reason) {
      btn.disabled = true;
      note.textContent = reason;
      if (state.ai !== "downloading") note.className = "clip-note bad";
    } else if (info?.full) {
      note.textContent = `${info.at} に記憶済み。記憶し直すと、このページから取り出した内容を置き換えます。`;
    } else if (state.ai === "unavailable" && p.sample) {
      note.textContent = "サンプルページ：抽出済みのデータで記憶します。";
    } else {
      note.textContent = p.url.replace(/^https:\/\//, "");
    }
  }

  // 記憶できない理由（記憶できるなら null）。サイドパネルとツールバーのポップアップで共通。
  function clipBlockReason(id) {
    const p = pageOf(id);
    if (id === "chrome") return "Chrome 自身のページは読み取れません。";
    if (state.ai === "downloading") return "モデルのダウンロードが終わると記憶できます。";
    if (state.ai === "unavailable" && !p.sample) return "端末内 AI が使えないため、記憶できるのはサンプルページだけです。";
    return null;
  }

  const clipSteps = (offline) => [
    "ページを読み取る",
    offline ? "抽出済みのサンプルデータを読み込む" : "概念と主張を取り出す（2 分割）",
    offline ? "つながりの判定は省略（端末内 AI が必要）" : "他のページとのつながりを探す",
    "グラフに保存する",
  ];

  // 記憶の処理本体。製品では、サイドパネルが閉じていても続くよう offscreen document 側で動かす想定。
  async function performClip(id, onStep) {
    const p = PAGES[id];
    const offline = state.ai === "unavailable";
    const replacing = !!state.clipped.get(id)?.full;
    state.busy = true;
    renderClip();
    renderAction();
    const steps = clipSteps(offline);
    for (let i = 0; i < steps.length; i++) {
      onStep(i);
      await wait(STEP_MS);
    }
    onStep(steps.length);

    const beforeNodes = new Set(deriveGraph().nodes.map((n) => n.id));
    const beforeEdges = new Set(addressEdges().map((e) => edgeKey(e.s, "ADDRESSES", e.t)));

    // 再クリップは、そのページ由来の Claim を置き換える（ADDRESSES も張り直す）
    if (replacing) for (const c of p.claims) state.linked.delete(c.id);
    state.clipped.set(id, { full: true, at: "11/15" });

    const found = [];
    if (!offline) {
      const present = new Set(allClaims().map((c) => c.id));
      for (const c of allClaims()) {
        if (!c.addresses || state.linked.has(c.id) || !present.has(c.addresses)) continue;
        const target = findClaim(c.addresses);
        if (c.pageId === id || target.pageId === id) {
          state.linked.add(c.id);
          found.push({ solution: c, concern: target });
        }
      }
    }

    const fresh = new Set(deriveGraph().nodes.filter((n) => !beforeNodes.has(n.id)).map((n) => n.id));
    for (const e of addressEdges()) {
      const k = edgeKey(e.s, "ADDRESSES", e.t);
      if (!beforeEdges.has(k)) fresh.add(k);
    }
    state.busy = false;
    renderGraph(fresh);
    renderTabs();
    renderClip();
    renderAction();
    return { p, found, offline, replacing };
  }

  // サイドパネルのボタンから記憶する
  async function clip() {
    const id = state.activeTab;
    highlight(null);
    const steps = clipSteps(state.ai === "unavailable");
    const list = el("ul", { class: "progress" }, steps.map((t) => el("li", {}, t)));
    setContext(el("h3", {}, `「${PAGES[id].short}」を記憶しています`), list);
    const result = await performClip(id, (i) => {
      [...list.children].forEach((li, j) => (li.className = j < i ? "done" : j === i ? "now" : ""));
    });
    showClipResult(result.p, result.found, result);
  }

  // ---------- toolbar action: bookmark-like clip without the side panel ----------
  const popup = $("#action-popup");
  let popupTab = null;

  function renderAction() {
    const btn = $("#action-btn");
    const info = state.clipped.get(state.activeTab);
    btn.dataset.state = state.busy ? "busy" : info?.full ? "saved" : "";
    btn.title = state.busy ? "Linka：記憶しています" : info?.full ? "Linka：記憶済み" : "Linka：このページを記憶";
  }

  function openPopup(...children) {
    popup.replaceChildren(...children.flat());
    popup.hidden = false;
  }

  function closePopup() {
    popup.hidden = true;
    popupTab = null;
  }

  async function actionClick() {
    if (!popup.hidden) return closePopup();
    const id = state.activeTab;
    popupTab = id;
    const reason = clipBlockReason(id);
    if (state.locked) return openPopup(el("p", { class: "pop-title" }, "記憶できません"), el("p", { class: "pop-text" }, "Linka は別のウィンドウで使用中です。"));
    if (reason) return openPopup(el("p", { class: "pop-title" }, "このページは記憶できません"), el("p", { class: "pop-text" }, reason));
    if (state.busy) return openPopup(el("p", { class: "pop-title" }, "他のページを記憶しています"), el("p", { class: "pop-text" }, "終わってからもう一度押してください。"));
    const info = state.clipped.get(id);
    if (info?.full) {
      return openPopup(
        el("p", { class: "pop-title" }, "記憶済みのページです"),
        el("p", { class: "pop-text" }, `${info.at} に記憶しました。`),
        el(
          "div",
          { class: "pop-actions" },
          el("button", { type: "button", class: "btn-quiet", onclick: () => runPopupClip(id) }, "記憶し直す"),
          el("button", { type: "button", class: "btn-primary", onclick: () => openPanelAt(id) }, "サイドパネルで見る"),
        ),
      );
    }
    runPopupClip(id);
  }

  async function runPopupClip(id) {
    const steps = clipSteps(state.ai === "unavailable");
    const list = el("ul", { class: "progress" }, steps.map((t) => el("li", {}, t)));
    openPopup(el("p", { class: "pop-title" }, "記憶しています…"), list, el("p", { class: "pop-hint" }, "閉じても処理は続きます。"));
    const result = await performClip(id, (i) => {
      [...list.children].forEach((li, j) => (li.className = j < i ? "done" : j === i ? "now" : ""));
    });
    if (!$("#panel").hidden) showClipResult(result.p, result.found, result);
    // ポップアップを閉じていたら、結果はツールバーの表示（記憶済み）だけで伝える
    if (popup.hidden || popupTab !== id) return;
    const { p, found, offline, replacing } = result;
    openPopup(
      el("p", { class: "pop-title" }, replacing ? "記憶し直しました" : "記憶しました"),
      el("p", { class: "pop-text" }, `「${p.short}」：主張 ${p.claims.length} 件、概念 ${p.concepts.length} 件`),
      offline
        ? el("p", { class: "pop-text muted" }, "つながりの判定は、端末内 AI が必要なため省略しました。")
        : found.length
          ? [el("p", { class: "pop-text" }, `新しいつながり ${found.length} 件`), claimView(found[0].solution), el("span", { class: "conn-verb" }, "が解決する課題"), claimView(found[0].concern)]
          : el("p", { class: "pop-text muted" }, "新しいつながりはありません。"),
      el(
        "div",
        { class: "pop-actions" },
        el("button", { type: "button", class: "btn-quiet", onclick: closePopup }, "閉じる"),
        el("button", { type: "button", class: "btn-primary", onclick: () => { openPanelAt(id); showClipResult(p, found, result); } }, "サイドパネルで見る"),
      ),
    );
  }

  function openPanelAt(id) {
    closePopup();
    setPanel(true);
    graph.select(id);
  }

  function setPanel(open) {
    $("#panel").hidden = !open;
    $("#panel-btn").setAttribute("aria-pressed", String(open));
    if (open) renderGraph(new Set());
  }

  function showClipResult(p, found, { offline, replacing }) {
    const claims = p.claims.length;
    const concepts = p.concepts.length;
    const head = el(
      "p",
      { class: "notice ok" },
      `「${p.short}」を${replacing ? "記憶し直しました" : "記憶しました"}：主張 ${claims} 件、概念 ${concepts} 件`,
    );
    if (offline) {
      setContext(
        head,
        el("p", { class: "muted" }, "他のページの課題・解決策とのつながりは、端末内 AI が必要なため判定していません。共通する概念によるつながりは反映されています。"),
      );
      return;
    }
    if (!found.length) {
      setContext(
        head,
        el("h3", {}, "新しいつながりはありません"),
        el("p", { class: "muted" }, "このページには、他のページの課題を解決する内容も、他のページで解決されている課題もまだありません。"),
      );
      return;
    }
    setContext(head, el("h3", {}, `新しいつながり ${found.length} 件`), found.map(connView));
    showConnection(found[0]);
  }

  function connView({ solution, concern }) {
    return el(
      "div",
      { class: "conn" },
      claimView(solution),
      el("span", { class: "conn-verb" }, "が解決する課題"),
      claimView(concern),
      el("button", { type: "button", class: "linkish", onclick: () => showConnection({ solution, concern }) }, "グラフで見る"),
    );
  }

  function claimView(c) {
    return el("div", { class: `claim ${c.type}` }, c.text, el("small", {}, `${TYPE_LABEL[c.type]}（${PAGES[c.pageId].short}）`));
  }

  function showConnection({ solution, concern }) {
    const ids = new Set([solution.id, concern.id, solution.pageId, concern.pageId]);
    const keys = new Set([
      edgeKey(solution.pageId, "ASSERTS", solution.id),
      edgeKey(concern.pageId, "ASSERTS", concern.id),
      edgeKey(solution.id, "ADDRESSES", concern.id),
    ]);
    highlight(ids, keys);
  }

  // ---------- selection clip (stands in for the right-click menu) ----------
  const selBtn = $("#sel-btn");
  document.addEventListener("mouseup", (ev) => {
    if (ev.target === selBtn) return;
    const sel = window.getSelection();
    const text = sel.toString().trim();
    if (!text || text.length < 15 || state.activeTab === "chrome" || state.locked || !$("#webpage").contains(sel.anchorNode)) {
      selBtn.hidden = true;
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    selBtn.style.left = `${Math.max(8, r.left)}px`;
    selBtn.style.top = `${r.bottom + 8}px`;
    selBtn.hidden = false;
    selBtn.dataset.text = text;
  });
  selBtn.addEventListener("click", () => {
    selBtn.hidden = true;
    const text = selBtn.dataset.text;
    window.getSelection().removeAllRanges();
    if (state.ai !== "ready") {
      setContext(el("p", { class: "notice bad" }, "選択範囲の追加には、内容を読み取るために端末内 AI が必要です。サンプルページを記憶するか、モデルが使えるようになってから試してください。"));
      return;
    }
    const id = state.activeTab;
    const type = /できない|開けない|詰まる|止め|落とし穴|消える|効かない|受け入れてもらいにくい|エラー/.test(text)
      ? "concern"
      : /対策|解決|にすれば|なら|にし|できる/.test(text)
        ? "solution"
        : "fact";
    const claim = { id: `sel${Date.now()}`, pageId: id, type, text: text.length > 160 ? `${text.slice(0, 157)}…` : text };
    state.selectionClaims.push(claim);
    if (!state.clipped.has(id)) state.clipped.set(id, { full: false, at: "11/15" });
    renderGraph(new Set([claim.id, id]));
    renderTabs();
    renderClip();
    setContext(el("p", { class: "notice ok" }, `選択範囲を「${TYPE_LABEL[type]}」として「${PAGES[id].short}」に追加しました。`), claimView(claim));
  });

  // ---------- details ----------
  function showDetail(id) {
    if (id.startsWith("c:")) {
      const key = id.slice(2);
      const pages = [...state.clipped.entries()].filter(([pid, info]) => info.full && PAGES[pid].concepts.includes(key)).map(([pid]) => pid);
      const claims = allClaims().filter((c) => (c.about || []).includes(key));
      setContext(
        el(
          "div",
          { class: "detail" },
          el("span", { class: "detail-kind" }, "概念"),
          el("h3", {}, CONCEPTS[key]),
          el("p", { class: "muted" }, `${pages.length} ページが言及`),
          el("ul", {}, pages.map((pid) => el("li", {}, pageLink(pid)))),
          claims.length ? el("ul", {}, claims.map((c) => el("li", {}, claimView(c)))) : null,
          el("button", { type: "button", class: "linkish", onclick: () => runPreset("concept", { key }) }, `質問：${CONCEPTS[key]} について書かれたページ`),
        ),
      );
      highlight(new Set([id, ...pages]), new Set(pages.map((pid) => edgeKey(pid, "MENTIONS", id))));
      return;
    }
    if (PAGES[id] && !findClaim(id)) {
      const p = PAGES[id];
      const info = state.clipped.get(id);
      const claims = claimsOf(id);
      setContext(
        el(
          "div",
          { class: "detail" },
          el("span", { class: "detail-kind" }, info.full ? `ページ（${info.at} に記憶）` : "ページ（選択範囲から）"),
          el("h3", {}, p.title),
          el("p", { class: "muted" }, p.url),
          info.full ? el("p", {}, p.summary) : null,
          el("ul", {}, claims.map((c) => el("li", {}, claimView(c), relationNote(c)))),
        ),
      );
      highlight(new Set([id, ...claims.map((c) => c.id)]), new Set(claims.map((c) => edgeKey(id, "ASSERTS", c.id))));
      return;
    }
    const c = findClaim(id);
    if (!c) return;
    setContext(el("div", { class: "detail" }, el("span", { class: "detail-kind" }, "主張"), claimView(c), relationNote(c)));
    const rel = addressEdges().filter((e) => e.s === id || e.t === id);
    const ids = new Set([id, c.pageId]);
    const keys = new Set([edgeKey(c.pageId, "ASSERTS", id)]);
    for (const e of rel) {
      const other = findClaim(e.s === id ? e.t : e.s);
      ids.add(other.id);
      ids.add(other.pageId);
      keys.add(edgeKey(e.s, "ADDRESSES", e.t));
      keys.add(edgeKey(other.pageId, "ASSERTS", other.id));
    }
    highlight(ids, keys);
  }

  function relationNote(c) {
    const out = addressEdges().find((e) => e.s === c.id);
    const ins = addressEdges().filter((e) => e.t === c.id);
    if (out) return el("p", { class: "muted" }, `「${PAGES[findClaim(out.t).pageId].short}」の課題を解決する。`);
    if (ins.length) return el("p", { class: "muted" }, `${ins.map((e) => `「${PAGES[findClaim(e.s).pageId].short}」`).join("と")}で解決されている。`);
    if (c.type === "concern") return el("p", { class: "muted" }, "記憶したページの中に、まだ解決策はない。");
    return null;
  }

  function pageLink(pid) {
    const p = PAGES[pid];
    if (TABS.includes(pid)) {
      return el("button", { type: "button", class: "linkish", onclick: () => { state.activeTab = pid; renderTabs(); renderPage(); renderClip(); } }, p.title);
    }
    return el("span", { title: p.url }, p.title);
  }

  // ---------- questions ----------
  const PRESETS = {
    concerns: {
      label: "課題とその解決策",
      cypher: () => `MATCH (p1:Page)-[:ASSERTS]->(c:Claim {type: 'concern'})
OPTIONAL MATCH (p2:Page)-[:ASSERTS]->(s:Claim {type: 'solution'})-[:ADDRESSES]->(c)
RETURN p1.title, c.statement, s.statement, p2.title
LIMIT 50`,
    },
    open: {
      label: "未解決の課題",
      cypher: () => `MATCH (p:Page)-[:ASSERTS]->(c:Claim {type: 'concern'})
WHERE NOT EXISTS { (:Claim)-[:ADDRESSES]->(c) }
RETURN p.title, c.statement
LIMIT 50`,
    },
    concept: {
      label: (key) => `${CONCEPTS[key]} について書かれたページ`,
      cypher: (key) => `MATCH (k:Concept {key: $key})<-[:MENTIONS]-(p:Page)
RETURN p.title, p.url
ORDER BY p.clippedAt
LIMIT 50
// $key = '${key}'`,
    },
    top: {
      label: "よく出てくる概念",
      cypher: () => `MATCH (k:Concept)<-[:MENTIONS]-(p:Page)
RETURN k.name, count(p) AS pages
ORDER BY pages DESC
LIMIT 5`,
    },
  };

  function renderAsk() {
    const form = $("#ask-form");
    const ready = state.ai === "ready";
    form.hidden = !ready;
    const ask = $(".ask");
    ask.querySelector(".muted")?.remove();
    if (!ready) {
      ask.prepend(
        el(
          "p",
          { class: "muted" },
          state.ai === "downloading" ? "質問は、モデルのダウンロードが終わると使えます。" : "質問には端末内 AI が必要です。この端末では使えません。",
        ),
      );
    }
  }

  async function ask(text) {
    highlight(null);
    setContext(el("h3", {}, text), el("p", { class: "muted" }, "グラフへの問い合わせを作っています…"));
    await wait(900);
    if (/削除|消して|消す|忘れ|delete|remove/i.test(text)) {
      setContext(
        el("h3", {}, text),
        el("p", { class: "notice bad" }, "Linka が実行するのは読み取りだけの問い合わせです。この質問はグラフを変更するため、実行しませんでした。"),
        el("div", { class: "cypher-head" }, el("span", {}, "生成された Cypher（未実行）")),
        el("pre", { class: "cypher" }, "MATCH (p:Page {url: $url})\nDETACH DELETE p"),
      );
      return;
    }
    const conceptKey = Object.keys(CONCEPTS).find((k) => text.toLowerCase().includes(CONCEPTS[k].toLowerCase()) || text.toLowerCase().includes(k));
    if (/未解決|まだ|残って|解決されていない|解決策がない/.test(text)) return runPreset("open", { question: text });
    if (/解決|対策|対処/.test(text)) return runPreset("concerns", { question: text, retried: "expected RightParen, got \"RETURN\"" });
    if (/よく|多い|上位|頻出/.test(text)) return runPreset("top", { question: text });
    if (conceptKey) return runPreset("concept", { question: text, key: conceptKey });
    setContext(
      el("h3", {}, text),
      el("p", { class: "notice warn" }, "2 回作り直しても、この質問を問い合わせにできませんでした。グラフにある概念の名前を入れるなど、言い方を変えて試してください。"),
    );
  }

  function runPreset(kind, { question, key = "webassembly", retried } = {}) {
    const preset = PRESETS[kind];
    const title = question || (typeof preset.label === "function" ? preset.label(key) : preset.label);
    const head = [
      el("h3", {}, title),
      el(
        "div",
        { class: "cypher-head" },
        el("span", {}, question ? "生成された Cypher" : "Cypher"),
        retried ? el("span", { class: "retry", title: `1 回目の失敗：${retried}` }, "1 回作り直して成功") : null,
      ),
      el("pre", { class: "cypher" }, preset.cypher(key)),
    ];
    const ids = new Set();
    const keys = new Set();
    let body;

    if (kind === "concerns" || kind === "open") {
      const edges = addressEdges();
      let concerns = allClaims().filter((c) => c.type === "concern");
      if (kind === "open") concerns = concerns.filter((c) => !edges.some((e) => e.t === c.id));
      body = concerns.map((c) => {
        ids.add(c.id);
        ids.add(c.pageId);
        keys.add(edgeKey(c.pageId, "ASSERTS", c.id));
        const sols = edges.filter((e) => e.t === c.id).map((e) => findClaim(e.s));
        for (const s of sols) {
          ids.add(s.id);
          ids.add(s.pageId);
          keys.add(edgeKey(s.pageId, "ASSERTS", s.id));
          keys.add(edgeKey(s.id, "ADDRESSES", c.id));
        }
        return el(
          "li",
          { class: "conn" },
          claimView(c),
          sols.length ? sols.map((s) => [el("span", { class: "conn-verb" }, "を解決する主張"), claimView(s)]) : el("span", { class: "conn-verb" }, "記憶したページの中に、まだ解決策はない"),
        );
      });
    } else if (kind === "concept") {
      const pages = [...state.clipped.entries()].filter(([pid, info]) => info.full && PAGES[pid].concepts.includes(key)).map(([pid]) => pid);
      ids.add(`c:${key}`);
      body = pages.map((pid) => {
        ids.add(pid);
        keys.add(edgeKey(pid, "MENTIONS", `c:${key}`));
        return el("li", {}, pageLink(pid));
      });
    } else {
      const counts = {};
      for (const [pid, info] of state.clipped) if (info.full) for (const k of PAGES[pid].concepts) counts[k] = (counts[k] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      body = top.map(([k, n]) => {
        ids.add(`c:${k}`);
        return el("li", {}, `${CONCEPTS[k]}：${n} ページ`);
      });
    }

    if (!body.length) {
      setContext(...head, el("p", { class: "muted" }, "グラフの中に該当するものはありません。"));
      highlight(null);
      return;
    }
    setContext(...head, el("ul", { class: "results" }, body));
    highlight(ids, keys);
  }

  // ---------- export ----------
  function exportGraph() {
    const q = (s) => `'${String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
    const lines = ["// Linka export. Load with: relate -d linka.rl < linka-export.cypher"];
    for (const [pid, info] of state.clipped) {
      const p = PAGES[pid];
      lines.push(`MERGE (p:Page {url: ${q(p.url)}}) SET p.title = ${q(p.title)}, p.summary = ${q(p.summary)}, p.source = ${q(info.full ? "page" : "selection")};`);
      if (info.full)
        for (const k of p.concepts)
          lines.push(`MATCH (p:Page {url: ${q(p.url)}}) MERGE (k:Concept {key: ${q(k)}}) SET k.name = ${q(CONCEPTS[k])} MERGE (p)-[:MENTIONS]->(k);`);
      for (const c of claimsOf(pid)) {
        lines.push(`MATCH (p:Page {url: ${q(p.url)}}) MERGE (c:Claim {id: ${q(c.id)}}) SET c.statement = ${q(c.text)}, c.type = ${q(c.type)} MERGE (p)-[:ASSERTS]->(c);`);
        for (const k of c.about || []) lines.push(`MATCH (c:Claim {id: ${q(c.id)}}) MERGE (k:Concept {key: ${q(k)}}) MERGE (c)-[:ABOUT]->(k);`);
      }
    }
    for (const e of addressEdges()) lines.push(`MATCH (s:Claim {id: ${q(e.s)}}), (c:Claim {id: ${q(e.t)}}) MERGE (s)-[:ADDRESSES]->(c);`);
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain" }));
    const a = el("a", { href: url, download: "linka-export.cypher" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    openGuide(true);
  }

  // ---------- context area ----------
  function setContext(...children) {
    const ctx = $("#context");
    ctx.replaceChildren(...children.flat());
    // 結果が質問欄の裏に隠れないよう、パネルを結果の先頭までスクロールする
    const panel = $(".panel");
    const top = ctx.offsetTop - panel.clientHeight + Math.min(ctx.offsetHeight, 220) + $(".ask").offsetHeight;
    if (top > panel.scrollTop) panel.scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  function showIdle() {
    const parts = [];
    if (state.ai === "unavailable") parts.push(el("p", { class: "notice warn" }, `${UNAVAILABLE_REASON}デモのグラフの閲覧、サンプルページの記憶、書き出しは使えます。`));
    $("#context").replaceChildren(...parts);
    $(".panel").scrollTop = 0;
    highlight(null);
  }

  // ---------- wiring ----------
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  $("#clip-btn").addEventListener("click", clip);
  $("#ask-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = $("#ask-input").value.trim();
    if (text) ask(text);
  });
  // 複数行の質問：Enter は改行、⌘/Ctrl+Enter で送信。日本語の変換確定の Enter では送信しない。
  const askInput = $("#ask-input");
  askInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && !ev.isComposing) {
      ev.preventDefault();
      $("#ask-form").requestSubmit();
    }
  });
  askInput.addEventListener("input", () => {
    askInput.style.height = "auto";
    askInput.style.height = `${Math.min(askInput.scrollHeight, 132)}px`;
  });

  // ツールバー
  $("#action-btn").addEventListener("click", actionClick);
  $("#panel-btn").addEventListener("click", () => setPanel($("#panel").hidden));
  $("#panel-close").addEventListener("click", () => setPanel(false));
  document.addEventListener("click", (ev) => {
    // ポップアップ内のボタンで中身を描き直すと target が DOM から外れるので、外れた要素は外側のクリックとみなさない
    if (!popup.hidden && ev.target.isConnected && !ev.target.closest("#action-popup, #action-btn")) closePopup();
  });

  // 書き出しダイアログのエージェント切り替え
  const agentTabs = [...document.querySelectorAll(".agent-tab")];
  function selectAgentTab(tab) {
    for (const t of agentTabs) {
      t.setAttribute("aria-selected", String(t === tab));
      t.tabIndex = t === tab ? 0 : -1;
    }
    document.querySelectorAll(".agent-steps").forEach((p) => (p.hidden = p.id !== tab.getAttribute("aria-controls")));
  }
  agentTabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectAgentTab(tab));
    tab.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      const next = agentTabs[(i + (ev.key === "ArrowRight" ? 1 : agentTabs.length - 1)) % agentTabs.length];
      selectAgentTab(next);
      next.focus();
    });
  });

  // エージェントに渡す方法。書き出した直後と、メニューからいつでも開ける。
  function openGuide(justExported) {
    $("#export-intro").innerHTML = justExported
      ? "<code>linka-export.cypher</code> をダウンロードしました。Relate のファイルにしてから、エージェントが MCP 経由で問い合わせられるようにします。"
      : "メニューの「グラフを書き出す」で <code>linka-export.cypher</code> をダウンロードしてから、次の手順でエージェントに渡します。";
    $("#guide-export").hidden = justExported;
    const dlg = $("#export-dialog");
    if (!dlg.open) dlg.showModal();
  }
  $("#guide-btn").addEventListener("click", () => {
    menuList.hidden = true;
    openGuide(false);
  });
  $("#guide-export").addEventListener("click", exportGraph);
  $("#clear-hl").addEventListener("click", () => {
    highlight(null);
    showIdle();
  });

  const menuBtn = $("#menu-btn");
  const menuList = $("#menu-list");
  menuBtn.addEventListener("click", () => {
    menuList.hidden = !menuList.hidden;
    menuBtn.setAttribute("aria-expanded", String(!menuList.hidden));
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".menu")) {
      menuList.hidden = true;
      menuBtn.setAttribute("aria-expanded", "false");
    }
  });
  $("#export-btn").addEventListener("click", () => {
    menuList.hidden = true;
    exportGraph();
  });
  $("#reset-btn").addEventListener("click", () => {
    menuList.hidden = true;
    $("#reset-dialog").showModal();
  });
  $("#reset-dialog").addEventListener("close", () => {
    if ($("#reset-dialog").returnValue !== "reset") return;
    const { activeTab, ai, locked } = state;
    state = { ...initialState(), activeTab, ai, locked };
    renderAll();
    setContext(el("p", { class: "notice ok" }, "デモデータに戻しました。"));
  });

  $("#mock-ai").addEventListener("change", (ev) => setAi(ev.target.value));
  $("#mock-locked").addEventListener("change", (ev) => {
    state.locked = ev.target.checked;
    $("#locked").hidden = !state.locked;
  });
  $("#locked-retry").addEventListener("click", () => {
    if (state.locked) {
      const p = $("#locked p:last-of-type");
      p.textContent = "まだ別のウィンドウで開かれています。先にそちらの Linka のサイドパネルを閉じてください。";
    } else {
      $("#locked").hidden = true;
    }
  });
  $("#mock-reset").addEventListener("click", () => {
    $("#mock-locked").checked = false;
    $("#locked").hidden = true;
    state = initialState();
    setAi("ready");
    renderAll();
  });

  function renderAll() {
    closePopup();
    setPanel(true);
    renderAction();
    renderTabs();
    renderPage();
    renderAi();
    renderClip();
    renderAsk();
    renderGraph(new Set());
    highlight(null);
    showIdle();
  }

  state = initialState();
  renderAll();
})();
