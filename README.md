# NPTEL Assist

<p align="center">
  <img src="icons/icon.png" alt="NPTEL Assist" width="96" height="96">
</p>

<p align="center">
  A Chrome extension for <a href="https://nptel.ac.in">NPTEL</a> / <a href="https://swayam.gov.in">Swayam</a> that matches user-provided answers to available options, extracts questions for review, and navigates incomplete course items.
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#how-to-use">How to Use</a> ·
  <a href="#privacy--legal">Privacy & Legal</a>
</p>

<p align="center">
  <img src="assets/popup-preview.png" alt="NPTEL Assist popup preview" width="560">
</p>

## Install

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this project folder
5. Open an NPTEL/Swayam page and click the extension icon

## How to Use
- **Copy Questions:** extract questions/options; images save to `Downloads/`
- **Match Answers:** paste numbered answers; matches them to available options on the page
- **Review Incomplete:** navigates incomplete course outline items for faster review

Answer input format:

```text
1. (optional question text)
Answer: exact option text

2.
Answer: option one
Answer: option two
```

## Privacy & Legal

Hosted on GitHub Pages (also bundled in the extension under `pages/`):

- [Privacy Policy](https://cosmos-0118.github.io/NptelAssist/pages/privacy.html)
- [Terms of Service](https://cosmos-0118.github.io/NptelAssist/pages/terms.html)
- [Legal index](https://cosmos-0118.github.io/NptelAssist/pages/)

## Permissions

- `activeTab`, `scripting` — interact with the current NPTEL/Swayam tab
- `downloads` — save extracted images
- Host access — `*.nptel.ac.in`, `*.swayam.gov.in`, `storage.googleapis.com`
