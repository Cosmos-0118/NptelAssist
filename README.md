# NPTEL Assist

Chrome extension for [NPTEL](https://nptel.ac.in) / [Swayam](https://swayam.gov.in) — mark assignment answers, copy questions for AI, and auto-complete sidebar lessons.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder
4. Open an NPTEL/Swayam page, then click the extension icon

Reload the extension after pulling code changes.

## Features

| Tab | What it does |
|-----|----------------|
| **Mark Answers** | Paste numbered answers → matches and selects options on the page |
| **Copy Questions** | Extracts questions/options (with AI format instructions); saves images to `Downloads/` |
| **Auto-Complete** | Clicks through incomplete items in the course outline sidebar |

Stay on the NPTEL tab while Auto-Complete runs (leave the popup open).

## Answer format

```
1. Question text (optional)
Answer: exact option text

2.
Answer: option one
Answer: option two
```

- One `Answer:` line per correct option (multi-select)
- Optional notes after an em dash: `Answer: 0.803 — reason`
- Option text should match the page as closely as possible

## Project layout

```
manifest.json
content/     page logic (discover, match, mark, extract, autocomplete)
popup/       UI + Chrome bridge + image downloads
```

No build step — load as-is.

## Permissions

- `activeTab` / `scripting` — talk to the open NPTEL/Swayam tab
- `downloads` — save extracted question images
- Host access — `*.nptel.ac.in`, `*.swayam.gov.in`, `storage.googleapis.com`
