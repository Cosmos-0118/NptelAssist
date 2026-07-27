// ──────────────────────────────────────────────────────────
//  content.js — NPTEL Assist
//  Core matching engine + question extractor.
//  Injected into NPTEL assignment pages.
// ──────────────────────────────────────────────────────────

(() => {
    'use strict';

    const SCRIPT_VERSION = 24;

    // Re-inject after extension update: drop old listener, keep one active copy
    if (globalThis.__nptelAssistOnMessage) {
        try {
            chrome.runtime.onMessage.removeListener(globalThis.__nptelAssistOnMessage);
        } catch (_) { /* ignore */ }
    }

    // ═══════════════════════════════════════════════
    //  TEXT NORMALIZATION UTILITIES
    // ═══════════════════════════════════════════════

    /**
     * Deep-normalize a string for comparison:
     *  - lowercase
     *  - collapse whitespace
     *  - strip common punctuation noise
     *  - normalize unicode dashes/quotes
     */
    function normalize(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")   // smart quotes → '
            .replace(/[\u2013\u2014]/g, '-')                // en/em dash → -
            .replace(/\s+/g, ' ')                           // collapse whitespace
            .replace(/^\s+|\s+$/g, '');                     // trim
    }

    /**
     * Aggressive normalization — strips ALL whitespace and
     * common surrounding punctuation for tighter matching.
     */
    function normalizeStrict(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\s+/g, '')
            .replace(/^[a-z][\.\)]\s*/i, '')                // strip leading "a)" "b." etc.
            .replace(/[,;:]+$/, '');                         // strip trailing punctuation
    }

    /**
     * Extract a clean numeric value from a string if possible.
     * Returns null when the string is not a simple number.
     */
    function parseNumeric(s) {
        const cleaned = s.replace(/\s/g, '');
        // Handle fractions like 1/2, 1/4
        const fracMatch = cleaned.match(/^(-?\d+)\/(\d+)$/);
        if (fracMatch) return parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
        // Handle plain numbers like 0.803
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
        return null;
    }

    /**
     * Compute a similarity score (0–1) between two strings
     * using token overlap (Sørensen–Dice on word tokens).
     */
    function tokenSimilarity(a, b) {
        const tokA = new Set(normalize(a).split(/\s+/).filter(Boolean));
        const tokB = new Set(normalize(b).split(/\s+/).filter(Boolean));
        if (tokA.size === 0 && tokB.size === 0) return 1;
        if (tokA.size === 0 || tokB.size === 0) return 0;
        let overlap = 0;
        for (const t of tokA) if (tokB.has(t)) overlap++;
        return (2 * overlap) / (tokA.size + tokB.size);
    }


    // ═══════════════════════════════════════════════
    //  ANSWER PARSING
    // ═══════════════════════════════════════════════

    function parseInputText(text) {
        const results = [];

        // Split the text into blocks per question.
        // A new question starts with a line like "1." or "1)" or "Q1." at the beginning.
        const blocks = text.split(/(?=^\s*\d+[\.\)]\s)/m);

        for (const block of blocks) {
            const trimmed = block.trim();
            if (!trimmed) continue;

            // Get the question number
            const numMatch = trimmed.match(/^\s*(\d+)[\.\)]\s/);
            const questionNum = numMatch ? parseInt(numMatch[1], 10) : null;

            // Find all lines that start with Answer: or Ans:
            const answerMatches = [...trimmed.matchAll(/^[\s]*(?:answer|ans)\s*:\s*(.+)/gim)];
            if (answerMatches.length === 0) continue;

            const answersCleaned = [];
            for (const match of answerMatches) {
                const answerRaw = match[1].trim();
                let cleaned = answerRaw;
                const sepIdx = answerRaw.search(/\s+[—–]\s+/);
                if (sepIdx !== -1) {
                    cleaned = answerRaw.substring(0, sepIdx).trim();
                }
                answersCleaned.push(cleaned);
            }

            results.push({
                questionNum,
                answersCleaned,
            });
        }

        return results;
    }


    // ═══════════════════════════════════════════════
    //  DOM DISCOVERY — FIND QUESTIONS ON THE PAGE
    // ═══════════════════════════════════════════════

    /**
     * Discover all question groups on the page.
     * Returns an array of QuestionGroup objects:
     *   { index, questionEl, inputs: [input, ...], getOptionLabel(input) }
     *
     * Tries multiple selector strategies to handle different
     * NPTEL page layouts (Moodle-based and custom).
     */
    function discoverQuestionGroups() {
        let groups = [];

        // ── Strategy 1: Moodle-standard selectors ──
        groups = tryMoodleSelectors();
        if (groups.length > 0) return groups;

        // ── Strategy 2: Generic — group radios/checkboxes by `name` ──
        groups = tryGroupByName();
        if (groups.length > 0) return groups;

        // ── Strategy 3: Ultra-fallback — any input with type radio/checkbox ──
        groups = tryFlatInputs();
        return groups;
    }

    function tryMoodleSelectors() {
        // Moodle quiz pages wrap each question in .que
        const questions = document.querySelectorAll('.que, .question, [id^="question-"]');
        if (questions.length === 0) return [];

        return Array.from(questions).map((el, i) => {
            const inputs = Array.from(el.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
            return { index: i, questionEl: el, inputs, getOptionLabel: getLabelForInput };
        }).filter(g => g.inputs.length > 0);
    }

    function tryGroupByName() {
        const allInputs = Array.from(
            document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
        );
        if (allInputs.length === 0) return [];

        const map = new Map();
        for (const input of allInputs) {
            const name = input.name || input.getAttribute('name');
            if (!name) continue;
            if (!map.has(name)) map.set(name, []);
            map.get(name).push(input);
        }

        let idx = 0;
        const groups = [];
        for (const [, inputs] of map) {
            if (inputs.length < 2) continue; // skip single-input groups
            groups.push({
                index: idx++,
                questionEl: inputs[0].closest('div, fieldset, form, section') || document.body,
                inputs,
                getOptionLabel: getLabelForInput,
            });
        }
        return groups;
    }

    function tryFlatInputs() {
        const allInputs = Array.from(
            document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
        );
        if (allInputs.length === 0) return [];
        // Treat the entire set as one group (worst case)
        return [{
            index: 0,
            questionEl: document.body,
            inputs: allInputs,
            getOptionLabel: getLabelForInput,
        }];
    }

    /**
     * Extract the visible label text for a given radio/checkbox input.
     * Walks multiple DOM patterns to find the label.
     * @param {HTMLInputElement} input
     * @param {{ imageSession?: object, baseName?: string }} [opts]
     */
    function getLabelForInput(input, opts) {
        // 1. Wrapping <label>
        const parentLabel = input.closest('label');
        if (parentLabel) {
            return extractTextWithImages(parentLabel, input, opts);
        }

        // 2. <label for="id">
        if (input.id) {
            const labelFor = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
            if (labelFor) return extractTextWithImages(labelFor, null, opts);
        }

        // 3. Adjacent text node
        if (input.nextSibling && input.nextSibling.nodeType === Node.TEXT_NODE) {
            const txt = input.nextSibling.textContent.trim();
            if (txt.length > 0) return txt;
        }

        // 4. Next sibling element
        if (input.nextElementSibling) {
            return extractTextWithImages(input.nextElementSibling, null, opts);
        }

        // 5. Parent's text content minus the input itself
        if (input.parentElement) {
            const clone = input.parentElement.cloneNode(true);
            clone.querySelectorAll('input').forEach(el => el.remove());
            return clone.textContent.trim();
        }

        return '';
    }

    /**
     * Get text from an element, replacing <img> with downloadable filename markers.
     * Optionally exclude a specific child element.
     */
    function extractTextWithImages(el, excludeChild, opts) {
        const clone = el.cloneNode(true);
        if (excludeChild) {
            clone.querySelectorAll('input').forEach(inp => inp.remove());
        }
        const session = opts && opts.imageSession;
        const baseName = (opts && opts.baseName) || 'img';
        clone.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            const alt = img.getAttribute('alt') || '';
            let marker;
            if (session && src) {
                marker = session.markerFor(src, baseName);
            } else if (alt) {
                marker = alt;
            } else if (src) {
                const fullSrc = absolutizeUrl(src);
                marker = `[Image: ${fullSrc}]`;
            } else {
                marker = '[Image]';
            }
            img.replaceWith(document.createTextNode(marker));
        });
        clone.querySelectorAll('script[type*="math"]').forEach(s => {
            s.replaceWith(document.createTextNode(s.textContent));
        });
        return clone.textContent.trim();
    }

    function absolutizeUrl(src) {
        if (!src) return '';
        try {
            return src.startsWith('http') || src.startsWith('data:')
                ? src
                : new URL(src, window.location.href).href;
        } catch (_) {
            return src;
        }
    }

    function extFromUrl(url) {
        try {
            const path = new URL(url, window.location.href).pathname;
            const m = path.match(/\.(png|jpe?g|gif|webp|svg|bmp)(?:$|\?)/i);
            if (m) {
                const e = m[1].toLowerCase();
                return e === 'jpeg' ? 'jpg' : e;
            }
        } catch (_) { /* ignore */ }
        return 'png';
    }

    function makeFolderName() {
        const raw = (document.title || 'assignment')
            .replace(/[^\w\s-]+/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40) || 'assignment';
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
        return `NPTEL-Assist-${raw}-${ts}`;
    }

    /**
     * Tracks images found during extract, assigns stable filenames,
     * and later fetches bytes (with page cookies) for download.
     */
    function createImageSession(folderName) {
        const bySrc = new Map(); // fullSrc -> { name, src }
        const counters = new Map(); // baseName -> count

        function register(src, baseName) {
            const fullSrc = absolutizeUrl(src);
            if (!fullSrc || fullSrc.startsWith('data:')) {
                if (fullSrc && fullSrc.startsWith('data:') && !bySrc.has(fullSrc)) {
                    const name = nextName(baseName, 'png');
                    bySrc.set(fullSrc, { name, src: fullSrc });
                    return name;
                }
                return null;
            }
            if (bySrc.has(fullSrc)) return bySrc.get(fullSrc).name;
            const name = nextName(baseName, extFromUrl(fullSrc));
            bySrc.set(fullSrc, { name, src: fullSrc });
            return name;
        }

        function nextName(baseName, ext) {
            const count = (counters.get(baseName) || 0) + 1;
            counters.set(baseName, count);
            return count === 1 ? `${baseName}.${ext}` : `${baseName}-${count}.${ext}`;
        }

        function markerFor(src, baseName) {
            const name = register(src, baseName);
            if (!name) return ' [Image] ';
            return ` [Image: ${name} — attach from folder ${folderName}] `;
        }

        function listImages() {
            return Array.from(bySrc.values()).map(({ name, src }) => ({ name, src }));
        }

        return {
            folderName,
            markerFor,
            register,
            listImages,
            get size() { return bySrc.size; },
        };
    }


    // ═══════════════════════════════════════════════
    //  MATCHING ENGINE
    // ═══════════════════════════════════════════════

    /**
     * Try to match a parsed answer string against the options
     * of a single question group.  Returns the best-matching
     * input element, or null if no confident match is found.
     *
     * Matching cascade (in order of strictness):
     *  1. Exact normalized match
     *  2. Numeric equality (for fractional / decimal answers)
     *  3. Strict-normalized containment (bidirectional)
     *  4. Token similarity ≥ 0.6
     *  5. Multi-value match (answer has commas → pick multiple)
     */
    function findBestMatch(answerCleaned, group) {
        const options = group.inputs.map(input => {
            const label = group.getOptionLabel(input);
            return {
                input,
                label,
                normalized: normalize(label),
                strict: normalizeStrict(label),
            };
        });

        // ── Handle comma-separated multi-answers ──
        // e.g. "1/2, 2/3" or "PDF: yes, CDF: no" or "Yes, x^(-2)..."
        // Heuristic: if there are commas and the whole answer doesn't match
        // any single option, try splitting.
        const bestSingle = matchSingle(answerCleaned, options);
        if (bestSingle.length > 0) return bestSingle;

        // Try comma-split matching for compound answers
        const parts = smartSplit(answerCleaned);
        if (parts.length > 1) {
            const multiResult = [];
            for (const part of parts) {
                const matches = matchSingle(part.trim(), options);
                multiResult.push(...matches);
            }
            if (multiResult.length > 0) return multiResult;
        }

        return [];
    }

    /**
     * Match a single answer value against options.
     * Returns an array of matched input elements.
     */
    function matchSingle(answer, options) {
        const aNorm = normalize(answer);
        const aStrict = normalizeStrict(answer);
        const aNum = parseNumeric(answer.trim());

        // Pass 1: Exact normalized match
        for (const opt of options) {
            if (opt.normalized === aNorm || opt.strict === aStrict) {
                return [opt.input];
            }
        }

        // Pass 2: Numeric equality
        if (aNum !== null) {
            for (const opt of options) {
                const optNum = parseNumeric(opt.label.trim());
                if (optNum !== null && Math.abs(optNum - aNum) < 1e-6) {
                    return [opt.input];
                }
                // Also try to find the number anywhere in the label
                const numsInLabel = opt.label.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g);
                if (numsInLabel) {
                    for (const numStr of numsInLabel) {
                        const parsed = parseNumeric(numStr);
                        if (parsed !== null && Math.abs(parsed - aNum) < 1e-6) {
                            return [opt.input];
                        }
                    }
                }
            }
        }

        // Pass 3: Strict containment (bidirectional)
        for (const opt of options) {
            if (opt.strict.length < 1) continue;
            if (opt.strict.includes(aStrict) || aStrict.includes(opt.strict)) {
                return [opt.input];
            }
        }

        // Pass 4: Normalized containment
        for (const opt of options) {
            if (opt.normalized.length < 1) continue;
            if (opt.normalized.includes(aNorm) || aNorm.includes(opt.normalized)) {
                return [opt.input];
            }
        }

        // Pass 5: Token similarity scoring
        let bestScore = 0;
        let bestOpt = null;
        for (const opt of options) {
            const score = tokenSimilarity(answer, opt.label);
            if (score > bestScore) {
                bestScore = score;
                bestOpt = opt;
            }
        }
        if (bestScore >= 0.6 && bestOpt) {
            return [bestOpt.input];
        }

        // Pass 6: Try matching common patterns like "Yes" / "No", "True" / "False"
        const ansLower = answer.trim().toLowerCase();
        const boolMap = {
            'yes': ['yes', 'true'],
            'no': ['no', 'false'],
            'true': ['true', 'yes'],
            'false': ['false', 'no'],
        };
        if (boolMap[ansLower]) {
            for (const opt of options) {
                const optLower = opt.normalized;
                for (const keyword of boolMap[ansLower]) {
                    if (optLower === keyword || optLower.startsWith(keyword + ',') || optLower.startsWith(keyword + ' ')) {
                        return [opt.input];
                    }
                }
            }
        }

        return [];
    }

    /**
     * Intelligently split a compound answer by commas,
     * but don't split inside mathematical expressions.
     *
     * e.g. "1/2, 2/3" → ["1/2", "2/3"]
     * e.g. "x^(-2)e^(-1/x), x>0" → left as one piece if parens are balanced
     */
    function smartSplit(text) {
        const parts = [];
        let depth = 0;
        let current = '';

        for (const ch of text) {
            if (ch === '(' || ch === '[' || ch === '{') {
                depth++;
                current += ch;
            } else if (ch === ')' || ch === ']' || ch === '}') {
                depth = Math.max(0, depth - 1);
                current += ch;
            } else if (ch === ',' && depth === 0) {
                parts.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
        if (current.trim()) parts.push(current.trim());
        return parts;
    }


    // ═══════════════════════════════════════════════
    //  MARK ANSWERS — MAIN ENTRY POINT
    // ═══════════════════════════════════════════════

    function markAnswers(text) {
        const parsed = parseInputText(text);
        console.log('[NPTEL Assist] Parsed answers:', parsed);

        if (parsed.length === 0) {
            return {
                success: false,
                error: 'Could not parse any answers. Use the format:\n1. Question\nAnswer: value',
            };
        }

        const groups = discoverQuestionGroups();
        console.log('[NPTEL Assist] Discovered question groups:', groups.length);

        if (groups.length === 0) {
            return {
                success: false,
                error: 'No questions/options found on this page. Make sure you are on an assignment page.',
            };
        }

        let markedCount = 0;
        const skipped = [];
        const total = parsed.length;

        for (let i = 0; i < parsed.length; i++) {
            const { questionNum, answersCleaned } = parsed[i];

            // Determine which question group this answer belongs to.
            // Prefer matching by question number (1-indexed → group[n-1]).
            let group = null;
            if (questionNum !== null && questionNum >= 1 && questionNum <= groups.length) {
                group = groups[questionNum - 1];
            } else if (i < groups.length) {
                // Fallback: match by order
                group = groups[i];
            }

            if (!group) {
                skipped.push(questionNum || (i + 1));
                console.warn(`[NPTEL Assist] Q${questionNum || i + 1}: No matching question group on page.`);
                continue;
            }

            let matchedAny = false;
            
            for (const answerCleaned of answersCleaned) {
                const matchedInputs = findBestMatch(answerCleaned, group);

                if (matchedInputs.length === 0) {
                    console.warn(
                        `[NPTEL Assist] Q${questionNum || i + 1}: No match found for "${answerCleaned}".`,
                        'Options were:',
                        group.inputs.map(inp => group.getOptionLabel(inp))
                    );
                    continue;
                }

                for (const input of matchedInputs) {
                    if (!input.checked) {
                        // Dispatch events to trigger any JS listeners on the page
                        input.focus();
                        input.click();
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }

                matchedAny = true;
                console.log(
                    `[NPTEL Assist] Q${questionNum || i + 1}: Marked "${answerCleaned}" → `,
                    matchedInputs.map(inp => group.getOptionLabel(inp))
                );
            }
            
            if (matchedAny) {
                markedCount++;
            } else {
                skipped.push(questionNum || (i + 1));
            }
        }

        return { success: true, markedCount, total, skipped };
    }


    // ═══════════════════════════════════════════════
    //  EXTRACT QUESTIONS
    // ═══════════════════════════════════════════════

    async function extractQuestions() {
        const groups = discoverQuestionGroups();

        if (groups.length === 0) {
            return {
                success: false,
                error: 'No questions found on this page.',
            };
        }

        const folderName = makeFolderName();
        const imageSession = createImageSession(folderName);
        const lines = [];

        // ── AI format instructions (prepended so paste-into-AI works out of the box) ──
        lines.push(
            'Solve the following MCQ questions. Reply using ONLY this exact format so answers can be auto-marked:',
            '',
            'For SINGLE-ANSWER questions (one correct option):',
            'N. <short restatement or leave blank>',
            'Answer: <exact option text>',
            '',
            'For MULTIPLE-ANSWER questions (select all that apply):',
            'N. <short restatement or leave blank>',
            'Answer: <exact option text 1>',
            'Answer: <exact option text 2>',
            '(one Answer: line per correct option; do NOT put all options on one line)',
            '',
            'Rules:',
            '- Keep the same question numbers (1, 2, 3, …).',
            '- Copy option text EXACTLY as written below (including punctuation/math).',
            '- Do not add explanations on the Answer: line. Optional notes after an em dash are OK: Answer: value — reason',
            '- Do not invent options; pick only from the listed choices.',
            '- When a question references [Image: filename], that file was saved under Downloads/' + folderName + '. Attach those image files so you can see the figures.',
            '',
            '--- QUESTIONS ---',
            ''
        );

        for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
            const qEl = group.questionEl;
            const qNum = i + 1;

            // Detect single (radio) vs multiple (checkbox)
            const isMultiple = group.inputs.some(inp => inp.type === 'checkbox');
            const typeLabel = isMultiple ? 'MULTIPLE ANSWERS' : 'SINGLE ANSWER';

            // ── Extract question text ──
            let questionText = '';
            const qOpts = { imageSession, baseName: `q${qNum}` };

            // Try Moodle-specific selectors first
            const qtextEl = qEl.querySelector('.qtext, .question-text, .questiontext');
            if (qtextEl) {
                questionText = extractFullContent(qtextEl, qOpts);
            } else {
                // Try walking up and finding a sibling element that contains text (likely the question)
                let foundText = '';
                let current = qEl;
                while (current && current !== document.body) {
                    const prev = current.previousElementSibling;
                    if (prev && prev.textContent.trim().length > 0 && !prev.querySelector('input[type="radio"], input[type="checkbox"]')) {
                        foundText = extractFullContent(prev, qOpts);
                        break;
                    }
                    current = current.parentElement;
                }

                if (foundText) {
                    questionText = foundText;
                } else {
                    // Fallback: get the text before the first input in the container
                    questionText = extractQuestionFromContainer(qEl, group.inputs, qOpts);
                }
            }

            questionText = questionText.trim() || '(Question text not found)';
            questionText = formatQuestionText(questionText);

            lines.push(`${qNum}. [${typeLabel}] ${questionText}`);

            // ── Extract options ──
            group.inputs.forEach((input, j) => {
                const letter = String.fromCharCode(97 + j); // a, b, c, d...
                const label = getLabelForInput(input, {
                    imageSession,
                    baseName: `q${qNum}-opt-${letter}`,
                });
                const formattedLabel = label.replace(/\s+/g, ' ').trim();
                lines.push(`   ${letter}) ${formattedLabel}`);
            });

            lines.push(''); // blank line between questions
        }

        const images = imageSession.size > 0 ? imageSession.listImages() : [];
        const text = lines.join('\n').trim();
        return {
            success: true,
            text,
            count: groups.length,
            folderName,
            images,
            imageCount: images.length,
            imageFound: imageSession.size,
        };
    }

    /**
     * Cleans up question text formatting.
     */
    function formatQuestionText(text) {
        let cleaned = text.trim();
        // Remove leading numbering like "1. ", "10)", "Q1.", "1. 1."
        cleaned = cleaned.replace(/^(?:\s*(?:Q\s*)?\d+\s*[\.\)]\s*)+/i, '');
        // Remove trailing "1 Point", "2 Points" (often placed at the end by NPTEL)
        cleaned = cleaned.replace(/[\s\n]*\d+\s*Points?[\s\n]*$/i, '');
        return cleaned.trim();
    }

    /**
     * Extract full content from an element including image filename markers.
     */
    function extractFullContent(el, opts) {
        const clone = el.cloneNode(true);
        const session = opts && opts.imageSession;
        const baseName = (opts && opts.baseName) || 'img';

        // Replace images with downloadable filename placeholders
        clone.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            let marker;
            if (session && src) {
                marker = session.markerFor(src, baseName);
            } else if (src) {
                const fullSrc = absolutizeUrl(src);
                marker = ` [Image: ${fullSrc}] `;
            } else {
                marker = ' [Image] ';
            }
            img.replaceWith(document.createTextNode(marker));
        });

        // Handle MathJax / KaTeX
        clone.querySelectorAll('.MathJax, .katex').forEach(mathEl => {
            const script = mathEl.querySelector('script[type*="math"]');
            if (script) {
                mathEl.replaceWith(document.createTextNode(` $${script.textContent}$ `));
            }
        });

        // Add line breaks for block elements to prevent text smashing
        clone.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6').forEach(block => {
            if (block.tagName.toLowerCase() === 'br') {
                block.replaceWith(document.createTextNode('\n'));
            } else {
                block.prepend(document.createTextNode('\n'));
                block.append(document.createTextNode('\n'));
            }
        });

        // Remove any hidden elements
        clone.querySelectorAll('[style*="display: none"], [style*="display:none"], .hidden').forEach(h => h.remove());

        let text = clone.textContent || '';
        // Normalize spacing: preserve paragraphs but collapse huge gaps
        text = text.replace(/[ \t]+/g, ' ');
        text = text.replace(/\n\s*\n+/g, '\n\n');
        text = text.replace(/\n /g, '\n');

        return text.trim();
    }

    /**
     * Fallback question text extraction:
     * Get all text content from the container that appears BEFORE
     * the first input element.
     */
    function extractQuestionFromContainer(container, inputs, opts) {
        if (inputs.length === 0) return container.textContent.trim();

        const firstInput = inputs[0];
        const range = document.createRange();
        range.setStartBefore(container.firstChild || container);
        range.setEndBefore(firstInput);

        const fragment = range.cloneContents();
        const temp = document.createElement('div');
        temp.appendChild(fragment);

        const session = opts && opts.imageSession;
        const baseName = (opts && opts.baseName) || 'img';

        temp.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            if (session && src) {
                img.replaceWith(document.createTextNode(session.markerFor(src, baseName)));
            } else {
                const fullSrc = absolutizeUrl(src);
                img.replaceWith(document.createTextNode(`[Image: ${fullSrc}]`));
            }
        });

        // Add line breaks for block elements
        temp.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6').forEach(block => {
            if (block.tagName.toLowerCase() === 'br') {
                block.replaceWith(document.createTextNode('\n'));
            } else {
                block.prepend(document.createTextNode('\n'));
                block.append(document.createTextNode('\n'));
            }
        });

        let text = temp.textContent || '';
        text = text.replace(/[ \t]+/g, ' ');
        text = text.replace(/\n\s*\n+/g, '\n\n');
        text = text.replace(/\n /g, '\n');

        return text.trim();
    }


    // ═══════════════════════════════════════════════
    //  AUTO-COMPLETE (SIDEBAR CLICKS)
    // ═══════════════════════════════════════════════

    function frameHasSidebar() {
        if (document.querySelector('nav[aria-label="Course outline"]')) return true;
        if (document.querySelector('.outline-item, .fa-circle-o, .fa-circle-thin')) return true;
        // Swayam / NPTEL often put weeks + empty-circle SVGs in the left rail
        const bodyText = (document.body && document.body.innerText) || '';
        if (/Week\s*\d+/i.test(bodyText) && document.querySelector('svg circle, svg')) return true;
        if (document.querySelector('[class*="sidebar"], [class*="outline"], aside')) {
            if (/Week\s*\d+/i.test(bodyText)) return true;
        }
        return false;
    }

    /**
     * Fire a single native click. Do NOT also dispatch a synthetic click —
     * React toggles (aria-expanded) would open then immediately close.
     */
    function simulateClick(el) {
        if (!el) throw new Error('simulateClick: no element');

        let target = el;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'g' || tag === 'polyline') {
            const clickable = el.closest('button, a, [role="button"], [role="link"], [tabindex]');
            if (clickable) target = clickable;
        }

        try {
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (_) { /* ignore */ }

        try {
            if (typeof target.focus === 'function') target.focus({ preventScroll: true });
        } catch (_) { /* ignore */ }

        if (typeof target.click === 'function') {
            target.click();
            return;
        }

        target.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
        }));
    }

    /** SWAYAM completed lessons use lucide-circle-check + green #24C246 */
    function isLessonCompleted(lessonBtn) {
        const svg = lessonBtn.querySelector('svg');
        if (!svg) return false;
        const cls = (svg.getAttribute('class') || '') + ' ' + svg.outerHTML;
        return /lucide-circle-check|circle-check|#24C246|#24c246/i.test(cls);
    }

    function getLessonLabel(lessonBtn) {
        const p = lessonBtn.querySelector('p');
        return (p?.textContent || lessonBtn.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getUnitTitle(toggleBtn) {
        const h3 = toggleBtn.querySelector('h3');
        return (h3?.textContent || toggleBtn.textContent || '').replace(/\s+/g, ' ').trim();
    }

    async function waitFor(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    /** Wait until unit list is in DOM / expanded, or timeout */
    async function waitUntilExpanded(toggleBtn, timeoutMs = 2500) {
        const listId = toggleBtn.getAttribute('aria-controls');
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (toggleBtn.getAttribute('aria-expanded') === 'true') return true;
            if (listId && document.getElementById(listId)) {
                const list = document.getElementById(listId);
                if (list && list.children.length > 0) return true;
            }
            await waitFor(150);
        }
        return toggleBtn.getAttribute('aria-expanded') === 'true';
    }

    /** After opening a lesson, wait for SPA nav / completion mark */
    async function waitAfterLessonClick(lessonText, timeoutMs = 6000) {
        const start = Date.now();
        const startUrl = location.href;
        while (Date.now() - start < timeoutMs) {
            await waitFor(300);
            const nav = document.querySelector('nav[aria-label="Course outline"]');
            if (nav) {
                const buttons = nav.querySelectorAll('[id^="unit-"][id$="-list"] > button');
                for (const btn of buttons) {
                    if (getLessonLabel(btn) === lessonText && isLessonCompleted(btn)) {
                        return 'completed';
                    }
                }
            }
            if (location.href !== startUrl) {
                // navigated — give the new page a moment to settle
                await waitFor(1500);
                return 'navigated';
            }
        }
        return 'timeout';
    }

    async function runAutoComplete() {
        if (globalThis.__nptelAssistRunning) {
            chrome.runtime.sendMessage({ action: 'ac_progress', message: 'Already running…' });
            return;
        }
        globalThis.__nptelAssistRunning = true;

        try {
            chrome.runtime.sendMessage({ action: 'ac_progress', message: 'Started…' });

            const clickedTexts = new Set();
            let count = 0;
            let idleRounds = 0;

            while (idleRounds < 3) {
                const item = getNextUncompletedItem(clickedTexts);
                if (!item) {
                    idleRounds++;
                    // Briefly wait in case React is still mounting expanded children
                    await waitFor(500);
                    continue;
                }
                idleRounds = 0;

                if (item.type === 'expand') {
                    chrome.runtime.sendMessage({
                        action: 'ac_progress',
                        message: `Expanding: ${item.text}`,
                    });
                    simulateClick(item.target);
                    const ok = await waitUntilExpanded(item.target);
                    if (!ok) {
                        // mark failed expand so we don't loop forever; try once more later via idle
                        console.warn('[NPTEL Assist] Expand may have failed:', item.text);
                    }
                    await waitFor(400);
                    continue;
                }

                // Lesson / activity
                clickedTexts.add(item.text);
                count++;
                chrome.runtime.sendMessage({
                    action: 'ac_progress',
                    message: `Opening (${count}): ${item.text}`,
                });

                simulateClick(item.target);
                const result = await waitAfterLessonClick(item.text);
                chrome.runtime.sendMessage({
                    action: 'ac_progress',
                    message: `Done (${result}): ${item.text}`,
                });
                await waitFor(800);
            }

            chrome.runtime.sendMessage({ action: 'ac_done', count });
        } catch (e) {
            chrome.runtime.sendMessage({ action: 'ac_error', error: e.message });
        } finally {
            globalThis.__nptelAssistRunning = false;
        }
    }

    function getNextUncompletedItem(clickedTexts) {
        const nav = document.querySelector('nav[aria-label="Course outline"]');
        if (nav) {
            // A. Expand collapsed UNIT sections only (aria-controls="unit-*-list")
            const unitToggles = Array.from(
                nav.querySelectorAll('button[aria-expanded][aria-controls^="unit-"]')
            );
            for (const btn of unitToggles) {
                if (btn.getAttribute('aria-expanded') !== 'false') continue;
                const text = getUnitTitle(btn);
                if (!text) continue;
                const key = 'EXPAND_' + text;
                if (clickedTexts.has(key)) continue;
                clickedTexts.add(key);
                return { target: btn, type: 'expand', text };
            }

            // B. Incomplete lessons inside expanded unit lists
            // Completed = lucide-circle-check / #24C246
            // Incomplete = lucide-circle (or any lesson without the green check)
            const lists = nav.querySelectorAll('[id^="unit-"][id$="-list"]');
            for (const list of lists) {
                const lessons = list.querySelectorAll(':scope > button');
                for (const btn of lessons) {
                    const text = getLessonLabel(btn);
                    if (!text || clickedTexts.has(text)) continue;
                    if (isLessonCompleted(btn)) continue;
                    return { target: btn, type: 'lesson', text };
                }
            }

            // Nothing left in this React outline
            return null;
        }

        // --- Legacy NPTEL layout fallback ---
        const svgs = Array.from(document.querySelectorAll('svg'));

        for (const svg of svgs) {
            const html = svg.outerHTML.toLowerCase();
            let isEmptyCircle = false;

            if (html.includes('radiobuttonunchecked') || html.includes('m12 2c6.48 2 2 6.48 2 12') || html.includes('c-4.42 0-8-3.58-8-8')) {
                isEmptyCircle = true;
            } else if (/<circle[^>]*r="([89]|1[0-9])"/.test(html)) {
                const hasGreen = /green|#10b981|#22c55e|#4caf50|success/.test(html);
                const hasCheck = /check|done|complete/.test(html);
                const hasPolyline = html.includes('<polyline') || html.includes('<path');

                if (!hasGreen && !hasCheck && !hasPolyline) {
                    isEmptyCircle = true;
                }
            }

            if (isEmptyCircle) {
                const parent = svg.closest('button, a, li, [role="button"], [role="link"], div[class*="item"], div[class*="lesson"], div[class*="unit"]') || svg.parentElement;
                if (!parent) continue;

                const text = parent.textContent.trim();
                if (!text || clickedTexts.has(text) || /Manage Exam|My Bookmarks|Announcements|Course outline/i.test(text)) continue;

                const clickable = svg.closest('button, a, [role="button"], [role="link"]') || svg;
                return { target: clickable, type: 'lesson', text: text };
            }
        }

        const emptyIcons = Array.from(document.querySelectorAll('.fa-circle-o, .fa-circle-thin, [class*="empty-circle"]'));
        for (const icon of emptyIcons) {
            const parent = icon.closest('button, a, li, [role="button"], [role="link"], div[class*="item"], div[class*="lesson"]');
            if (parent) {
                const text = parent.textContent.trim();
                if (text && !clickedTexts.has(text) && !/Manage Exam|My Bookmarks/i.test(text)) {
                    return { target: icon.closest('button, a, [role="button"]') || icon, type: 'lesson', text: text };
                }
            }
        }

        return null;
    }

    // Expose for popup multi-frame checks via chrome.scripting.executeScript
    globalThis.__nptelAssist = {
        frameHasSidebar,
        simulateClick,
        markAnswers,
        extractQuestions,
        runAutoComplete,
    };

    function onMessage(request, _sender, sendResponse) {
        try {
            const api = globalThis.__nptelAssist;
            if (!api) {
                sendResponse({ success: false, error: 'NPTEL Assist API not ready' });
                return true;
            }

            if (request.action === 'mark_answers') {
                sendResponse(api.markAnswers(request.text));
            } else if (request.action === 'extract_questions') {
                Promise.resolve(api.extractQuestions())
                    .then(result => sendResponse(result))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            } else if (request.action === 'start_autocomplete') {
                if (api.frameHasSidebar()) {
                    api.runAutoComplete().catch(e => {
                        chrome.runtime.sendMessage({ action: 'ac_error', error: e.message });
                    });
                    sendResponse({ success: true, started: true, frameUrl: location.href });
                } else {
                    sendResponse({ success: true, started: false, frameUrl: location.href });
                }
            }
        } catch (err) {
            console.error('[NPTEL Assist] Error:', err);
            sendResponse({ success: false, error: err.message });
        }
        return true;
    }

    globalThis.__nptelAssistOnMessage = onMessage;
    chrome.runtime.onMessage.addListener(onMessage);
    globalThis.__nptelAssistVersion = SCRIPT_VERSION;

})();
