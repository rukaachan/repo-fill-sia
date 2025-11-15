/* EPrints Autofill — v6.0 (Strict Signal Matching)
   - [stage=files]   Autofills Description/Visible/Language.
   - [stage=subjects] Implements "Strict Signal Matching":
     1. Uses a STOP_WORDS list to filter language "noise".
     2. Uses an ACRONYM_LIST to find "signal" in combined words.
     3. Scans subject tree for high-quality signal keywords.
     4. Injects a UI box on the RIGHT side with relevant matches.
*/

(() => {
  const TAG = "[EPrintsAutofill]";
  const log  = (...a) => console.log(TAG, ...a);
  const warn = (...a) => console.warn(TAG, ...a);

  // ---------- Page Detection ----------
  const qs = new URLSearchParams(location.search);
  const IS_EDIT_FILES =
    /EPrint::Edit/i.test(qs.get("screen") || "") &&
    /files/i.test(qs.get("stage") || "");
  const IS_EDIT_SUBJECTS =
    /EPrint::Edit/i.test(qs.get("screen") || "") &&
    /subjects/i.test(qs.get("stage") || "");

  // ===================================================================
  // SECTION A: [stage=files] AUTOMATION (File Upload Page)
  // ===================================================================
  
  // [Functions: romanToInt, parseFileName, detectBabNumber, toCanonicalDescription,
  // autofillFileBlock, processAllFiles, attachFileObserver remain identical to v5.0]
  
  function romanToInt(roman) {
    if (!roman) return null;
    const s = roman.toUpperCase();
    const map = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
    let total = 0, prev = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      const v = map[s[i]] || 0;
      if (!v) return null;
      if (v < prev) total -= v; else { total += v; prev = v; }
    }
    return total || null;
  }

  function parseFileName(raw) {
    const name = (raw || "").trim();
    const m = name.match(/^\s*(\d+)\s*[.\-–_:]\s*(.+)$/i);
    let num = null, desc = name;
    if (m) { num = parseInt(m[1], 10); desc = m[2].trim(); }
    if (desc.includes("/")) desc = desc.split("/")[0].trim();
    desc = desc.replace(/\.[A-Za-z0-9]+$/i, "").trim();
    return { num, desc };
  }

  function detectBabNumber(descRaw) {
    const norm = (descRaw || "")
      .replace(/\.[A-Za-z0-9]+$/i, "")
      .replace(/[_\-.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();

    let m = norm.match(/\bBAB\s+(\d{1,2})\b/);
    if (m) return parseInt(m[1], 10);

    m = norm.match(/\bBAB\s+([IVXLCDM]+)\b/);
    if (m) {
      const n = romanToInt(m[1]);
      if (n != null) return n;
    }
    return null;
  }

  function toCanonicalDescription(descRaw) {
    const l = (descRaw || "").toLowerCase();
    if (l.includes("cover") || l.includes("halaman judul")) return "COVER";
    if (l.includes("02 abstract") || l.includes("abstract")) return "ABSTRAK";
    if (l.includes("daftar pustaka")) return "DAFTAR PUSTAKA";
    if (l.includes("daftar pustaka dan lampiran")) return "DAFTAR PUSTAKA DAN LAMPIRAN";
    if (l.includes("lampiran")) return "LAMPIRAN";

    const babNum = detectBabNumber(descRaw);
    if (babNum != null) return `BAB ${babNum}`;
    if (/\bbab\b/i.test(descRaw)) return "BAB XXX";
    return (descRaw || "").toUpperCase();
  }

  function autofillFileBlock(block) {
    if (!block || block.dataset.epxFilled === "1") return;
    const filenameEl = block.querySelector(".document_filename");
    if (!filenameEl) { warn("missing .document_filename in block", block); return; }

    const raw = filenameEl.textContent.trim();
    const info = parseFileName(raw);
    const writeDesc = toCanonicalDescription(info.desc);

    log("autofillFileBlock →", { raw, parsedDesc: info.desc, writeDesc });

    const descInput =
      block.querySelector('input[id$="_formatdesc"]') ||
      block.querySelector('input.ep_document_formatdesc');
    if (descInput) {
      descInput.value = writeDesc;
      descInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const visSelect = block.querySelector('select[id*="_security"]');
    if (visSelect) {
      const wantLabel = (writeDesc === "COVER") ? "Anyone" : "Registered users only";
      for (const opt of visSelect.options) {
        if (opt.text.trim().toLowerCase() === wantLabel.toLowerCase()) {
          visSelect.value = opt.value;
          visSelect.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }
      }
    }

    const langSelect = block.querySelector('select[id*="_language"]');
    if (langSelect) {
      for (const opt of langSelect.options) {
        if (opt.text.trim().toLowerCase() === "indonesian") {
          langSelect.value = opt.value;
          langSelect.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }
      }
    }
    block.dataset.epxFilled = "1";
  }

  function processAllFiles() {
    const blocks = Array.from(document.querySelectorAll(".ep_upload_doc"));
    blocks.forEach(autofillFileBlock);
  }

  function attachFileObserver() {
    const container =
      document.querySelector("#c3_panels") ||
      document.querySelector(".ep_upload_doc")?.parentElement ||
      document.body;

    const mo = new MutationObserver(() => {
      setTimeout(processAllFiles, 300);
    });
    mo.observe(container, { childList: true, subtree: true });
  }


  // ===================================================================
  // SECTION B: [stage=subjects] AUTOMATION (Strict Suggester UI)
  // ===================================================================
   
  const STOP_WORDS = new Set([
    'ANALISIS', 'PENGARUH', 'PERUBAHAN', 'DAN', 'TERHADAP', 'PADA',
    'PERIODE', 'TAHUN', 'STUDI', 'KASUS', 'METODE', 'SEBUAH', 'TINJAUAN',
    'GAMBARAN', 'HUBUNGAN', 'DENGAN', 'UNTUK', 'DI', 'DALAM', 'SERTA',
    'SECARA', 'UPAYA', 'PENERAPAN', 'EVALUASI', 'FAKTOR', 'SEBAGAI',
    'DITINJAU', 'PENGGUNAAN', 'DARI', 'YANG',
    'RAKYAT'
  ]);
  
  /**
   * This is the new "signal" list.
   * It helps find keywords *inside* combined words (like CAR in "PERUBAHANCAR").
   */
  const ACRONYM_LIST = [
      'CAR', 'LDR', 'NPL', 'BOPO', 'ROE'
  ];

  /**
   * Extracts the important "signal" keywords from the title.
   */
  function getSignalKeywords(titleText) {
    const upperTitle = titleText.toUpperCase();
    const signalWords = new Set();

    // 1. Add known acronyms that are found
    ACRONYM_LIST.forEach(acronym => {
        // This regex finds the acronym even if it's inside another word
        // e.g., finds "CAR" in "PERUBAHANCAR"
        const regex = new RegExp(`\\b(${acronym})\\b|([A-Z]${acronym})\\b`, 'i');
        if (regex.test(upperTitle)) {
            signalWords.add(acronym);
        }
    });

    // 2. Add regular words from the title, after filtering
    const titleWords = upperTitle
      .replace(/[^\w\s]/g, " ")  // Replace punctuation with space
      .replace(/\s+/g, " ")      // Normalize multiple spaces
      .split(' ');
      
    titleWords.forEach(word => {
        if (word.length > 3 && !/^[0-9]+$/.test(word) && !STOP_WORDS.has(word)) {
            signalWords.add(word);
        }
    });
    
    return signalWords;
  }
  
  /**
   * Injects the pop-up UI on the RIGHT side of the page.
   */
  function injectUI(matchedLabels) {
    document.getElementById("epx-suggester")?.remove();

    const ui = document.createElement("div");
    ui.id = "epx-suggester";
    
    let listHtml = "";
    if (matchedLabels.size > 0) {
      const sortedLabels = [...matchedLabels].sort();
      sortedLabels.forEach(label => {
        const safeLabel = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        listHtml += `<li style="margin-bottom: 5px;">${safeLabel}</li>`;
      });
    } else {
      listHtml = "<li>No specific keywords from the title matched any subjects.</li>";
    }
    
    ui.innerHTML = `
      <h3 style="margin: 0 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid #ccc; font-size: 16px; color: #333;">
        💡 Subject Suggestions
      </h3>
      <ul style="margin: 0; padding: 0 0 0 20px; max-height: 300px; overflow-y: auto; list-style-type: disc;">
        ${listHtml}
      </ul>
    `;

    // --- UI ---
    Object.assign(ui.style, {
      position: 'fixed',
      right: '20px', 
      top: '120px', 
      width: '320px',
      backgroundColor: '#ffffff',
      border: '1px solid #ccc',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      padding: '15px',
      zIndex: '9999',
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      lineHeight: '1.5',
      color: '#555'
    });

    document.body.appendChild(ui);
    log(`UI injected with ${matchedLabels.size} suggestions.`);
  }

  /**
   * Main function for the Subject page.
   * Reads title, filters for signal, matches, and shows UI.
   */
  function suggestSubjects() {
    log("Running Strict Subject Suggester (v6.0)...");
    
    // 1. Get Title
    const titleEl = document.querySelector("h1.ep_tm_pagetitle"); 
    if (!titleEl) { warn("Could not find title: h1.ep_tm_pagetitle"); return; }
    
    const titleText = (titleEl.innerText || "").replace(/Edit item:/i, "");
    
    // 2. Extract *Signal* Keywords
    const signalKeywords = getSignalKeywords(titleText);
    
    if (signalKeywords.size === 0) {
      warn("No useful keywords found in title after filtering.");
      injectUI(new Set());
      return;
    }
    log("Strict Keywords Found:", signalKeywords);

    // 3. Scan Subject Tree
    const subjectTree = document.getElementById("c38_tree");
    if (!subjectTree) { warn("Could not find subject tree (#c38_tree)."); return; }

    // We select ALL <dt> elements, not just <a> tags.
    const subjectNodes = subjectTree.querySelectorAll("dt");
    const matchedLabels = new Set();
    
    log(`Scanning ${subjectNodes.length} subject nodes for matches...`);

    // 4. Match
    subjectNodes.forEach(node => {
      const fullLabel = (node.textContent || "").trim();
      if (!fullLabel) return;
      
      const subjectTextUpper = fullLabel.toUpperCase();
      
      for (const keyword of signalKeywords) {
        // Use a RegExp to find the keyword as a whole word
        try {
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          if (regex.test(subjectTextUpper)) {
            // We found a match. Get the *clean* text (without the "Add" button text)
            const labelEl = node.querySelector("a") || node;
            const cleanLabel = labelEl.textContent.trim();
            
            matchedLabels.add(cleanLabel);
            log(`  MATCH: Keyword '${keyword}' matched subject "${cleanLabel}"`);
            break; 
          }
        } catch (e) {
          warn(`Regex error for keyword '${keyword}', using simple match.`, e);
          if (subjectTextUpper.includes(keyword)) {
            const labelEl = node.querySelector("a") || node;
            const cleanLabel = labelEl.textContent.trim();
            matchedLabels.add(cleanLabel);
            break;
          }
        }
      }
    });

    // 5. Display UI (on the right)
    injectUI(matchedLabels);
  }

  // ===================================================================
  // MAIN ROUTER
  // ===================================================================

  // Manual trigger: EPFill.now() in DevTools
  window.EPFill = {
    nowFiles: processAllFiles,
    nowSubjects: suggestSubjects,
  };

  if (IS_EDIT_FILES) {
    log("EPrintsAutofill: 'Files' page detected.");
    attachFileObserver();
    setTimeout(processAllFiles, 500); 
  } 
  else if (IS_EDIT_SUBJECTS) {
    log("EPrintsAutofill: 'Subjects' page detected.");
    setTimeout(suggestSubjects, 1000); 
  } else {
    log("EPrintsAutofill: Not on a recognized edit page. Standing by.");
  }
  
})();
