# Jev Reader

A private browser-extension prototype for simple word explanations while reading.

## Current status

The extension shell, local API-key settings, article extraction, underlines, and light/dark word popups are implemented. The analysis provider is not connected yet. Clicking Analyze currently reports that analysis is unavailable. Browser verification uses synthetic explanations and does not establish live Jev analysis or compatibility with live X articles, pulkit.page, or pulkit.blog.

Jev's current API selects typed answers from supplied choices; it does not generate definition text or example sentences. The remaining product decision is whether to bundle a finite vocabulary library for Jev to select from, or use an additional text-generation provider for broader vocabulary. No substitute provider has been configured.

## Development

Requires Node.js 22 or newer.

```sh
npm ci
npx playwright install chromium
npm run check
```

Load `dist/extension` through **Load unpacked** on Chrome's or Edge's extensions page with Developer mode enabled. The API key can be saved, replaced, and removed inside the extension. An empty key field preserves the existing key when saving other settings.

## Implemented behavior

- API-key storage in local extension storage, restricted to trusted extension contexts and excluded from browser sync.
- Beginner/intermediate reading preference. The extension and word popups follow the system light/dark theme automatically, including changes while open.
- Article extraction that skips forms, editable content, code, navigation, and hidden text.
- Text ranges and visual underlines without replacing the site's text nodes.
- Shadow DOM styles and a top-layer popover containing a meaning, example sentence, and simple explanation of the example.
- Hover and click interaction, Escape dismissal, a word list in the extension, and clearing of underlines.
- Chunked progress, stale-text cleanup, and explicit reanalysis for newly loaded content.

## Limits

Built-in browser pages, browser PDF viewers, text inside images, embedded frames, and closed shadow roots are unsupported. Only currently loaded article text can be extracted. Pages over 250,000 readable characters are rejected explicitly. Unusual transforms, moving content, or websites that remove injected elements may require further adaptation. Support for all websites is not guaranteed.

## Verification

`npm test` verifies safe settings serialization and key-preservation behavior. `npm run test:browser` installs the extension in an isolated Chromium profile, checks saving/removing a synthetic API key, and tests the page UI with a synthetic article and mocked explanations. It checks that article markup remains intact, excluded content is skipped, stale annotations disappear, and clearing works. Light/dark screenshots are saved locally under ignored `artifacts/`.
