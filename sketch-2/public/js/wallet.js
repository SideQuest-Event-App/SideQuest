/* Sketch 1 — ticket wallet: import tickets (screenshots, photos, PDFs, Apple Wallet passes) into one wallet.
   Every code is decoded in the browser and re-drawn crisp from its exact contents. The copy is decoded again
   and only kept if it scans to the same bytes; if not (or the code type can't be drawn), the original pixels
   are kept, cropped but never resized. The AI only reads the event details, never the code. */
(function () {
  const SQ = window.SQ;
  const { esc, icon, btn, field, screen, empty, thinking, ev, poster } = SQ;
  const TZ = "America/Toronto";

  // Loaded only when someone imports a ticket. zxing-wasm reads and writes QR, PDF417, Aztec, Data Matrix and 1D barcodes.
  const ZXING = "https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.5/dist/es/full/index.js";
  const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
  let zxingP;
  const zxing = () => (zxingP = zxingP || import(ZXING));

  const W = () => (SQ.u.wallet = SQ.u.wallet || { step: "pick" });
  const tickets = () => (SQ.d.user && SQ.d.user.tickets) || [];
  const findTicket = (id) => tickets().find((t) => t.id === id);
  const LINEAR = /^(Codabar|Code39|Code93|Code128|ITF|EAN8|EAN13|UPCA|UPCE)$/;

  // ---------- Codes ----------
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const dataUrl = (type, text) => `data:${type};base64,${btoa(Array.from(new TextEncoder().encode(text), (c) => String.fromCharCode(c)).join(""))}`;

  // Re-draw a code from its contents; null unless the drawing decodes back to exactly what we expect
  async function redraw(format, payload, expect) {
    const Z = await zxing();
    let w;
    try {
      w = await Z.writeBarcode(payload, { format, scale: 4 });
    } catch {
      return null;
    }
    if (w.error || !w.image) return null;
    const [r] = await Z.readBarcodes(w.image, { tryHarder: true });
    const ok = r && r.isValid && (typeof expect === "string" ? r.text === expect : sameBytes(Array.from(r.bytes), Array.from(expect)));
    return ok ? dataUrl("image/svg+xml", w.svg) : null;
  }
  // The code's own pixels with a margin, at full resolution (resizing can make a code unreadable)
  function crop(canvas, pos) {
    const pts = [pos.topLeft, pos.topRight, pos.bottomLeft, pos.bottomRight];
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const pad = Math.max(16, (Math.max(...xs) - Math.min(...xs)) * 0.15);
    const x = Math.max(0, Math.min(...xs) - pad);
    const y = Math.max(0, Math.min(...ys) - pad);
    const w = Math.min(canvas.width, Math.max(...xs) + pad) - x;
    const h = Math.min(canvas.height, Math.max(...ys) + pad) - y;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(canvas, x, y, w, h, 0, 0, w, h);
    return c.toDataURL("image/png");
  }
  // Every code on a picture or PDF page
  async function scan(canvas) {
    const Z = await zxing();
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const found = await Z.readBarcodes(data, { tryHarder: true, maxNumberOfSymbols: 8 });
    const codes = [];
    for (const r of found.filter((r) => r.isValid)) {
      const image = (await redraw(r.format, r.contentType === "Text" ? r.text : r.bytes, r.bytes)) || crop(canvas, r.position);
      codes.push({ format: r.format, text: r.text, image });
    }
    return codes;
  }

  // ---------- Reading files ----------
  const canvasOf = (w, h) => Object.assign(document.createElement("canvas"), { width: Math.round(w), height: Math.round(h) });
  // A smaller JPEG for the AI to read the details from (the code itself never goes through this)
  function forAI(canvas) {
    const k = Math.min(1, 1600 / Math.max(canvas.width, canvas.height));
    const c = canvasOf(canvas.width * k, canvas.height * k);
    c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }

  async function readImage(file) {
    const bmp = await createImageBitmap(file);
    const c = canvasOf(bmp.width, bmp.height);
    c.getContext("2d").drawImage(bmp, 0, 0);
    return { source: "image", codes: await scan(c), image: forAI(c), text: "" };
  }

  async function readPdf(file) {
    const pdfjs = await import(PDFJS);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS.replace("pdf.min.mjs", "pdf.worker.min.mjs");
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = { source: "pdf", codes: [], image: "", text: "" };
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 3 }); // sharp enough for dense PDF417 and QR codes
      const c = canvasOf(vp.width, vp.height);
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
      out.codes.push(...(await scan(c)));
      out.text += (await page.getTextContent()).items.map((t) => t.str).join(" ") + "\n";
      if (i === 1) out.image = forAI(c);
    }
    if (out.text.trim().length > 40) out.image = ""; // the text is enough; scanned PDFs send the picture
    return out;
  }

  // An Apple Wallet pass is a zip; pass.json holds the code's exact message and the event fields
  async function unzip(buf, name) {
    const v = new DataView(buf);
    const bytes = new Uint8Array(buf);
    let end = buf.byteLength - 22;
    while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
    if (end < 0) throw new Error("That pass file is damaged.");
    for (let p = v.getUint32(end + 16, true), n = v.getUint16(end + 10, true); n > 0; n--) {
      const nameLen = v.getUint16(p + 28, true);
      if (new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)) === name) {
        const local = v.getUint32(p + 42, true);
        const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
        const raw = bytes.subarray(start, start + v.getUint32(p + 20, true));
        if (v.getUint16(p + 10, true) === 0) return raw;
        return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      }
      p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
    }
    throw new Error("That isn't an Apple Wallet pass.");
  }
  const PK_FORMATS = { PKBarcodeFormatQR: "QRCode", PKBarcodeFormatPDF417: "PDF417", PKBarcodeFormatAztec: "Aztec", PKBarcodeFormatCode128: "Code128" };
  async function readPass(file) {
    const pass = JSON.parse(new TextDecoder().decode(await unzip(await file.arrayBuffer(), "pass.json")).replace(/^﻿/, ""));
    const style = pass.eventTicket || pass.generic || pass.boardingPass || pass.storeCard || pass.coupon || {};
    const fields = ["headerFields", "primaryFields", "secondaryFields", "auxiliaryFields", "backFields"].flatMap((k) => style[k] || []);
    const text = [pass.organizationName, pass.description, pass.relevantDate && `Date: ${pass.relevantDate}`, ...fields.map((f) => `${f.label || f.key}: ${f.value}`)].filter(Boolean).join("\n");
    const codes = [];
    const b = (pass.barcodes || [])[0] || pass.barcode; // the list is fallbacks for the same code
    if (b && PK_FORMATS[b.format]) {
      const image = await redraw(PK_FORMATS[b.format], b.message, b.message);
      if (!image) throw new Error("This pass's code couldn't be copied. Keep it in Apple Wallet.");
      codes.push({ format: PK_FORMATS[b.format], text: b.message, image });
    }
    // The pass's own fields fill the form even without AI
    const by = (re) => (fields.find((f) => re.test(`${f.key} ${f.label || ""}`)) || {}).value || "";
    const when = pass.relevantDate || (pass.semantics && pass.semantics.eventStartDate);
    const details = {
      title: (pass.semantics && pass.semantics.eventName) || (style.primaryFields && style.primaryFields[0] && String(style.primaryFields[0].value)) || pass.description || "",
      venue: (pass.semantics && pass.semantics.venueName) || String(by(/venue|location|place/i)),
      seat: String(by(/seat|section|row|admission/i)),
      startsAt: when && !isNaN(Date.parse(when)) ? localOf(when) : "",
    };
    return { source: "pkpass", codes, image: "", text, details };
  }

  // ---------- Dates (tickets keep Toronto local time: "YYYY-MM-DDTHH:MM") ----------
  const localOf = (iso) => new Date(iso).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T");
  function ticketWhen(t) {
    if (!t.startsAt) return "Date: N/A";
    const [d, time] = t.startsAt.split("T");
    const day = new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    if (!time) return day;
    const [h, m] = time.split(":").map(Number);
    return `${day} · ${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
  }
  const isPastTicket = (t) => t.startsAt && t.startsAt.slice(0, 10) < localOf(SQ.now().toISOString()).slice(0, 10);

  // ---------- Import flow ----------
  SQ.startWallet = (eventId) => {
    SQ.u.wallet = { step: "pick", eventId: eventId ? Number(eventId) : null };
  };
  async function importFile(file) {
    const w = W();
    const eventId = w.eventId;
    SQ.u.wallet = { step: "reading", eventId };
    if (SQ.u.screen !== "wallet-add") SQ.go("wallet-add");
    else SQ.render();
    try {
      const name = file.name.toLowerCase();
      const read = name.endsWith(".pkpass") || file.type === "application/vnd.apple.pkpass" ? await readPass(file) : file.type === "application/pdf" || name.endsWith(".pdf") ? await readPdf(file) : await readImage(file);
      // Drop repeats: the same code twice in one file, or one already in the wallet
      const have = new Set(tickets().filter((t) => t.code).map((t) => t.code.format + t.code.text));
      const seen = new Set();
      const codes = read.codes.filter((c) => !have.has(c.format + c.text) && !seen.has(c.format + c.text) && seen.add(c.format + c.text));
      if (read.codes.length && !codes.length) throw new Error("That ticket is already in your wallet.");
      const e = ev(eventId);
      let details = { title: "", venue: "", startsAt: "", seat: "", eventId: null };
      try {
        details = await SQ.post("/api/read-ticket", { userId: SQ.userId(), image: read.image, text: read.text });
      } catch (err) {
        SQ.toast(`Couldn't read the details: ${err.message} Fill them in below.`);
      }
      for (const k of ["title", "venue", "seat", "startsAt"]) details[k] = (read.details && read.details[k]) || details[k];
      const linked = e || ev(details.eventId);
      const startsAt = details.startsAt || (linked ? localOf(linked.startsAt) : "");
      SQ.u.wallet = {
        step: "review",
        source: read.source,
        codes,
        mode: details.mode,
        eventId: linked ? linked.id : null,
        draft: {
          title: details.title || (linked ? linked.title : ""),
          venue: details.venue || (linked && linked.venue ? linked.venue.name : ""),
          date: startsAt.slice(0, 10),
          time: startsAt.slice(11, 16),
          seat: details.seat || "",
        },
      };
    } catch (err) {
      console.error(err);
      SQ.u.wallet = { step: "pick", eventId, error: err.message || "That file couldn't be read." };
    }
    SQ.render();
  }
  // File inputs aren't clicks, so they get their own listener
  document.addEventListener("change", (e) => {
    if ((e.target.id === "wallet-file" || e.target.hasAttribute("data-wallet-file")) && e.target.files[0]) importFile(e.target.files[0]);
  });

  // Keep the screen awake while a ticket is open at the door
  let wakeLock = null;
  function keepAwake(on) {
    if (on && !wakeLock && navigator.wakeLock) navigator.wakeLock.request("screen").then((l) => (wakeLock = l), () => {});
    if (!on && wakeLock) wakeLock.release().catch(() => {}), (wakeLock = null);
  }

  // ---------- Actions ----------
  Object.assign(SQ.actions, {
    openWallet: () => "wallet",
    addTicket: (eventId) => {
      SQ.startWallet(eventId);
      return "wallet-add";
    },
    openWalletTicket: (id) => {
      SQ.u.ticket = id;
      return "wallet-ticket";
    },
    unlinkTicketQuest: () => {
      W().eventId = null;
    },
    saveTickets: async () => {
      const w = W();
      const d = w.draft;
      if (!d.title.trim()) return SQ.toast("Add the event's name.");
      const base = { title: d.title, venue: d.venue, seat: d.seat, startsAt: d.date ? (d.time ? `${d.date}T${d.time}` : d.date) : "", eventId: w.eventId, source: w.source };
      const list = w.codes.length ? w.codes.map((code) => ({ ...base, code })) : [{ ...base, code: null }];
      await SQ.act("addTickets", { tickets: list });
      SQ.u.wallet = null;
      SQ.toast(list.length > 1 ? `${list.length} tickets added to your wallet.` : "Ticket added to your wallet.");
      SQ.u.history = SQ.u.history.filter((s) => s !== "wallet-add" && s !== "wallet"); // back from the wallet skips the import
      return "wallet";
    },
    removeTicket: async (id) => {
      if (!confirm("Remove this ticket from your wallet?")) return;
      await SQ.act("removeTicket", { id });
      SQ.back();
    },
  });

  // ---------- Screens ----------
  const codeBox = (code, big) => code
    ? `<div class="code-box${big ? " big" : ""}"><img src="${esc(code.image)}" alt="${esc(`${code.format} code`)}">${LINEAR.test(code.format) && big ? `<span class="code-text">${esc(code.text)}</span>` : ""}</div>`
    : "";
  const sourceLabel = { image: "From a screenshot", pdf: "From a PDF", pkpass: "From Apple Wallet" };

  const S = {};
  const isTodayTicket = (t) => t.startsAt && t.startsAt.slice(0, 10) === localOf(SQ.now().toISOString()).slice(0, 10);
  // "Today · 6:30 PM · Blue Room"
  const ticketMeta = (t) => [isTodayTicket(t) ? `Today · ${ticketWhen(t).split(" · ")[1] || ""}` : ticketWhen(t), t.venue].filter(Boolean).join(" · ");
  // Figma: New Ticket wallet. The ticket: gradient head, then the code on white with Entry and Ticket beside it.
  const ticketCard = (t, tag = "div") => `<${tag} class="wallet-ticket" ${tag === "button" ? `data-act="openWalletTicket" data-arg="${esc(t.id)}"` : ""}>
      <span class="head"><span class="t-title-l">${esc(t.title)}</span><span class="t-data">${esc(ticketMeta(t))}</span></span>
      <span class="body">
        <span class="qr">${t.code ? `<img src="${esc(t.code.image)}" alt="${esc(`${t.code.format} code`)}">` : icon("ticket")}</span>
        <span class="facts">
          <span class="overline">Entry</span><span class="t-body-l">${esc(t.venue || "Show at the door")}</span>
          <span class="overline">Ticket</span><span class="t-data">${esc(t.seat || sourceLabel[t.source] || "General admission")}</span>
        </span>
      </span>
    </${tag}>`;

  S.wallet = { role: "attendee", label: "Ticket wallet", render: () => {
    keepAwake(false);
    const u = SQ.d.user;
    const list = [...tickets()].sort((a, b) => (a.startsAt || "9").localeCompare(b.startsAt || "9"));
    const up = list.filter((t) => !isPastTicket(t)), past = list.filter(isPastTicket).reverse();
    // Quests you're going to without a ticket in the wallet yet
    const soon = Object.entries(u.log).filter(([id, l]) => l.status === "going" && ev(id) && !SQ.isPast(ev(id)) && !SQ.ticketFor(id)).map(([id]) => ev(id))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const body = !list.length && !soon.length ? empty("ticket", "No tickets yet. Add a screenshot, PDF or Apple Wallet pass and it lives here with all your others.")
      : `<div class="pad-x stack" style="gap:16px;padding-bottom:24px">
        ${up.length && isTodayTicket(up[0]) ? `<div class="row start" style="gap:8px">${SQ.tag(Number((up[0].startsAt.split("T")[1] || "00").slice(0, 2)) >= 17 ? "Tonight" : "Today", "hot")}<span class="t-caption c-secondary">Show this at the door</span></div>` : ""}
        ${up.map((t) => ticketCard(t, "button")).join("")}
        ${soon.length ? `<span class="overline" style="margin-top:8px">Coming up</span>
          ${soon.map((e) => `<div class="wallet-soon">
            <button class="row start" style="gap:12px;text-align:left" data-act="openQuest" data-arg="${e.id}">${poster(e)}<span class="stack" style="gap:2px;min-width:0"><span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-data c-secondary ellipsis">${esc([SQ.qMeta(e).split(" · ")[0].replace(/^(\w+) /, "$1 · "), e.source && `Got tickets on ${e.source}`].filter(Boolean).join(" · "))}</span></span></button>
            ${btn("Import this ticket", { "data-act": "addTicket", "data-arg": e.id }, "secondary", "upload")}
          </div>`).join("")}` : ""}
        ${past.length ? `<span class="overline" style="margin-top:8px">Past</span>
          ${past.map((t) => `<button class="list-row divided" data-act="openWalletTicket" data-arg="${esc(t.id)}"><span class="lead-ic">${icon("ticket")}</span><span class="text"><span>${esc(t.title)}</span><span>${esc(ticketMeta(t))}</span></span>${icon("chevR")}</button>`).join("")}` : ""}
      </div>`;
    return screen(body, { title: "Ticket wallet", back: true, right: SQ.iconBtn("plus", { "data-act": "addTicket", "aria-label": "Add a ticket" }) });
  } };

  S["wallet-add"] = { role: "attendee", label: "Ticket wallet: add", render: () => {
    keepAwake(false);
    const w = W();
    const e = ev(w.eventId);
    if (w.step === "reading") return screen(`<div class="pad stack" style="padding-top:60px">${thinking("Finding the codes and reading your ticket…")}</div>`, { title: "Add a ticket", back: "discover" });
    if (w.step === "review") {
      const d = w.draft;
      return screen(`
        <div class="pad stack">
          ${w.codes.length
            ? `<div class="notice">${icon("check")}<span>${w.codes.length > 1 ? `Found ${w.codes.length} codes. Each becomes its own ticket.` : "Found the code. Your wallet copy scans exactly like the original."}</span></div>
               <div class="code-grid">${w.codes.map((c) => codeBox(c)).join("")}</div>`
            : `<div class="notice">${icon("ticket")}<span>No scannable code on this one. It's saved with its details, so keep the original for the door.</span></div>`}
          ${field("Event", "wallet.draft.title", d.title, "text", "What's the ticket for?")}
          ${field("Venue", "wallet.draft.venue", d.venue, "text", "Where")}
          <div class="row" style="gap:10px">${field("Date", "wallet.draft.date", d.date, "date")}${field("Time", "wallet.draft.time", d.time, "time")}</div>
          ${field("Seat or admission", "wallet.draft.seat", d.seat, "text", "General admission, Row F seat 12…")}
          ${e ? `<div class="card tight row start" style="gap:12px">${poster(e, "mini")}<span class="stack-xs grow"><span class="caption muted">Linked to the quest</span><strong class="small ellipsis">${esc(e.title)}</strong></span><button class="link muted" data-act="unlinkTicketQuest">Not this one</button></div>` : ""}
          ${w.mode ? `<p class="caption muted">${w.mode === "keywords" ? "No AI is connected, so fill in the details yourself." : "Details read by AI. Check them before saving."}</p>` : ""}
        </div>`, { title: "Check your ticket", back: "discover", footer: `<div class="action-bar">${btn(w.codes.length > 1 ? `Add ${w.codes.length} tickets` : "Add to wallet", { "data-act": "saveTickets" }, "primary", "ticket")}</div>` });
    }
    return screen(`
      <div class="pad stack">
        ${e ? `<p class="muted">Add your ticket for <strong>${esc(e.title)}</strong>.</p>` : ""}
        <label class="upload" style="height:180px;cursor:pointer">
          ${icon("qr", "lg")}Choose a screenshot, photo, PDF or Wallet pass
          <input id="wallet-file" type="file" accept="image/*,application/pdf,.pdf,.pkpass,application/vnd.apple.pkpass" class="sr-only">
        </label>
        ${w.error ? `<div class="notice">${icon("x")}<span>${esc(w.error)}</span></div>` : ""}
        <p class="small muted">We find the QR code or barcode and redraw it sharp, then check the copy scans exactly like the original. Your ticket stays usable at the door.</p>
        <p class="caption muted">Tickets that change every few seconds, like Ticketmaster SafeTix, only work in their own app.</p>
      </div>`, { title: "Add a ticket", back: "discover" });
  } };

  S["wallet-ticket"] = { role: "attendee", label: "Ticket wallet: ticket", render: () => {
    const t = findTicket(SQ.u.ticket);
    keepAwake(!!(t && t.code));
    if (!t) return screen(empty("ticket", "That ticket isn't in your wallet."), { title: "Ticket" });
    const e = ev(t.eventId);
    return screen(`
      <div class="pad-x stack" style="gap:16px;padding-bottom:24px">
        ${ticketCard(t)}
        <p class="t-caption c-tertiary center">${t.code ? "Turn your brightness up at the door. The screen stays on while this is open. " : "This ticket has no scannable code. Show the original at the door. "}${esc(sourceLabel[t.source] || "")}</p>
        ${e ? btn("Open the sidequest", { "data-act": "openQuest", "data-arg": e.id }, "secondary", "arrow") : ""}
        ${btn("Remove from wallet", { "data-act": "removeTicket", "data-arg": t.id }, "ghost m")}
      </div>`, { title: "Ticket" });
  } };

  // The ticket for a quest, if one's in the wallet (Event day mode shows it)
  SQ.ticketFor = (eventId) => tickets().find((t) => t.eventId === Number(eventId));

  SQ.screens = Object.assign(SQ.screens || {}, S);
})();
