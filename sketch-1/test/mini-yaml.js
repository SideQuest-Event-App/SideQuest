// A small YAML reader for the tests: enough of YAML 1.2 for GitHub workflow files (block maps and lists, "|" block
// strings, quoted and plain scalars, flow lists like [a, b], comments). No dependencies, so the tests run on a
// clean checkout. Not a general YAML parser: anchors, tags and multi-document files aren't supported.

function scalar(raw) {
  let s = raw.trim();
  if (s === "") return null;
  if (s.startsWith('"')) return JSON.parse(s.replace(/\s+#.*$/, "").match(/^"(?:[^"\\]|\\.)*"/)[0]);
  if (s.startsWith("'")) return s.match(/^'((?:[^']|'')*)'/)[1].replace(/''/g, "'");
  s = s.replace(/\s+#.*$/, "");
  if (s.startsWith("[") && s.endsWith("]")) return s.slice(1, -1).split(",").map((x) => scalar(x)).filter((x) => x !== null);
  if (s.startsWith("{") && s.endsWith("}")) return Object.fromEntries(s.slice(1, -1).split(",").filter((x) => x.trim()).map((kv) => { const i = kv.indexOf(":"); return [kv.slice(0, i).trim(), scalar(kv.slice(i + 1))]; }));
  if (/^(true|false)$/.test(s)) return s === "true";
  if (/^(null|~)$/.test(s)) return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function parse(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((l, n) => ({ n, raw: l, indent: l.match(/^ */)[0].length, body: l.trim() }));
  let i = 0;
  const skip = () => { while (i < lines.length && (!lines[i].body || lines[i].body.startsWith("#"))) i++; };
  // A "|" or ">" block string: every following line indented deeper than `indent`
  function block(indent, fold) {
    const out = [];
    let base = null;
    while (i < lines.length && (lines[i].body === "" || lines[i].indent > indent)) {
      if (lines[i].body !== "" && base == null) base = lines[i].indent;
      out.push(lines[i].body === "" ? "" : lines[i].raw.slice(base));
      i++;
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return fold ? out.join(" ") + "\n" : out.join("\n") + "\n";
  }
  function value(rest, indent) {
    const r = rest.trim();
    if (r === "|" || r === "|-" || r === ">" || r === ">-") return block(indent, r.startsWith(">"));
    if (r === "" || r.startsWith("#")) { skip(); return i < lines.length && lines[i].indent > indent ? node(lines[i].indent) : i < lines.length && lines[i].indent === indent && lines[i].body.startsWith("- ") ? node(indent) : null; }
    return scalar(r);
  }
  function node(indent) {
    skip();
    if (i >= lines.length) return null;
    if (lines[i].body.startsWith("- ") || lines[i].body === "-") {
      const list = [];
      while (true) {
        skip();
        if (i >= lines.length || lines[i].indent !== indent || !(lines[i].body.startsWith("- ") || lines[i].body === "-")) break;
        const item = lines[i].body.slice(1).trimStart();
        const inner = indent + (lines[i].raw.slice(indent).length - lines[i].raw.slice(indent).slice(1).trimStart().length);
        if (/^[\w.$-]+\s*:(\s|$)/.test(item) && !item.startsWith('"')) {
          // a map that starts on the dash line: re-read it as a map at the item's indent
          lines[i] = { ...lines[i], indent: inner, body: item, raw: " ".repeat(inner) + item };
          list.push(node(inner));
        } else {
          i++;
          list.push(value(item, indent));
        }
      }
      return list;
    }
    const map = {};
    while (true) {
      skip();
      if (i >= lines.length || lines[i].indent !== indent) break;
      const m = lines[i].body.match(/^("(?:[^"\\]|\\.)*"|'[^']*'|[^:#]+?)\s*:(?:\s+(.*)|$)/);
      if (!m) throw new Error(`YAML: can't read line ${lines[i].n + 1}: ${lines[i].raw}`);
      const key = scalar(m[1]);
      i++;
      map[key] = value(m[2] || "", indent);
    }
    return map;
  }
  return node(0);
}

module.exports = { parse };
