// Text normalization and similarity scoring.
(function (N) {
    'use strict';

    /**
     * Deep-normalize a string for comparison:
     *  - lowercase
     *  - collapse whitespace
     *  - strip common punctuation noise
     *  - normalize unicode dashes/quotes
     */
    N.normalize = function normalize(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    };

    /**
     * Aggressive normalization — strips ALL whitespace and
     * common surrounding punctuation for tighter matching.
     */
    N.normalizeStrict = function normalizeStrict(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
            .replace(/[\u2013\u2014]/g, '-')
            .replace(/\s+/g, '')
            .replace(/^[a-z][\.\)]\s*/i, '')
            .replace(/[,;:]+$/, '');
    };

    /**
     * Extract a clean numeric value from a string if possible.
     * Returns null when the string is not a simple number.
     */
    N.parseNumeric = function parseNumeric(s) {
        const cleaned = s.replace(/\s/g, '');
        const fracMatch = cleaned.match(/^(-?\d+)\/(\d+)$/);
        if (fracMatch) return parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
        return null;
    };

    /**
     * Similarity score (0–1) using token overlap (Sørensen–Dice).
     */
    N.tokenSimilarity = function tokenSimilarity(a, b) {
        const tokA = new Set(N.normalize(a).split(/\s+/).filter(Boolean));
        const tokB = new Set(N.normalize(b).split(/\s+/).filter(Boolean));
        if (tokA.size === 0 && tokB.size === 0) return 1;
        if (tokA.size === 0 || tokB.size === 0) return 0;
        let overlap = 0;
        for (const t of tokA) if (tokB.has(t)) overlap++;
        return (2 * overlap) / (tokA.size + tokB.size);
    };
})(globalThis.__nptelAssistNS);
