// Answer ↔ option matching engine.
(function (N) {
    'use strict';

    /**
     * Match a parsed answer string against options of a question group.
     * Returns matched input elements (may be multiple for compound answers).
     */
    N.findBestMatch = function findBestMatch(answerCleaned, group) {
        const options = group.inputs.map(input => {
            const label = group.getOptionLabel(input);
            return {
                input,
                label,
                normalized: N.normalize(label),
                strict: N.normalizeStrict(label),
            };
        });

        const bestSingle = matchSingle(answerCleaned, options);
        if (bestSingle.length > 0) return bestSingle;

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
    };

    function matchSingle(answer, options) {
        const aNorm = N.normalize(answer);
        const aStrict = N.normalizeStrict(answer);
        const aNum = N.parseNumeric(answer.trim());

        for (const opt of options) {
            if (opt.normalized === aNorm || opt.strict === aStrict) {
                return [opt.input];
            }
        }

        if (aNum !== null) {
            for (const opt of options) {
                const optNum = N.parseNumeric(opt.label.trim());
                if (optNum !== null && Math.abs(optNum - aNum) < 1e-6) {
                    return [opt.input];
                }
                const numsInLabel = opt.label.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g);
                if (numsInLabel) {
                    for (const numStr of numsInLabel) {
                        const parsed = N.parseNumeric(numStr);
                        if (parsed !== null && Math.abs(parsed - aNum) < 1e-6) {
                            return [opt.input];
                        }
                    }
                }
            }
        }

        for (const opt of options) {
            if (opt.strict.length < 1) continue;
            if (opt.strict.includes(aStrict) || aStrict.includes(opt.strict)) {
                return [opt.input];
            }
        }

        for (const opt of options) {
            if (opt.normalized.length < 1) continue;
            if (opt.normalized.includes(aNorm) || aNorm.includes(opt.normalized)) {
                return [opt.input];
            }
        }

        let bestScore = 0;
        let bestOpt = null;
        for (const opt of options) {
            const score = N.tokenSimilarity(answer, opt.label);
            if (score > bestScore) {
                bestScore = score;
                bestOpt = opt;
            }
        }
        if (bestScore >= 0.6 && bestOpt) {
            return [bestOpt.input];
        }

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
     * Split compound answers by commas without breaking balanced math expressions.
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

    N.smartSplit = smartSplit;
})(globalThis.__nptelAssistNS);
