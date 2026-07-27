// DOM discovery — find question groups and option labels on NPTEL pages.
(function (N) {
    'use strict';

    /**
     * Discover all question groups on the page.
     * Returns: [{ index, questionEl, inputs, getOptionLabel }, ...]
     */
    N.discoverQuestionGroups = function discoverQuestionGroups() {
        let groups = tryMoodleSelectors();
        if (groups.length > 0) return groups;

        groups = tryGroupByName();
        if (groups.length > 0) return groups;

        return tryFlatInputs();
    };

    function tryMoodleSelectors() {
        const questions = document.querySelectorAll('.que, .question, [id^="question-"]');
        if (questions.length === 0) return [];

        return Array.from(questions).map((el, i) => {
            const inputs = Array.from(el.querySelectorAll('input[type="radio"], input[type="checkbox"]'));
            return { index: i, questionEl: el, inputs, getOptionLabel: N.getLabelForInput };
        }).filter(g => g.inputs.length > 0);
    }

    function tryGroupByName() {
        const allInputs = Array.from(
            document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
        );
        if (allInputs.length === 0) return [];

        const map = new Map();
        for (const input of allInputs) {
            const name = input.name || input.getAttribute('name');
            if (!name) continue;
            if (!map.has(name)) map.set(name, []);
            map.get(name).push(input);
        }

        let idx = 0;
        const groups = [];
        for (const [, inputs] of map) {
            if (inputs.length < 2) continue;
            groups.push({
                index: idx++,
                questionEl: inputs[0].closest('div, fieldset, form, section') || document.body,
                inputs,
                getOptionLabel: N.getLabelForInput,
            });
        }
        return groups;
    }

    function tryFlatInputs() {
        const allInputs = Array.from(
            document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
        );
        if (allInputs.length === 0) return [];
        return [{
            index: 0,
            questionEl: document.body,
            inputs: allInputs,
            getOptionLabel: N.getLabelForInput,
        }];
    }

    /**
     * Extract the visible label text for a radio/checkbox input.
     * @param {HTMLInputElement} input
     * @param {{ imageSession?: object, baseName?: string }} [opts]
     */
    N.getLabelForInput = function getLabelForInput(input, opts) {
        const parentLabel = input.closest('label');
        if (parentLabel) {
            return N.extractTextWithImages(parentLabel, input, opts);
        }

        if (input.id) {
            const labelFor = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
            if (labelFor) return N.extractTextWithImages(labelFor, null, opts);
        }

        if (input.nextSibling && input.nextSibling.nodeType === Node.TEXT_NODE) {
            const txt = input.nextSibling.textContent.trim();
            if (txt.length > 0) return txt;
        }

        if (input.nextElementSibling) {
            return N.extractTextWithImages(input.nextElementSibling, null, opts);
        }

        if (input.parentElement) {
            const clone = input.parentElement.cloneNode(true);
            clone.querySelectorAll('input').forEach(el => el.remove());
            return clone.textContent.trim();
        }

        return '';
    };
})(globalThis.__nptelAssistNS);
