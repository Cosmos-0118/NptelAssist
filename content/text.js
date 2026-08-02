// Text normalization and similarity scoring.
(function (N) {
    'use strict';

    /** Unicode minus / dash variants → ASCII hyphen-minus. */
    const DASH_RE = /[\u2013\u2014\u2212\uFE63\uFF0D]/g;

    function normalizeDashesAndQuotes(text) {
        return text
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
            .replace(DASH_RE, '-');
    }

    /**
     * Deep-normalize a string for comparison:
     *  - lowercase
     *  - collapse whitespace
     *  - strip common punctuation noise
     *  - normalize unicode dashes/quotes/minus
     */
    N.normalize = function normalize(text) {
        if (!text) return '';
        return normalizeDashesAndQuotes(text)
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    };

    /**
     * Aggressive normalization — strips ALL whitespace and
     * common surrounding punctuation for tighter matching.
     */
    N.normalizeStrict = function normalizeStrict(text) {
        if (!text) return '';
        return normalizeDashesAndQuotes(text)
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/,/g, '')
            .replace(/^[a-z][\.\)]\s*/i, '')
            .replace(/[,;:]+$/, '');
    };

    /**
     * Extract a clean numeric value from a string if possible.
     * Returns null when the string is not a simple number.
     */
    N.parseNumeric = function parseNumeric(s) {
        const cleaned = normalizeDashesAndQuotes(s).replace(/\s/g, '');
        const fracMatch = cleaned.match(/^(-?\d+)\/(\d+)$/);
        if (fracMatch) return parseFloat(fracMatch[1]) / parseFloat(fracMatch[2]);
        if (/^-?\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
        return null;
    };

    /**
     * Pull all numeric values from a string (after dash normalization).
     * Handles glued matrices like "[-6.28140.6100-4.3143...]" by scanning
     * for optional-sign + digits with optional fractional part.
     */
    N.extractNumbers = function extractNumbers(text) {
        if (!text) return [];
        const cleaned = normalizeDashesAndQuotes(String(text));
        const nums = [];
        const re = /-?\d+(?:\.\d+)?/g;
        let m;
        while ((m = re.exec(cleaned)) !== null) {
            const v = parseFloat(m[0]);
            if (!Number.isNaN(v)) nums.push(v);
        }
        return nums;
    };

    /**
     * Compare two number arrays with absolute tolerance.
     * Requires same length; empty arrays are not equal.
     */
    N.numbersEqual = function numbersEqual(a, b, tol) {
        if (!a || !b || a.length === 0 || b.length === 0) return false;
        if (a.length !== b.length) return false;
        const t = tol == null ? 1e-4 : tol;
        for (let i = 0; i < a.length; i++) {
            if (Math.abs(a[i] - b[i]) > t) return false;
        }
        return true;
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
