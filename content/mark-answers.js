// Mark answers on the page from parsed paste text.
(function (N) {
    'use strict';

    N.markAnswers = function markAnswers(text) {
        const parsed = N.parseInputText(text);
        console.log('[NPTEL Assist] Parsed answers:', parsed);

        if (parsed.length === 0) {
            return {
                success: false,
                error: 'Could not parse any answers. Use the format:\n1. Question\nAnswer: value',
            };
        }

        const groups = N.discoverQuestionGroups();
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

            let group = null;
            if (questionNum !== null && questionNum >= 1 && questionNum <= groups.length) {
                group = groups[questionNum - 1];
            } else if (i < groups.length) {
                group = groups[i];
            }

            if (!group) {
                skipped.push(questionNum || (i + 1));
                console.warn(`[NPTEL Assist] Q${questionNum || i + 1}: No matching question group on page.`);
                continue;
            }

            let matchedAny = false;

            for (const answerCleaned of answersCleaned) {
                const matchedInputs = N.findBestMatch(answerCleaned, group);

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
    };
})(globalThis.__nptelAssistNS);
