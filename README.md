# Jev Reader

A private browser-extension prototype for simple word explanations while reading.

## Current status

Click **Analyze this page** to read the loaded article, ask Jev which supported words need help, and underline the selected words. Hover or click a word for its meaning, a short example, and the example explained in simple words.

The analysis uses Jev through TypeSafe with 191 prepared meanings and their word forms. Jev selects the contextual sense or skips a word that is easy, uncertain, or unsupported. Definitions and examples come from the bundled vocabulary library. Words outside that library cannot be explained yet. No additional model or dictionary service is used.

The API key stays in local extension storage. Only nearby reading excerpts and the candidate meanings are sent directly to TypeSafe when you click Analyze. Requests can incur TypeSafe usage charges. Clearing the page stops further analysis and cancels the active request where possible.

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
- Hover and click interaction, Escape dismissal, stopping analysis, and clearing of underlines.
- A compact progress panel with loading skeletons, analysis stages, completed sections, checked words, underlined words, and elapsed time. Timing survives reopening the popup and freezes when the run completes, fails, or stops. Skeleton animation respects reduced-motion preferences.
- Stale-text cleanup and explicit reanalysis for newly loaded content.

## Limits

Built-in browser pages, browser PDF viewers, text inside images, embedded frames, and closed shadow roots are unsupported. Only currently loaded article text can be extracted. Pages over 250,000 readable characters are rejected explicitly. Unusual transforms, moving content, or websites that remove injected elements may require further adaptation. Support for all websites is not guaranteed.

## Verification

`npm test` verifies candidate extraction, contextual sense selection, response validation, request batching, cancellation, error handling, vocabulary completeness, and safe settings behavior. `npm run test:browser` installs the extension in an isolated Chromium profile, checks saving/removing a synthetic API key, and tests the page UI with a synthetic article and mocked explanations. It checks that article markup remains intact, excluded content is skipped, stale annotations disappear, and clearing works. Light/dark screenshots are saved locally under ignored `artifacts/`.

`npm run test:integration` exercises the real popup, content script, background worker, TypeSafe request path, and hover explanation. Only the remote API response is mocked. Its isolated test copy of the manifest grants access to `reader.test` so automation can exercise injection without a manual extension-toolbar click; the shipped manifest retains click-to-access permissions. The test also checks an invalid-key response leaves the article free of blank cards.

For a live integration check with a synthetic article, set `TYPESAFE_API_KEY` locally and run `READER_LIVE_TEST=1 npm run test:integration`. The temporary browser profile is removed afterward. Live Jev verification has completed successfully for the installed extension and for a separate five-word request. Live site compatibility with X articles, pulkit.page, and pulkit.blog has not yet been established.

After updating, reload Jev Reader at `chrome://extensions` and refresh previously analyzed article tabs to discard old injected scripts.
