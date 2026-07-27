// Image download IO — fetch + chrome.downloads from the popup context.
(function (global) {
    'use strict';

    /**
     * Save extracted images under Downloads/<folderName>/.
     * Fetches from the popup (extension host permissions bypass page CORS),
     * then downloads the blob. Falls back to the raw URL if fetch fails.
     */
    async function downloadImages(folderName, images) {
        const safeFolder = String(folderName || 'NPTEL-Assist')
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/\.+$/g, '');
        let ok = 0;
        let failed = 0;

        for (const img of images) {
            if (!img.name || (!img.src && !img.dataUrl)) {
                failed++;
                continue;
            }
            const safeName = String(img.name).replace(/[\\/:*?"<>|]+/g, '-');
            const resolved = await resolveImageDownloadUrl(img);
            if (!resolved) {
                failed++;
                continue;
            }
            try {
                await chrome.downloads.download({
                    url: resolved.url,
                    filename: `${safeFolder}/${safeName}`,
                    saveAs: false,
                    conflictAction: 'uniquify',
                });
                ok++;
            } catch (err) {
                console.warn('[NPTEL Assist] download failed:', img.name, err);
                failed++;
            } finally {
                if (resolved.revoke) {
                    setTimeout(resolved.revoke, 60_000);
                }
            }
        }

        return { ok, failed };
    }

    async function resolveImageDownloadUrl(img) {
        if (img.dataUrl) return { url: img.dataUrl, revoke: null };
        if (!img.src) return null;
        if (img.src.startsWith('data:') || img.src.startsWith('blob:')) {
            return { url: img.src, revoke: null };
        }

        try {
            const res = await fetch(img.src, { credentials: 'include', cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            return { url: objectUrl, revoke: () => URL.revokeObjectURL(objectUrl) };
        } catch (err) {
            console.warn('[NPTEL Assist] popup fetch failed, downloading by URL:', img.src, err);
            return { url: img.src, revoke: null };
        }
    }

    global.NptelPopup = Object.assign(global.NptelPopup || {}, {
        downloadImages,
        resolveImageDownloadUrl,
    });
})(globalThis);
