// ──────────────────────────────────────────────
//  popup.js — Handles UI events and communicates
//  with the content script on the active NPTEL tab.
// ──────────────────────────────────────────────

// ─── Tab Switching ───
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
});

// ─── Helpers ───
function showStatus(message, type) {
    const el = document.getElementById('status');
    el.textContent = message;
    el.className = 'status ' + type;
    if (type !== 'info') {
        setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 5000);
    }
}

async function getActiveNptelTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url || '';
    if (!tab || (!url.includes('nptel.ac.in') && !url.includes('swayam.gov.in'))) {
        throw new Error('Please navigate to an NPTEL / Swayam page first.');
    }
    return tab;
}

/** Ensure content.js is present in all frames (needed after extension reload). */
async function ensureContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content.js'],
        });
    } catch (e) {
        // Some cross-origin frames may reject injection; ignore those.
        console.warn('[NPTEL Assist] inject warning:', e.message);
    }
}

function sendToContent(tab, payload) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, payload, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error('Cannot reach the page. Reload the NPTEL tab and try again.'));
            } else {
                resolve(response);
            }
        });
    });
}

// ─── Mark Answers ───
document.getElementById('mark-btn').addEventListener('click', async () => {
    const text = document.getElementById('answers-input').value.trim();
    if (!text) {
        showStatus('Paste the answers first.', 'error');
        return;
    }

    const btn = document.getElementById('mark-btn');
    btn.classList.add('loading');
    showStatus('Marking answers…', 'info');

    try {
        const tab = await getActiveNptelTab();
        const response = await sendToContent(tab, { action: 'mark_answers', text });

        if (response && response.success) {
            const total = response.total;
            const marked = response.markedCount;
            const skipped = response.skipped || [];
            let msg = `Marked ${marked}/${total} answers.`;
            if (skipped.length > 0) {
                msg += ` Could not match Q${skipped.join(', Q')}.`;
            }
            showStatus(msg, marked === total ? 'success' : 'info');
        } else {
            showStatus(response?.error || 'Unknown error.', 'error');
        }
    } catch (err) {
        showStatus(err.message, 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

// ─── Extract Questions ───
document.getElementById('extract-btn').addEventListener('click', async () => {
    const btn = document.getElementById('extract-btn');
    btn.classList.add('loading');
    showStatus('Extracting questions…', 'info');

    try {
        const tab = await getActiveNptelTab();
        await ensureContentScript(tab.id);
        const response = await sendToContent(tab, { action: 'extract_questions' });

        if (response && response.success) {
            const preview = document.getElementById('copy-preview');
            preview.textContent = response.text;
            preview.classList.remove('preview-placeholder');
            document.getElementById('copy-btn').disabled = false;

            let downloadMsg = '';
            if (response.images && response.images.length > 0) {
                showStatus(`Saving ${response.images.length} image(s)…`, 'info');
                const result = await downloadImages(response.folderName, response.images);
                downloadMsg = result.ok > 0
                    ? ` Saved ${result.ok} image(s) to Downloads/${response.folderName}/.`
                    : ' (image download failed — check permissions.)';
                if (result.failed > 0) {
                    downloadMsg += ` ${result.failed} failed.`;
                }
            } else if (response.imageFound > 0) {
                downloadMsg = ' (found images but could not prepare downloads.)';
            }

            showStatus(`Extracted ${response.count} questions.${downloadMsg}`, 'success');
        } else {
            showStatus(response?.error || 'Could not extract questions.', 'error');
        }
    } catch (err) {
        showStatus(err.message, 'error');
    } finally {
        btn.classList.remove('loading');
    }
});

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
                // Give Chrome a moment to start the download before revoking
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

// ─── Copy to Clipboard ───
document.getElementById('copy-btn').addEventListener('click', async () => {
    const text = document.getElementById('copy-preview').textContent;
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        showStatus('Copied to clipboard!', 'success');
    } catch {
        // Fallback for older browsers
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showStatus('Copied to clipboard!', 'success');
    }
});

// ─── Auto-Complete ───
document.getElementById('autocomplete-btn').addEventListener('click', async () => {
    const btn = document.getElementById('autocomplete-btn');
    btn.classList.add('loading');
    document.getElementById('autocomplete-progress').style.display = 'block';
    showStatus('Starting auto-complete...', 'info');

    try {
        const tab = await getActiveNptelTab();
        await ensureContentScript(tab.id);

        let hasFinished = false;
        let startedInFrame = false;

        // Listen for progress from any frame
        const listener = (msg, sender) => {
            if (sender.tab && sender.tab.id !== tab.id) return;

            if (msg.action === 'ac_progress') {
                document.getElementById('autocomplete-status').textContent = msg.message;
                showStatus(msg.message, 'info');
            } else if (msg.action === 'ac_done') {
                hasFinished = true;
                document.getElementById('autocomplete-status').textContent = `Finished! (${msg.count} completed)`;
                if (msg.count > 0) {
                    showStatus(`Successfully completed ${msg.count} items!`, 'success');
                } else {
                    showStatus('No uncompleted items found.', 'success');
                }
                btn.classList.remove('loading');
                chrome.runtime.onMessage.removeListener(listener);
            } else if (msg.action === 'ac_error') {
                hasFinished = true;
                showStatus(msg.error, 'error');
                btn.classList.remove('loading');
                chrome.runtime.onMessage.removeListener(listener);
            }
        };
        chrome.runtime.onMessage.addListener(listener);

        // Run in every frame; content script only starts where sidebar exists
        const frameResults = await chrome.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            func: () => {
                if (!globalThis.__nptelAssist) {
                    return { started: false, reason: 'content_script_missing', frameUrl: location.href };
                }
                if (!globalThis.__nptelAssist.frameHasSidebar()) {
                    return { started: false, reason: 'no_sidebar', frameUrl: location.href };
                }
                // Kick off via message path's shared functions
                return { started: true, frameUrl: location.href, deferToMessage: true };
            },
        });

        // Broadcast start to all frames (content script filters to sidebar frames)
        chrome.tabs.sendMessage(tab.id, { action: 'start_autocomplete' }, () => {
            void chrome.runtime.lastError;
        });

        if (frameResults && frameResults.some(r => r.result && r.result.started)) {
            startedInFrame = true;
        }

        // Failsafe timeout in case no frame has the sidebar
        setTimeout(() => {
            if (!hasFinished && btn.classList.contains('loading')) {
                const status = document.getElementById('autocomplete-status').textContent;
                if (!status.includes('Opening') && !status.includes('Expanding') && !status.includes('Started') && !status.includes('Done')) {
                    const urls = (frameResults || []).map(r => r.result?.frameUrl || '?').join('\n');
                    showStatus(
                        startedInFrame
                            ? 'Sidebar found but no progress yet — leave the popup open a bit longer.'
                            : `Could not find sidebar in any frame.\n${urls}`,
                        'error'
                    );
                    btn.classList.remove('loading');
                    chrome.runtime.onMessage.removeListener(listener);
                }
            }
        }, 5000);

    } catch (err) {
        showStatus(err.message, 'error');
        btn.classList.remove('loading');
    }
});
