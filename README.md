# Colear

![](./media/Peek%202024-08-31%2023-11.gif)

Are you often troubled by colors in diagrams or illustrations in papers because
of your color vision deficiency? `Colear` aims to help you clearly see those
lines or blocks.

## Features

- Smart color picking searches near the cursor for the solid color inside a
  line or shape, avoiding anti-aliased edge shades. Adjust its radius or turn it
  off for exact pixel selection. The magnifier previews the original pixels,
  even while another color is highlighted.
- Background detection uses the most common color cluster, including colored
  backgrounds. It can also be set with a color chooser or sampled directly from
  the image. There is no separate text-color exclusion: a color shared by text
  and lines remains selectable.
- Display scaling defaults to `window.devicePixelRatio`. A ratio of 2 displays
  a 1200 × 800 screenshot at 600 × 400 CSS pixels. The full-resolution source
  is retained, and picking/highlighting always operate on its original pixels.
- Each palette color has its own live highlight range, controlled by a number
  field and slider. Selected colors have a rounded outline and soft halo while other colors keep
  their original appearance. Select another color to edit its range independently.
- Approximate color names and exact hex values identify palette colors.
- **Bulk add** extracts color clusters from a dragged region, merging
  narrow anti-aliased edge shades into nearby solid colors and removing scattered
  colors without similar adjacent pixels. Only background colors are excluded.
- Light and dark themes, a responsive layout, and local saved settings.
- Upload, paste, or drop an image; drag palette colors to reorder them; use
  minus mode to remove individual colors.

## Using the controls

The palette sits to the right of the image, with detection and display settings
underneath. On narrow screens, the palette stacks below the image, followed by
the settings.

Click near a feature in the image to add its color. If a similar palette color
already exists, it is selected and highlighted immediately, using its saved
range. The closest match within RGB distance 12 is used, independently of its
highlight range. Repeated image picks keep that color highlighted. Click a
palette card to toggle its highlight. Keys **1–9** select colors in their current
palette order. **Escape** clears the highlight and exits the active tool.
**Show original** restores the unmodified image. While a color is highlighted,
clicking empty background also shows the original without adding a palette
color. If the snap preview finds a nearby line, clicking selects that snapped
color instead, even when the cursor itself is over background.
Background colors are excluded from every way of adding palette colors,
including exact pixel picking when no color is selected.

Smart picking treats edge colors as mixtures of the configured background and
the line color. It follows connected pixels in the same color direction and
chooses the strongest background contrast supported by neighboring pixels.
This helps avoid unrelated nearby lines and isolated noise. It uses an actual
source pixel; if the image contains only blended shades, it picks the strongest
supported shade available rather than guessing an unobserved original color.
Set the background accurately or disable smart picking for exact samples.

Click **−** while a palette color is selected to remove it immediately. With no
selected color, **−** toggles removal mode so you can click colors to delete them.

Highlight range is RGB root-mean-square distance: **0** matches the exact color,
**20** is the default tolerance, and **255** includes every color. A rounded,
feathered outline and soft halo make thin lines more noticeable. The outline
fills the selected line's antialiased edges and expands into background or
transparency, keeping unrelated lines visible. The halo
fades out over 4.5 CSS pixels and keeps its visual width when display scaling
changes. The highlight is steady and retains the selected color, without
brightness animation. The original image is never modified.

After adjusting the background controls, use **Detect main colors** to replace
the palette with up to eight representative colors. Rectangle selections
append the cleaned color clusters and skip colors already in the palette. Edge
merging uses neighboring shades, background blending, and flat-area evidence to
reduce false positives while retaining solid pale fills and thin lines. It only
uses pixels inside the rectangle; if a line's core lies outside, a remaining
edge shade may still be included. Black, gray, and other colors shared by text
and lines are included in detection and picking.

**Save settings** stores the theme, scale, picking options, background mode and
color, default range, and ranges keyed by color in this browser's
local storage. Images and the current palette are not stored. **Restore
defaults** resets the controls; save again to keep the reset preferences.

Screenshot resolution depends on the capture tool and browser zoom. If the
default screen ratio does not match the original on-screen size, adjust the
divisor manually. Scaling changes only display size, with scrolling for images
larger than the workspace.

## Keyboard shortcuts

Hover over a button to see its shortcut. Letter shortcuts work when you are not
typing in a field; **Esc** also exits highlighting while a field is focused.

| Key | Action |
| --- | --- |
| `a` | Pick color |
| `A` (`Shift+A`) | Bulk add |
| `Esc` | Show original and return to Pick color |
| `1`–`9` | Select the palette color in that position |
| `-` | Remove selected color, or toggle removal mode |
| `d` | Detect main colors |
| `c` | Clear palette |
| `b` | Pick background pixel |
| `u` | Upload image |
| `t` | Toggle light / dark mode |
| `s` | Save settings |
| `r` | Use screen pixel ratio |
| `R` (`Shift+R`) | Restore default settings |

## Development

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

The production preview is available at `http://localhost:4173/colear/`.
Tests cover background detection, nearby picking, rectangle extraction,
transparency, highlight layers, and settings validation. No server or account is
needed for image processing or saved preferences.

## Automatic deployment

The [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) workflow installs
dependencies, runs tests, builds the site, and deploys `dist` after each push to
`main`. You can also run it manually from the repository's **Actions** tab;
only `main` can deploy.

Before the first deployment, open **Settings → Pages → Build and deployment**
and set **Source** to **GitHub Actions**, as described in the
[GitHub Pages setup guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
The workflow uses GitHub's built-in token, so no additional secrets are needed.

The site is published at <https://neumoneumo.github.io/colear/>. Vite's
`base: '/colear/'` setting keeps image and asset URLs under the repository path.
Deployment status and the published URL appear in the `github-pages` environment.
