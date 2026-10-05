# Working on Colear

## Project

Colear is a browser-only tool for picking, collecting, and highlighting colors
in images, especially lines in charts. It uses Vue 3, TypeScript, Vite, and
Tailwind CSS, with canvas image processing and localStorage preferences.
Image processing runs locally; there is no backend or account system.

## Repository map

- `src/components/ColorPicker.vue`: application state, image loading, canvas
  interaction, palette controls, keyboard shortcuts, and settings UI.
- `src/lib/colors.ts`: pure pixel/color functions for picking, clustering,
  background detection, palette matching, naming, and highlight rendering.
- `src/lib/settings.ts`: defaults, persisted settings schema, and validation.
- `src/index.css`: application layout, theme variables, and component styles.
- `src/App.vue` and `src/main.ts`: application shell and startup.
- `tests/colors.test.mjs`: Node test runner tests using synthetic pixel fixtures;
  TypeScript modules are transpiled with the project's TypeScript compiler.
- `public/image.webp`: demo image. Load public assets using Vite's base URL.
- `.github/workflows/deploy-pages.yml`: branch-specific checks and deployment.

## Setup and commands

Use npm and the committed `package-lock.json`. CI uses Node.js 22. To install
dependencies the same way as CI:

```sh
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0=url.https://github.com/.insteadOf \
GIT_CONFIG_VALUE_0=ssh://git@github.com/ \
npm ci --ignore-scripts --no-audit --no-fund
```

The Git override fetches the public `vuedraggable` dependency over HTTPS even
though its locked URL uses SSH. It applies only to this command. CI uses the
dependency's committed distribution files and skips dependency lifecycle scripts.

```sh
npm run dev       # Development server
npm test          # Color and settings tests
npm run build    # vue-tsc type checking followed by Vite production build
npm run preview  # Serve the built dist directory
git diff --check # Check patch whitespace
```

The default production preview URL is `http://localhost:4173/colear/`.
There is no configured lint script. Generated `dist/`, `node_modules/`, and
TypeScript build caches are ignored; do not commit them.

## Implementation guidance

- Keep pixel algorithms independent of Vue and DOM state in `src/lib/colors.ts`.
  Keep interaction and rendering coordination in the Vue component.
- Use Vue Composition API with `<script setup lang="ts">`. Respect strict
  TypeScript checks and follow the surrounding code's formatting.
- Preserve unrelated working-tree changes. Keep edits focused on the request;
  avoid dependency upgrades, broad reformatting, or new frameworks without need.
- Use existing CSS theme variables and preserve both light and dark modes.
  The palette belongs beside the image on desktop, with settings below;
  narrow layouts stack these sections.
- Keep labels and help text concise. Maintain accessible names, focus states,
  shortcut hints, and `aria-keyshortcuts` when changing controls. Letter
  shortcuts must not interrupt typing; Escape should still clear highlighting.

## Behavior to preserve

Unless the task explicitly changes these behaviors:

- Keep the original image pixels unchanged. Picking and the magnifier sample
  the source image, never the rendered highlight. Scaling changes display size,
  not source resolution; translate pointer coordinates accordingly.
- Use the same resolved smart-pick result for hover and clicking. Background
  under the cursor must not override a valid snapped foreground color.
- Exclude the configured background from every palette-addition path. Do not
  exclude text, black, or grayscale colors separately: text and lines may share
  a color. Empty-background clicks clear an active highlight.
- Match existing palette colors independently of their highlight ranges.
  Clicking a matching image color selects it; clicking that selected color
  again shows the original, including when the match comes from snapping.
- Clicking minus removes the selected palette entry immediately. Without a
  selection, minus toggles removal mode.
- Smart picking should favor supported source colors over antialiased edge
  shades or isolated noise. Bulk add should suppress edge shades while retaining
  genuine pale colors and thin features inside the selected rectangle.
- Highlight range belongs to each palette color and updates the overlay live.
  Preserve the steady, feathered outline and halo, its consistent display width,
  and the visibility of unrelated lines. Avoid restoring brightness pulsing or
  hard square dilation as a default.
- Validate saved settings and tolerate corrupt or unavailable localStorage.
  Preserve compatibility with existing settings. Saving is explicit; images
  and the current palette are not persisted.

## Validation

For application changes, run `npm test`, `npm run build`, and
`git diff --check`. Add focused regression cases for algorithm or settings
changes using synthetic images. Cover relevant edge cases such as transparency,
image boundaries, colored backgrounds, antialiasing, and display scaling.

For interaction or visual changes, also check the affected flow in a browser
when available. Canvas layers have distinct `.image-source` and
`.highlight-layer` selectors. Inspect curves and diagonals for highlight
changes, and verify nearby colors and the source image remain intact.
Report checks actually performed and any unavailable validation.

For documentation-only changes, review accuracy and run `git diff --check`;
an application rebuild is unnecessary. For workflow changes, validate YAML and
branch conditions as well as the relevant build commands.

## Branches and deployment

- `main` runs tests and builds only. It must not upload a Pages artifact or deploy.
- `deployment` contains source code and the workflow. Successful tests and a
  build on that branch publish `dist` through GitHub Pages Actions.
- Manual workflow runs must honor the same deployment-branch restriction.
  Keep main-branch checks independent of deployment concurrency.
- Preserve Vite's `/colear/` base path and use `import.meta.env.BASE_URL` for
  public asset URLs so the app works under the repository's Pages path.
- The legacy `npm run deploy` script writes to `gh-pages`; it is not the current
  release workflow. Follow the release steps in `README.md` when publishing is
  requested. Ordinary development changes do not require a release.
- GitHub Pages uses the GitHub Actions source and the `github-pages` environment;
  its branch rules must permit `deployment`.
