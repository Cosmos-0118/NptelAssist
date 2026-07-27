// Popup UI orchestration — tabs, mark / extract / autocomplete actions.
(function () {
    'use strict';

    const {
        showStatus,
        getActiveNptelTab,
        ensureContentScript,
        sendToContent,
        downloadImages,
    } = globalThis.NptelPopup;

    // ─── Tab Switching ───
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });

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
            await ensureContentScript(tab.id);
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

    // ─── Copy to Clipboard ───
    document.getElementById('copy-btn').addEventListener('click', async () => {
        const text = document.getElementById('copy-preview').textContent;
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            showStatus('Copied to clipboard!', 'success');
        } catch {
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

            const frameResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id, allFrames: true },
                func: () => {
                    if (!globalThis.__nptelAssist) {
                        return { started: false, reason: 'content_script_missing', frameUrl: location.href };
                    }
                    if (!globalThis.__nptelAssist.frameHasSidebar()) {
                        return { started: false, reason: 'no_sidebar', frameUrl: location.href };
                    }
                    return { started: true, frameUrl: location.href, deferToMessage: true };
                },
            });

            chrome.tabs.sendMessage(tab.id, { action: 'start_autocomplete' }, () => {
                void chrome.runtime.lastError;
            });

            if (frameResults && frameResults.some(r => r.result && r.result.started)) {
                startedInFrame = true;
            }

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

    // ─── Legal pages ───
    function openExtensionPage(path) {
        const url = chrome.runtime.getURL(path);
        chrome.tabs.create({ url });
    }

    document.getElementById('privacy-btn').addEventListener('click', () => {
        openExtensionPage('pages/privacy.html');
    });

    document.getElementById('terms-btn').addEventListener('click', () => {
        openExtensionPage('pages/terms.html');
    });
})();
