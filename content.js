/* EPrints Autofill Only — v3.0
   - Fills Description/Visible/Language for each file block
   - No reordering, no placement edits, no form submits
   - Verbose console logs
*/

(() => {
  const TAG = "[EPrintsAutofill]";
  const log  = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // Run ONLY on Edit → Upload (stage=files)
  const qs = new URLSearchParams(location.search);
  const IS_EDIT_FILES =
    /EPrint::Edit/i.test(qs.get("screen") || "") &&
    /files/i.test(qs.get("stage") || "");
  log("Loaded v3.0 — guard =", IS_EDIT_FILES, "URL =", location.href);
  if (!IS_EDIT_FILES) return;

  // ---------- Parsing & rules ----------
  // Extract numeric prefix and cleaned description from a filename label
  function parseFileName(raw) {
    const name = (raw || "").trim();
    // e.g. "1. Bab 1.pdf" → ["1", "Bab 1.pdf"]
    const m = name.match(/^\s*(\d+)\s*[.\-–_:]\s*(.+)$/i);
    let num = null, desc = name;
    if (m) { num = parseInt(m[1], 10); desc = m[2].trim(); }
    // If "Cover/Halaman Judul" keep only first part
    if (desc.includes("/")) desc = desc.split("/")[0].trim();
    // Remove extension .pdf/.docx/etc.
    desc = desc.replace(/\.[A-Za-z0-9]+$/i, "").trim();
    return { num, desc };
  }

  // Normalize intended description text in UPPER CASE
  function toCanonicalDescription(s) {
    const l = (s || "").toLowerCase();
    if (l.includes("cover") || l.includes("halaman judul")) return "COVER";
    if (l.includes("bab 1")) return "BAB 1";
    if (l.includes("bab 2")) return "BAB 2";
    if (l.includes("bab 3")) return "BAB 3";
    if (l.includes("bab 4")) return "BAB 4";
    if (l.includes("bab 5")) return "BAB 5";
    if (l.includes("daftar pustaka")) return "DAFTAR PUSTAKA";
    if (l.includes("lampiran")) return "LAMPIRAN";
    if (l.includes("bab")) return "BAB XXX";
    return (s || "").toUpperCase();
  }

  // Fill a single document block
  function autofillBlock(block) {
    if (!block || block.dataset.epxFilled === "1") return;

    const filenameEl = block.querySelector(".document_filename");
    if (!filenameEl) { warn("missing .document_filename in block", block); return; }
    const raw = filenameEl.textContent.trim();
    const info = parseFileName(raw);
    const writeDesc = toCanonicalDescription(info.desc);

    log("autofill →", { raw, parsedDesc: info.desc, writeDesc });

    // Description (formatdesc)
    const descInput =
      block.querySelector('input[id$="_formatdesc"]') ||
      block.querySelector('input.ep_document_formatdesc');
    if (descInput) {
      descInput.value = writeDesc;
      descInput.dispatchEvent(new Event("input",  { bubbles: true }));
      descInput.dispatchEvent(new Event("change", { bubbles: true }));
      log("  set formatdesc:", descInput.id || descInput.name, "=", writeDesc);
    } else {
      warn("  formatdesc input not found");
    }

    // Visible to (security) — Anyone if COVER, else Registered users only
    const visSelect = block.querySelector('select[id*="_security"]');
    if (visSelect) {
      const wantLabel = (writeDesc === "COVER") ? "Anyone" : "Registered users only";
      let matched = false;
      for (const opt of visSelect.options) {
        if (opt.text.trim().toLowerCase() === wantLabel.toLowerCase()) {
          visSelect.value = opt.value;
          visSelect.dispatchEvent(new Event("change", { bubbles: true }));
          matched = true;
          log("  set security:", wantLabel, "value:", opt.value);
          break;
        }
      }
      if (!matched) warn("  security option not found:", wantLabel);
    } else {
      warn("  security select not found");
    }

    // Language — always Indonesian
    const langSelect = block.querySelector('select[id*="_language"]');
    if (langSelect) {
      let matched = false;
      for (const opt of langSelect.options) {
        if (opt.text.trim().toLowerCase() === "indonesian") {
          langSelect.value = opt.value;
          langSelect.dispatchEvent(new Event("change", { bubbles: true }));
          matched = true;
          log("  set language: Indonesian ->", opt.value);
          break;
        }
      }
      if (!matched) warn("  language option 'Indonesian' not found");
    } else {
      warn("  language select not found");
    }

    // Mark as processed to avoid re-filling on future mutations
    block.dataset.epxFilled = "1";
  }

  // Process all blocks currently in the DOM
  function processAll() {
    const blocks = Array.from(document.querySelectorAll(".ep_upload_doc"));
    if (!blocks.length) { log("No .ep_upload_doc blocks found yet."); return; }
    log("Processing blocks:", blocks.length);
    for (const b of blocks) autofillBlock(b);
  }

  // Observer: when new file blocks are added (after uploads), autofill those too
  let debounceTimer = null;
  function scheduleProcess() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processAll, 300);
  }

  function attachObserver() {
    // Find any parent that contains the upload blocks; #c3_panels is common
    const container =
      document.querySelector("#c3_panels") ||
      document.querySelector(".ep_upload_doc")?.parentElement ||
      document.body;

    const mo = new MutationObserver(muts => {
      const added = muts.some(m =>
        Array.from(m.addedNodes || []).some(
          n => n.nodeType === 1 && n.classList && n.classList.contains("ep_upload_doc")
        )
      );
      if (added) {
        log("New document block(s) detected — scheduling autofill.");
        scheduleProcess();
      }
    });
    mo.observe(container, { childList: true, subtree: true });
    log("Observer attached to:", container.id || container.className || "<body>");
  }

  // Expose a manual re-run handle in DevTools:
  window.EPFill = { now: processAll };

  // Initial run + observer
  attachObserver();
  // Allow EPrints to finish first render
  setTimeout(processAll, 400);
})();
