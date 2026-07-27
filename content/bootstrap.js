// Content-script orchestration — public API + message router.
// Must load last among content/* scripts.
(function (N) {
    'use strict';

    const SCRIPT_VERSION = 25;

    // Re-inject after extension update: drop old listener, keep one active copy
    if (globalThis.__nptelAssistOnMessage) {
        try {
            chrome.runtime.onMessage.removeListener(globalThis.__nptelAssistOnMessage);
        } catch (_) { /* ignore */ }
    }

    globalThis.__nptelAssist = {
        frameHasSidebar: N.frameHasSidebar,
        simulateClick: N.simulateClick,
        markAnswers: N.markAnswers,
        extractQuestions: N.extractQuestions,
        runAutoComplete: N.runAutoComplete,
    };

    function onMessage(request, _sender, sendResponse) {
        try {
            const api = globalThis.__nptelAssist;
            if (!api) {
                sendResponse({ success: false, error: 'NPTEL Assist API not ready' });
                return true;
            }

            if (request.action === 'mark_answers') {
                sendResponse(api.markAnswers(request.text));
            } else if (request.action === 'extract_questions') {
                Promise.resolve(api.extractQuestions())
                    .then(result => sendResponse(result))
                    .catch(err => sendResponse({ success: false, error: err.message }));
                return true;
            } else if (request.action === 'start_autocomplete') {
                if (api.frameHasSidebar()) {
                    api.runAutoComplete().catch(e => {
                        chrome.runtime.sendMessage({ action: 'ac_error', error: e.message });
                    });
                    sendResponse({ success: true, started: true, frameUrl: location.href });
                } else {
                    sendResponse({ success: true, started: false, frameUrl: location.href });
                }
            }
        } catch (err) {
            console.error('[NPTEL Assist] Error:', err);
            sendResponse({ success: false, error: err.message });
        }
        return true;
    }

    globalThis.__nptelAssistOnMessage = onMessage;
    chrome.runtime.onMessage.addListener(onMessage);
    globalThis.__nptelAssistVersion = SCRIPT_VERSION;
})(globalThis.__nptelAssistNS);
