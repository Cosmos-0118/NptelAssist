// Image URL helpers and extract-session tracking for downloads.
(function (N) {
    'use strict';

    N.absolutizeUrl = function absolutizeUrl(src) {
        if (!src) return '';
        try {
            return src.startsWith('http') || src.startsWith('data:')
                ? src
                : new URL(src, window.location.href).href;
        } catch (_) {
            return src;
        }
    };

    N.extFromUrl = function extFromUrl(url) {
        try {
            const path = new URL(url, window.location.href).pathname;
            const m = path.match(/\.(png|jpe?g|gif|webp|svg|bmp)(?:$|\?)/i);
            if (m) {
                const e = m[1].toLowerCase();
                return e === 'jpeg' ? 'jpg' : e;
            }
        } catch (_) { /* ignore */ }
        return 'png';
    };

    N.makeFolderName = function makeFolderName() {
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
    };

    /**
     * Tracks images found during extract, assigns stable filenames,
     * and later lists them for popup download.
     */
    N.createImageSession = function createImageSession(folderName) {
        const bySrc = new Map();
        const counters = new Map();

        function register(src, baseName) {
            const fullSrc = N.absolutizeUrl(src);
            if (!fullSrc || fullSrc.startsWith('data:')) {
                if (fullSrc && fullSrc.startsWith('data:') && !bySrc.has(fullSrc)) {
                    const name = nextName(baseName, 'png');
                    bySrc.set(fullSrc, { name, src: fullSrc });
                    return name;
                }
                return null;
            }
            if (bySrc.has(fullSrc)) return bySrc.get(fullSrc).name;
            const name = nextName(baseName, N.extFromUrl(fullSrc));
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
    };

    /**
     * Get text from an element, replacing <img> with downloadable filename markers.
     */
    N.extractTextWithImages = function extractTextWithImages(el, excludeChild, opts) {
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
                const fullSrc = N.absolutizeUrl(src);
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
    };
})(globalThis.__nptelAssistNS);
