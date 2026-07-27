// Chrome tab / content-script bridge used by the popup.
(function (global) {
    'use strict';

    /** Ordered content-script bundle — keep in sync with manifest.json */
    const CONTENT_SCRIPT_FILES = [
        'content/ns.js',
        'content/text.js',
        'content/parse-answers.js',
        'content/images.js',
        'content/discover.js',
        'content/match.js',
        'content/mark-answers.js',
        'content/extract-questions.js',
        'content/autocomplete.js',
        'content/bootstrap.js',
    ];

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

    /** Ensure content scripts are present in all frames (needed after extension reload). */
    async function ensureContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId, allFrames: true },
                files: CONTENT_SCRIPT_FILES,
            });
        } catch (e) {
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

    global.NptelPopup = {
        CONTENT_SCRIPT_FILES,
        showStatus,
        getActiveNptelTab,
        ensureContentScript,
        sendToContent,
    };
})(globalThis);
