/* EPrints Autofill — v12.1 (Updated Logic)
   - [stage=files]   Autofills Description/Visible/Language.
   - [stage=subjects] Implements "Strict Signal Matching".
   
   Updates v12.1:
   1. Fix: "XXXX_ABSTRAK" or "ABSTRACT" -> becomes strictly "ABSTRAK".
   2. Fix: Prioritized "DAFTAR PUSTAKA & LAMPIRAN" detection over plain "DAFTAR PUSTAKA".
   3. Update: "ABSTRAK" visibility set to "Anyone".
   4. Update: "JUDUL HALAMAN" / "HALAMAN JUDUL" -> becomes "COVER" (Visible: Anyone).
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

    // 4. Update: Handle "JUDUL HALAMAN" or "HALAMAN JUDUL" -> COVER
    if (l.includes("cover") || l.includes("halaman judul") || l.includes("judul halaman")) {
      return "COVER";
    }

    // 1. Update: Aggressive ABSTRAK handling.
    // Removes prefixes like "XXXX_" and handles "ABSTRACT" -> "ABSTRAK"
    if (l.includes("abstrak") || l.includes("abstract")) {
      return "ABSTRAK";
    }

    // 2. Update: Prioritize long "DAFTAR PUSTAKA & LAMPIRAN" before short "DAFTAR PUSTAKA"
    // Checks for "dan" OR "&"
    if (l.includes("daftar pustaka dan lampiran") || l.includes("daftar pustaka & lampiran")) {
      return "DAFTAR PUSTAKA DAN LAMPIRAN";
    }
    
    if (l.includes("daftar pustaka")) return "DAFTAR PUSTAKA";
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

    // Fill Description
    const descInput =
      block.querySelector('input[id$="_formatdesc"]') ||
      block.querySelector('input.ep_document_formatdesc');
    if (descInput) {
      descInput.value = writeDesc;
      descInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Fill Visibility
    // 3. Update: If COVER or ABSTRAK -> Anyone
    const visSelect = block.querySelector('select[id*="_security"]');
    if (visSelect) {
      const wantLabel = (writeDesc === "COVER" || writeDesc === "ABSTRAK") 
        ? "Anyone" 
        : "Registered users only";

      for (const opt of visSelect.options) {
        if (opt.text.trim().toLowerCase() === wantLabel.toLowerCase()) {
          visSelect.value = opt.value;
          visSelect.dispatchEvent(new Event("change", { bubbles: true }));
          break;
        }
      }
    }

    // Fill Language (Indonesian)
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
  // SECTION B: [stage=subjects] AUTOMATION (v12.0 - Scored Suggester UI)
  // [No Logic Changes Requested Here - Code Preserved]
  // ===================================================================

  const STOP_WORDS = new Set([
    'ADA', 'ADALAH', 'ADANYA', 'ADAPUN', 'AGAR', 'AKAN', 'AKHIR', 'AKHIRNYA',
    'AKU', 'AKULAH', 'AKAN', 'ALAH', 'ANTARA', 'APA', 'APABILA', 'APAKAH',
    'APALAGI', 'ATAS', 'ATAU', 'AWAL', 'BAHWA', 'BAIK', 'BAGAI', 'BAGAIKAN',
    'BAGAIMANA', 'BAGI', 'BAHKAN', 'BAKAL', 'BANYAK', 'BARU', 'BEBERAPA',
    'BEGINI', 'BEGINILAH', 'BEGINIAN', 'BEGITU', 'BEGITULAH', 'BEGITUPUN',
    'BELUM', 'BENAR', 'BERAPA', 'BERBAGAI', 'BERKATA', 'BERMACAM', 'BERNIAT',
    'BERSAMA', 'BERDASARKAN', 'BISA', 'BOLEH', 'BUAT', 'BUKAN', 'CARA',
    'CUMA', 'DALAM', 'DAN', 'DAPAT', 'DARI', 'DARIPADA', 'DEMI', 'DEMIKIAN',
    'DENGAN', 'DENGANNYA', 'DEPAN', 'DI', 'DIA', 'DIALAH', 'DIRI', 'DIRINYA',
    'DOELOE', 'DULU', 'ENGGAK', 'ENTAH', 'EVALUASI', 'FAKTOR', 'GAMBARAN',
    'GUNA', 'HAL', 'HAMPIR', 'HANYA', 'HARUS', 'HENDAK', 'HINGGA', 'HUBUNGAN',
    'IA', 'IALAH', 'IBARAT', 'INI', 'INILAH', 'INTERVENING', 'ITU', 'ITULAH',
    'JADI', 'JANGAN', 'JAUH', 'JUGA', 'JUMLAH', 'KADANG', 'KALI', 'KAMI',
    'KAMU', 'KAN', 'KANTOR', 'KARENA', 'KATA', 'KE', 'KECIL', 'KEMUDIAN',
    'KENAPA', 'KEPADA', 'KEPATUHAN', 'KEPUASAN', 'KESELURUHAN', 'KETIKA',
    'KHUSUSNYA', 'KINI', 'KITA', 'KUALITAS', 'KURANG', 'LAGI', 'LAIN', 'LALU',
    'LAMA', 'LANGSUNG', 'LANJUT', 'LEBIH', 'MAKA', 'MAKSUD', 'MALAH', 'MANA',
    'MAMPU', 'MASIH', 'MAU', 'MELALUI', 'MELAKUKAN', 'MELIHAT', 'MEMANG',
    'MEMBUAT', 'MEMILIKI', 'MEMPERLIHATKAN', 'MEMPUNYAI', 'MENGENAI',
    'MENGGUNAKAN', 'MENGINGAT', 'MENJADI', 'MENTERI', 'MENUJU', 'MENURUT',
    'MERASA', 'MEREKA', 'MERUPAKAN', 'MESKI', 'METODE', 'MISALNYA', 'MASALAH',
    'MULAI', 'MUNGKIN', 'NAH', 'NAMUN', 'NANTI', 'NYA', 'OLEH', 'ORANG',
    'PADA', 'PADAHAL', 'PALING', 'PANJANG', 'PARA', 'PASTI', 'PELAKSANAAN',
    'PELAYANAN', 'PENGARUH', 'PENELITIAN', 'PENERAPAN', 'PER', 'PERAN',
    'PERBEDAAN', 'PERIODE', 'PERLU', 'PERNAH', 'PERTAMA', 'PERUBAHAN',
    'PIHAK', 'PRIBADI', 'PROSES', 'PULA', 'PUN', 'RAKYAT', 'RATA', 'RUMAH',
    'SAAT', 'SAYA', 'SAMA', 'SAMPAI', 'SAMPING', 'SANGAT', 'SATU', 'SAJA',
    'SEBAGAI', 'SEBAGAIMANA', 'SEBAB', 'SEBAGIAN', 'SEBELUM', 'SEBENARNYA',
    'SEBUAH', 'SECARA', 'SEPERTI', 'SERING', 'SERTA', 'SESUATU', 'SESUDAH',
    'SETELAH', 'SETIAP', 'SEJAK', 'SEHINGGA', 'SEKARANG', 'SEKITAR', 'SEMUA',
    'SEMENTARA', 'SEMAKIN', 'SIAPA', 'SINI', 'SITU', 'STASIUN', 'STUDI',
    'SUDAH', 'SUPAYA', 'TAHUN', 'TAPI', 'TANPA', 'TENTANG', 'TENTU', 'TERHADAP',
    'TERJADI', 'TERMASUK', 'TERNYATA', 'TERSEBUT', 'TETAPI', 'TIAP', 'TIDAK',
    'TIGA', 'TINJAUAN', 'TINGGI', 'TOTAL', 'TUNGGAL', 'UNTUK', 'UPAYA',
    'VARIABEL', 'WAJIB', 'WAKTU', 'WALAUPUN', 'YA', 'YAITU', 'YAKNI', 'YANG',
    'KHUSUS'
  ]);
  
  const ACRONYM_LIST = [
      'CAR', 'LDR', 'NPL', 'BOPO', 'ROE', 'UKM', 'UMKM'
  ];

  function getSignalKeywords(titleText, stopWordsSet) {
    const upperTitle = titleText.toUpperCase();
    const signalWords = new Set();

    ACRONYM_LIST.forEach(acronym => {
      const regex = new RegExp(`\\b(${acronym})\\b|([A-Z]${acronym})\\b`, 'i');
      if (regex.test(upperTitle)) {
        signalWords.add(acronym);
      }
    });

    const titleWords = upperTitle
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .split(' ');
      
    titleWords.forEach(word => {
      if (
        word.length > 2 &&
        !/^[0-9]+$/.test(word) &&
        !stopWordsSet.has(word)
      ) {
        signalWords.add(word);
      }
    });
    
    return signalWords;
  }
  
  function tokenizeSubject(subjectText) {
      return new Set(
        subjectText.toUpperCase()
          .replace(/[\d.,\/]/g, " ")
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter(t => t.length > 2 && !STOP_WORDS.has(t))
      );
  }

  function injectUI(scoredMatches) {
    document.getElementById("epx-suggester")?.remove();

    const ui = document.createElement("div");
    ui.id = "epx-suggester";
    
    const topMatches = scoredMatches.slice(0, 5);
    const otherMatches = scoredMatches.slice(5, 15); 

    let topMatchesHtml = '';
    if (topMatches.length > 0) {
      topMatches.forEach(match => {
        const safeLabel = match.label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        topMatchesHtml += `<li style="margin-bottom: 5px;">(Score: ${match.score}) ${safeLabel}</li>`;
      });
    } else {
      topMatchesHtml = "<li>No relevant subjects found.</li>";
    }
    
    let otherMatchesHtml = '';
    if (otherMatches.length > 0) {
      otherMatches.forEach(match => {
        const safeLabel = match.label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        otherMatchesHtml += `<li style="margin-bottom: 5px; opacity: 0.8;">(Score: ${match.score}) ${safeLabel}</li>`;
      });
    }

    ui.innerHTML = `
      <h3 style="margin: 0 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid #ccc; font-size: 16px; color: #333;">
        💡 Subject Suggestions
      </h3>
      
      <strong style="display: block; margin-top: 10px; margin-bottom: 5px; color: #111;">MATCH (Top 5)</strong>
      <ul style="margin: 0; padding: 0 0 0 20px; list-style-type: disc;">
        ${topMatchesHtml}
      </ul>
      
      ${otherMatches.length > 0 ? `
        <strong style="display: block; margin-top: 15px; margin-bottom: 5px; color: #111;">COULD BE MATCHED (Top 10)</strong>
        <ul style="margin: 0; padding: 0 0 0 20px; max-height: 250px; overflow-y: auto; list-style-type: circle;">
          ${otherMatchesHtml}
        </ul>` 
      : ''}
    `;

    Object.assign(ui.style, {
      position: 'fixed',
      right: '20px', 
      top: '120px', 
      width: '320px',
      backgroundColor: '#f9f9f9',
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
    log(`UI injected with ${scoredMatches.length} total suggestions.`);
  }

  function suggestSubjects() {
    log("Running Strict Subject Suggester (v12.0)...");
    
    const stopWordsSet = STOP_WORDS;
    
    const titleEl = document.querySelector("h1.ep_tm_pagetitle"); 
    if (!titleEl) { warn("Could not find title: h1.ep_tm_pagetitle"); return; }
    
    const titleText = (titleEl.innerText || "").replace(/Edit item:/i, "");
    
    const signalKeywords = getSignalKeywords(titleText, stopWordsSet);
    
    if (signalKeywords.size === 0) {
      warn("No useful keywords found in title after filtering.");
      injectUI([]);
      return;
    }
    log("Strict Keywords Found:", signalKeywords);

    const subjectTree = document.getElementById("c38_tree");
    if (!subjectTree) { warn("Could not find subject tree (#c38_tree)."); return; }

    const subjectLinks = subjectTree.querySelectorAll("a"); 
    const scoredMatches = [];
    
    log(`Scanning ${subjectLinks.length} subject labels for matches...`);

    subjectLinks.forEach(labelEl => {
      const fullLabel = (labelEl.textContent || "").trim();
      if (!fullLabel) return;
      
      const subjectTokens = tokenizeSubject(fullLabel);
      let matchScore = 0;
      
      for (const keyword of signalKeywords) {
        if (subjectTokens.has(keyword)) {
            matchScore++;
        }
      }
      
      if (matchScore > 0) {
        scoredMatches.push({ label: fullLabel, score: matchScore });
      }
    });

    scoredMatches.sort((a, b) => b.score - a.score);

    injectUI(scoredMatches);
  }

  // ===================================================================
  // MAIN ROUTER
  // ===================================================================

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
