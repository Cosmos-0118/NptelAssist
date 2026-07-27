// Auto-complete — walk course outline sidebar and open incomplete lessons.
(function (N) {
    'use strict';

    N.frameHasSidebar = function frameHasSidebar() {
        if (document.querySelector('nav[aria-label="Course outline"]')) return true;
        if (document.querySelector('.outline-item, .fa-circle-o, .fa-circle-thin')) return true;
        const bodyText = (document.body && document.body.innerText) || '';
        if (/Week\s*\d+/i.test(bodyText) && document.querySelector('svg circle, svg')) return true;
        if (document.querySelector('[class*="sidebar"], [class*="outline"], aside')) {
            if (/Week\s*\d+/i.test(bodyText)) return true;
        }
        return false;
    };

    /**
     * Fire a single native click. Do NOT also dispatch a synthetic click —
     * React toggles (aria-expanded) would open then immediately close.
     */
    N.simulateClick = function simulateClick(el) {
        if (!el) throw new Error('simulateClick: no element');

        let target = el;
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'g' || tag === 'polyline') {
            const clickable = el.closest('button, a, [role="button"], [role="link"], [tabindex]');
            if (clickable) target = clickable;
        }

        try {
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } catch (_) { /* ignore */ }

        try {
            if (typeof target.focus === 'function') target.focus({ preventScroll: true });
        } catch (_) { /* ignore */ }

        if (typeof target.click === 'function') {
            target.click();
            return;
        }

        target.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
        }));
    };

    function isLessonCompleted(lessonBtn) {
        const svg = lessonBtn.querySelector('svg');
        if (!svg) return false;
        const cls = (svg.getAttribute('class') || '') + ' ' + svg.outerHTML;
        return /lucide-circle-check|circle-check|#24C246|#24c246/i.test(cls);
    }

    function getLessonLabel(lessonBtn) {
        const p = lessonBtn.querySelector('p');
        return (p?.textContent || lessonBtn.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function getUnitTitle(toggleBtn) {
        const h3 = toggleBtn.querySelector('h3');
        return (h3?.textContent || toggleBtn.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function waitFor(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    async function waitUntilExpanded(toggleBtn, timeoutMs = 2500) {
        const listId = toggleBtn.getAttribute('aria-controls');
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (toggleBtn.getAttribute('aria-expanded') === 'true') return true;
            if (listId && document.getElementById(listId)) {
                const list = document.getElementById(listId);
                if (list && list.children.length > 0) return true;
            }
            await waitFor(150);
        }
        return toggleBtn.getAttribute('aria-expanded') === 'true';
    }

    async function waitAfterLessonClick(lessonText, timeoutMs = 6000) {
        const start = Date.now();
        const startUrl = location.href;
        while (Date.now() - start < timeoutMs) {
            await waitFor(300);
            const nav = document.querySelector('nav[aria-label="Course outline"]');
            if (nav) {
                const buttons = nav.querySelectorAll('[id^="unit-"][id$="-list"] > button');
                for (const btn of buttons) {
                    if (getLessonLabel(btn) === lessonText && isLessonCompleted(btn)) {
                        return 'completed';
                    }
                }
            }
            if (location.href !== startUrl) {
                await waitFor(1500);
                return 'navigated';
            }
        }
        return 'timeout';
    }

    function getNextUncompletedItem(clickedTexts) {
        const nav = document.querySelector('nav[aria-label="Course outline"]');
        if (nav) {
            const unitToggles = Array.from(
                nav.querySelectorAll('button[aria-expanded][aria-controls^="unit-"]')
            );
            for (const btn of unitToggles) {
                if (btn.getAttribute('aria-expanded') !== 'false') continue;
                const text = getUnitTitle(btn);
                if (!text) continue;
                const key = 'EXPAND_' + text;
                if (clickedTexts.has(key)) continue;
                clickedTexts.add(key);
                return { target: btn, type: 'expand', text };
            }

            const lists = nav.querySelectorAll('[id^="unit-"][id$="-list"]');
            for (const list of lists) {
                const lessons = list.querySelectorAll(':scope > button');
                for (const btn of lessons) {
                    const text = getLessonLabel(btn);
                    if (!text || clickedTexts.has(text)) continue;
                    if (isLessonCompleted(btn)) continue;
                    return { target: btn, type: 'lesson', text };
                }
            }

            return null;
        }

        const svgs = Array.from(document.querySelectorAll('svg'));

        for (const svg of svgs) {
            const html = svg.outerHTML.toLowerCase();
            let isEmptyCircle = false;

            if (html.includes('radiobuttonunchecked') || html.includes('m12 2c6.48 2 2 6.48 2 12') || html.includes('c-4.42 0-8-3.58-8-8')) {
                isEmptyCircle = true;
            } else if (/<circle[^>]*r="([89]|1[0-9])"/.test(html)) {
                const hasGreen = /green|#10b981|#22c55e|#4caf50|success/.test(html);
                const hasCheck = /check|done|complete/.test(html);
                const hasPolyline = html.includes('<polyline') || html.includes('<path');

                if (!hasGreen && !hasCheck && !hasPolyline) {
                    isEmptyCircle = true;
                }
            }

            if (isEmptyCircle) {
                const parent = svg.closest('button, a, li, [role="button"], [role="link"], div[class*="item"], div[class*="lesson"], div[class*="unit"]') || svg.parentElement;
                if (!parent) continue;

                const text = parent.textContent.trim();
                if (!text || clickedTexts.has(text) || /Manage Exam|My Bookmarks|Announcements|Course outline/i.test(text)) continue;

                const clickable = svg.closest('button, a, [role="button"], [role="link"]') || svg;
                return { target: clickable, type: 'lesson', text: text };
            }
        }

        const emptyIcons = Array.from(document.querySelectorAll('.fa-circle-o, .fa-circle-thin, [class*="empty-circle"]'));
        for (const icon of emptyIcons) {
            const parent = icon.closest('button, a, li, [role="button"], [role="link"], div[class*="item"], div[class*="lesson"]');
            if (parent) {
                const text = parent.textContent.trim();
                if (text && !clickedTexts.has(text) && !/Manage Exam|My Bookmarks/i.test(text)) {
                    return { target: icon.closest('button, a, [role="button"]') || icon, type: 'lesson', text: text };
                }
            }
        }

        return null;
    }

    N.runAutoComplete = async function runAutoComplete() {
        if (globalThis.__nptelAssistRunning) {
            chrome.runtime.sendMessage({ action: 'ac_progress', message: 'Already running…' });
            return;
        }
        globalThis.__nptelAssistRunning = true;

        try {
            chrome.runtime.sendMessage({ action: 'ac_progress', message: 'Started…' });

            const clickedTexts = new Set();
            let count = 0;
            let idleRounds = 0;

            while (idleRounds < 3) {
                const item = getNextUncompletedItem(clickedTexts);
                if (!item) {
                    idleRounds++;
                    await waitFor(500);
                    continue;
                }
                idleRounds = 0;

                if (item.type === 'expand') {
                    chrome.runtime.sendMessage({
                        action: 'ac_progress',
                        message: `Expanding: ${item.text}`,
                    });
                    N.simulateClick(item.target);
                    const ok = await waitUntilExpanded(item.target);
                    if (!ok) {
                        console.warn('[NPTEL Assist] Expand may have failed:', item.text);
                    }
                    await waitFor(400);
                    continue;
                }

                clickedTexts.add(item.text);
                count++;
                chrome.runtime.sendMessage({
                    action: 'ac_progress',
                    message: `Opening (${count}): ${item.text}`,
                });

                N.simulateClick(item.target);
                const result = await waitAfterLessonClick(item.text);
                chrome.runtime.sendMessage({
                    action: 'ac_progress',
                    message: `Done (${result}): ${item.text}`,
                });
                await waitFor(800);
            }

            chrome.runtime.sendMessage({ action: 'ac_done', count });
        } catch (e) {
            chrome.runtime.sendMessage({ action: 'ac_error', error: e.message });
        } finally {
            globalThis.__nptelAssistRunning = false;
        }
    };
})(globalThis.__nptelAssistNS);
