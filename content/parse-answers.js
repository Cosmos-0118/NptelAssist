// Parse pasted AI / numbered answer text into structured results.
(function (N) {
    'use strict';

    N.parseInputText = function parseInputText(text) {
        const results = [];
        const blocks = text.split(/(?=^\s*\d+[\.\)]\s)/m);

        for (const block of blocks) {
            const trimmed = block.trim();
            if (!trimmed) continue;

            const numMatch = trimmed.match(/^\s*(\d+)[\.\)]\s/);
            const questionNum = numMatch ? parseInt(numMatch[1], 10) : null;

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

            results.push({ questionNum, answersCleaned });
        }

        return results;
    };
})(globalThis.__nptelAssistNS);
