// Mermaid の flowchart と sequenceDiagram の文を、描くための構造にする。
// 描ける範囲は仕様の表のとおり。範囲外の書き方と文法の誤りは、行番号つきの理由にする。

class MermaidError extends Error {
  constructor(kind, line, name) {
    super(kind);
    this.kind = kind;   // "syntax" | "unsupported-syntax"
    this.line = line;   // 図の 1 行目を 1 とした行番号
    this.name = name;   // 未対応の書き方の名前
  }
}

const syntax = (line) => new MermaidError("syntax", line);
const unsupported = (line, name) => new MermaidError("unsupported-syntax", line, name);

// %% から行末までを除く（引用符の中は除かない）。
function stripComment(line) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (!quoted && line[i] === "%" && line[i + 1] === "%") return line.slice(0, i);
  }
  return line;
}

// 行を文に分ける（flowchart は ; でも区切る。引用符と括弧の中は区切らない）。
function statements(text, splitSemicolons) {
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = stripComment(raw);
    if (!splitSemicolons) { if (line.trim()) out.push({ text: line.trim(), line: i + 1 }); return; }
    let depth = 0, quoted = false, start = 0;
    for (let j = 0; j <= line.length; j++) {
      const c = line[j];
      if (c === '"') quoted = !quoted;
      else if (!quoted && "[({".includes(c)) depth++;
      else if (!quoted && "])}".includes(c)) depth = Math.max(0, depth - 1);
      if (j === line.length || (c === ";" && !quoted && depth === 0)) {
        const part = line.slice(start, j).trim();
        if (part) out.push({ text: part, line: i + 1 });
        start = j + 1;
      }
    }
  });
  return out;
}

// ---- flowchart ----

const DIRECTIONS = { TD: "TB", TB: "TB", BT: "BT", LR: "LR", RL: "RL" };

// 開き括弧（長いものから）と、閉じ括弧ごとの形。
const SHAPES = [
  ["(((", [[")))", "double-circle"]]],
  ["((", [["))", "circle"]]],
  ["([", [["])", "stadium"]]],
  ["[[", [["]]", "subroutine"]]],
  ["[(", [[")]", "cylinder"]]],
  ["[/", [["/]", "parallelogram"], ["\\]", "trapezoid"]]],
  ["[\\", [["\\]", "parallelogram"], ["/]", "trapezoid"]]],
  ["{{", [["}}", "hexagon"]]],
  ["[", [["]", "rect"]]],
  ["(", [[")", "round"]]],
  ["{", [["}", "rhombus"]]],
  [">", [["]", "flag"]]],
];

// 辺の書き方。label があるものはその中身がラベル。
const EDGES = [
  [/^--\s*([^-|>\s][^|]*?)\s*-{2,}>/, "arrow"],
  [/^--\s*([^-|>\s][^|]*?)\s*-{3,}/, "line"],
  [/^-\.\s*([^.\-|>\s][^|]*?)\s*\.+->/, "dotted"],
  [/^==\s*([^=|>\s][^|]*?)\s*={2,}>/, "thick"],
  [/^-{2,}>/, "arrow"],
  [/^-{3,}/, "line"],
  [/^-\.+->/, "dotted"],
  [/^-\.+-/, "dotted"],
  [/^={2,}>/, "thick"],
  [/^={3,}/, "thick"],
];

const ID = /^[A-Za-z0-9_À-￿]+/;

function parseStyle(css) {
  const style = {};
  for (const part of css.split(",")) {
    const [key, ...rest] = part.split(":");
    const value = rest.join(":").trim();
    if (!key || !value) continue;
    const name = key.trim();
    if (name === "fill" || name === "stroke" || name === "color") style[name] = value;
    else if (name === "stroke-width") style.strokeWidth = parseFloat(value);
  }
  return style;
}

function unquote(label) {
  const t = label.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

export function parseFlowchart(text) {
  const list = statements(text, true);
  if (!list.length) throw syntax(1);
  const head = list[0].text.match(/^(graph|flowchart)(?:\s+(\S+))?$/);
  if (!head) throw syntax(list[0].line);
  const direction = head[2] ? DIRECTIONS[head[2].toUpperCase()] : "TB";
  if (!direction) throw syntax(list[0].line);

  const nodes = new Map(), edges = [], subgraphs = [], stack = [];
  const classDefs = {}, classOf = new Map(), styleOf = new Map();

  const touch = (id) => {
    if (!nodes.has(id)) nodes.set(id, { id, label: id, shape: "rect" });
    const sg = stack[stack.length - 1];
    if (sg && !sg.nodes.includes(id) && !subgraphs.some((s) => s !== sg && s.nodes.includes(id))) sg.nodes.push(id);
    return nodes.get(id);
  };
  const addClass = (id, name) => classOf.set(id, [...(classOf.get(id) ?? []), name]);

  for (const { text: s, line } of list.slice(1)) {
    let m;
    if ((m = s.match(/^subgraph\s+(.+)$/))) {
      const rest = m[1].trim();
      const titled = rest.match(/^([^\s[]+)\s*\[(.*)\]$/);
      const id = titled ? titled[1] : rest.split(/\s+/).length === 1 ? unquote(rest) : rest;
      const title = titled ? unquote(titled[2]) : unquote(rest);
      // 外側の subgraph と同じ名前を入れ子にすると、自分を自分の中に置くことになり配置できない。
      if (stack.some((s) => s.id === id)) throw syntax(line);
      const sg = { id, title, nodes: [], parent: stack.length ? stack[stack.length - 1].id : null };
      subgraphs.push(sg);
      stack.push(sg);
      continue;
    }
    if (s === "end") {
      if (!stack.length) throw syntax(line);
      stack.pop();
      continue;
    }
    if (/^direction\s+(TB|TD|BT|LR|RL)$/i.test(s)) continue;
    if ((m = s.match(/^style\s+(\S+)\s+(.+)$/))) { styleOf.set(m[1], { ...(styleOf.get(m[1]) ?? {}), ...parseStyle(m[2]) }); continue; }
    if ((m = s.match(/^classDef\s+(\S+)\s+(.+)$/))) { for (const name of m[1].split(",")) classDefs[name] = parseStyle(m[2]); continue; }
    if ((m = s.match(/^class\s+(\S+)\s+(\S+)$/))) { for (const id of m[1].split(",")) addClass(id, m[2]); continue; }
    const word = s.match(/^(\w+)/)?.[1];
    if (word === "click" || word === "linkStyle") throw unsupported(line, word);
    parseChain(s, line, touch, edges, addClass);
  }
  if (stack.length) throw syntax(list[list.length - 1].line);

  for (const node of nodes.values()) {
    const style = {};
    for (const name of classOf.get(node.id) ?? []) Object.assign(style, classDefs[name] ?? {});
    Object.assign(style, styleOf.get(node.id) ?? {});
    node.style = style;
  }
  return { type: "flowchart", direction, nodes: [...nodes.values()], edges, subgraphs };
}

// A --> B -->|x| C & D のような文。
function parseChain(s, line, touch, edges, addClass) {
  let pos = 0;
  const skip = () => { while (pos < s.length && s[pos] === " ") pos++; };

  const node = () => {
    skip();
    const id = s.slice(pos).match(ID)?.[0];
    if (!id) throw syntax(line);
    pos += id.length;
    if (s.startsWith("@{", pos)) throw unsupported(line, "@{ }");
    const n = touch(id);
    for (const [open, closes] of SHAPES) {
      if (!s.startsWith(open, pos)) continue;
      const start = pos + open.length;
      let end = -1, shape = null;
      if (s[start] === '"') {
        const q = s.indexOf('"', start + 1);
        if (q < 0) throw syntax(line);
        for (const [close, name] of closes) if (s.startsWith(close, q + 1)) { end = q + 1; shape = name; break; }
        if (s[start + 1] === "`") throw unsupported(line, "markdown 文字列");
      } else {
        let best = -1;
        for (const [close, name] of closes) {
          const at = s.indexOf(close, start);
          if (at >= 0 && (best < 0 || at < best)) { best = at; shape = name; }
        }
        end = best;
      }
      if (end < 0) throw syntax(line);
      const label = unquote(s.slice(start, end));
      if (/\bfa:fa-/.test(label)) throw unsupported(line, "アイコン");
      n.label = label;
      n.shape = shape;
      pos = end + closes.find(([, name]) => name === shape)[0].length;
      break;
    }
    if (s.startsWith(":::", pos)) {
      const name = s.slice(pos + 3).match(/^[\w-]+/)?.[0];
      if (!name) throw syntax(line);
      addClass(id, name);
      pos += 3 + name.length;
    }
    return id;
  };

  const group = () => {
    const ids = [node()];
    for (;;) {
      skip();
      if (s[pos] !== "&") return ids;
      pos++;
      ids.push(node());
    }
  };

  const link = () => {
    skip();
    const rest = s.slice(pos);
    if (/^(--|==|-\.)[-.=]*[ox](\s|$|[A-Za-z0-9_])/.test(rest) && !/^-->/.test(rest)) throw unsupported(line, rest.match(/^\S+/)[0]);
    for (const [re, kind] of EDGES) {
      const m = rest.match(re);
      if (!m) continue;
      pos += m[0].length;
      let label = m[1]?.trim() ?? "";
      skip();
      if (s[pos] === "|") {
        const close = s.indexOf("|", pos + 1);
        if (close < 0) throw syntax(line);
        label = unquote(s.slice(pos + 1, close));
        pos = close + 1;
      }
      return { kind, label };
    }
    return null;
  };

  let from = group();
  for (;;) {
    skip();
    if (pos >= s.length) return;
    const e = link();
    if (!e) throw syntax(line);
    const to = group();
    for (const a of from) for (const b of to) edges.push({ from: a, to: b, kind: e.kind, label: e.label });
    from = to;
  }
}

// ---- sequenceDiagram ----

const UNSUPPORTED_SEQUENCE = new Set(["autonumber", "rect", "par", "and", "critical", "option", "break", "box", "link", "links", "create", "destroy", "title", "properties", "details"]);
const ARROWS = { "->>": ["solid", "arrow"], "-->>": ["dotted", "arrow"], "->": ["solid", "open"], "-->": ["dotted", "open"], "-x": ["solid", "cross"], "--x": ["dotted", "cross"] };
const MESSAGE = /^([^\s:]+?)\s*(-->>|->>|--x|-x|-->|->)([+-]?)\s*([^\s:+-][^\s:]*)\s*:(.*)$/;

export function parseSequence(text) {
  const list = statements(text, false);
  if (!list.length || list[0].text !== "sequenceDiagram") throw syntax(list[0]?.line ?? 1);
  const participants = [], known = new Map();
  const mention = (id, label = id, actor = false, declared = false) => {
    if (known.has(id)) {
      if (declared) Object.assign(known.get(id), { label, actor });
      return;
    }
    const p = { id, label, actor };
    known.set(id, p);
    participants.push(p);
  };
  const root = { items: [] };
  const stack = [];
  const target = () => (stack.length ? stack[stack.length - 1].sections.at(-1).items : root.items);

  for (const { text: s, line } of list.slice(1)) {
    let m;
    const word = s.match(/^(\w+)/)?.[1];
    if (UNSUPPORTED_SEQUENCE.has(word) && !MESSAGE.test(s)) throw unsupported(line, word);
    if ((m = s.match(/^(participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/))) { mention(m[2], m[3]?.trim() ?? m[2], m[1] === "actor", true); continue; }
    if ((m = s.match(/^(loop|alt|opt)(?:\s+(.*))?$/))) {
      const block = { kind: "block", type: m[1], sections: [{ label: m[2]?.trim() ?? "", items: [] }] };
      target().push(block);
      stack.push(block);
      continue;
    }
    if ((m = s.match(/^else(?:\s+(.*))?$/))) {
      const block = stack[stack.length - 1];
      if (!block || block.type !== "alt") throw syntax(line);
      block.sections.push({ label: m[1]?.trim() ?? "", items: [] });
      continue;
    }
    if (s === "end") {
      if (!stack.length) throw syntax(line);
      stack.pop();
      continue;
    }
    if ((m = s.match(/^(activate|deactivate)\s+(\S+)$/))) { mention(m[2]); target().push({ kind: m[1], id: m[2] }); continue; }
    if ((m = s.match(/^note\s+(left of|right of|over)\s+([^:]+?)\s*:(.*)$/i))) {
      const over = m[2].split(",").map((x) => x.trim()).filter(Boolean);
      if (!over.length || (m[1].toLowerCase() !== "over" && over.length > 1)) throw syntax(line);
      for (const id of over) mention(id);
      target().push({ kind: "note", placement: m[1].toLowerCase().split(" ")[0], over, text: m[3].trim() });
      continue;
    }
    if ((m = s.match(MESSAGE))) {
      const [, from, arrow, sign, to, body] = m;
      mention(from);
      mention(to);
      const [lineStyle, head] = ARROWS[arrow];
      const msg = { kind: "message", from, to, line: lineStyle, head, text: body.trim() };
      if (sign === "+") msg.activate = to;
      if (sign === "-") msg.deactivate = from;
      target().push(msg);
      continue;
    }
    if (/-\)|--\)/.test(s)) throw unsupported(line, s.match(/-+\)/)[0]);
    throw syntax(line);
  }
  if (stack.length) throw syntax(list[list.length - 1].line);
  return { type: "sequence", participants, items: root.items };
}

// ---- 入口 ----

// text: 図の文（Markdown ではコードブロックの中身）。firstLine: その 1 行目のファイル全体での行番号。
// { diagram } か { error: { kind, message } } を返す。
export function parseMermaid(text, firstLine = 1) {
  const first = statements(text, false)[0]?.text ?? "";
  const kind = first.match(/^[\w-]+/)?.[0] ?? "";
  try {
    if (kind === "graph" || kind === "flowchart") return { diagram: parseFlowchart(text) };
    if (kind === "sequenceDiagram") return { diagram: parseSequence(text) };
  } catch (e) {
    if (!(e instanceof MermaidError)) throw e;
    const at = firstLine + e.line - 1;
    if (e.kind === "unsupported-syntax") return { error: { kind: e.kind, message: `未対応の書き方: ${e.name}（${at} 行目）` } };
    return { error: { kind: "syntax", message: `${at} 行目の文法エラー` } };
  }
  return { error: { kind: "unsupported-type", message: `未対応の種類: ${kind || "（種類が無い）"}` } };
}

export function mermaidError(text, firstLine = 1) {
  return parseMermaid(text, firstLine).error ?? null;
}
