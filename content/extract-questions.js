// Extract questions/options (and image markers) for AI paste format.
(function (N) {
    'use strict';

    N.extractQuestions = async function extractQuestions() {
        const groups = N.discoverQuestionGroups();

        if (groups.length === 0) {
            return {
                success: false,
                error: 'No questions found on this page.',
            };
        }

        const folderName = N.makeFolderName();
        const imageSession = N.createImageSession(folderName);
        const lines = [];

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

            const isMultiple = group.inputs.some(inp => inp.type === 'checkbox');
            const typeLabel = isMultiple ? 'MULTIPLE ANSWERS' : 'SINGLE ANSWER';
            const qOpts = { imageSession, baseName: `q${qNum}` };

            let questionText = '';
            const qtextEl = qEl.querySelector('.qtext, .question-text, .questiontext');
            if (qtextEl) {
                questionText = extractFullContent(qtextEl, qOpts);
            } else {
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
                    questionText = extractQuestionFromContainer(qEl, group.inputs, qOpts);
                }
            }

            questionText = questionText.trim() || '(Question text not found)';
            questionText = formatQuestionText(questionText);

            lines.push(`${qNum}. [${typeLabel}] ${questionText}`);

            group.inputs.forEach((input, j) => {
                const letter = String.fromCharCode(97 + j);
                const label = N.getLabelForInput(input, {
                    imageSession,
                    baseName: `q${qNum}-opt-${letter}`,
                });
                const formattedLabel = label.replace(/\s+/g, ' ').trim();
                lines.push(`   ${letter}) ${formattedLabel}`);
            });

            lines.push('');
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
    };

    function formatQuestionText(text) {
        let cleaned = text.trim();
        cleaned = cleaned.replace(/^(?:\s*(?:Q\s*)?\d+\s*[\.\)]\s*)+/i, '');
        cleaned = cleaned.replace(/[\s\n]*\d+\s*Points?[\s\n]*$/i, '');
        return cleaned.trim();
    }

    function extractFullContent(el, opts) {
        const clone = el.cloneNode(true);
        const session = opts && opts.imageSession;
        const baseName = (opts && opts.baseName) || 'img';

        clone.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            let marker;
            if (session && src) {
                marker = session.markerFor(src, baseName);
            } else if (src) {
                const fullSrc = N.absolutizeUrl(src);
                marker = ` [Image: ${fullSrc}] `;
            } else {
                marker = ' [Image] ';
            }
            img.replaceWith(document.createTextNode(marker));
        });

        clone.querySelectorAll('.MathJax, .katex').forEach(mathEl => {
            const script = mathEl.querySelector('script[type*="math"]');
            if (script) {
                mathEl.replaceWith(document.createTextNode(` $${script.textContent}$ `));
            }
        });

        clone.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6').forEach(block => {
            if (block.tagName.toLowerCase() === 'br') {
                block.replaceWith(document.createTextNode('\n'));
            } else {
                block.prepend(document.createTextNode('\n'));
                block.append(document.createTextNode('\n'));
            }
        });

        clone.querySelectorAll('[style*="display: none"], [style*="display:none"], .hidden').forEach(h => h.remove());

        let text = clone.textContent || '';
        text = text.replace(/[ \t]+/g, ' ');
        text = text.replace(/\n\s*\n+/g, '\n\n');
        text = text.replace(/\n /g, '\n');

        return text.trim();
    }

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
                const fullSrc = N.absolutizeUrl(src);
                img.replaceWith(document.createTextNode(`[Image: ${fullSrc}]`));
            }
        });

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
})(globalThis.__nptelAssistNS);
