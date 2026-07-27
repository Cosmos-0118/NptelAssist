// Shared namespace for content-script modules (classic scripts, load-order dependent).
// Re-injection overwrites properties safely without redeclare errors.
globalThis.__nptelAssistNS = globalThis.__nptelAssistNS || {};
