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
  backgrounds. Text defaults to black, with optional automatic detection. Both
  colors can be set with a color chooser or sampled directly from the image.
- Display scaling defaults to `window.devicePixelRatio`. A ratio of 2 displays
  a 1200 × 800 screenshot at 600 × 400 CSS pixels. The full-resolution source
  is retained, and picking/highlighting always operate on its original pixels.
- Each palette color has its own live highlight range, controlled by a number
  field and slider. Select another color to edit its range independently.
- Approximate color names and exact hex values identify palette colors.
- **Bulk add** extracts color clusters from a dragged region, merging
  narrow anti-aliased edge shades into nearby solid colors and removing scattered
  colors without similar adjacent pixels. Background is excluded; text exclusion
  is optional.
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
clicking a background pixel also shows the original without adding a palette
color. This takes priority over nearby snapping, even beside a line.
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
**20** is the default tolerance, and **255** includes every color. A 3 × 3
dilation expands the highlight by one source pixel around matching pixels to
make thin lines more noticeable. Pixels outside the expanded highlight are
desaturated and faded; source data is never overwritten.

After adjusting the background or text controls, use **Detect main colors** to
replace the palette with up to eight representative colors. **Exclude text color
from detection** applies to both **Detect main colors** and **Bulk add**; it
does not prevent manually picking a text color. Rectangle selections
append the cleaned color clusters and skip colors already in the palette. Edge
merging uses neighboring shades, background blending, and flat-area evidence to
reduce false positives while retaining solid pale fills and thin lines. It only
uses pixels inside the rectangle; if a line's core lies outside, a remaining
edge shade may still be included. Text
detection is a color/contrast heuristic, not OCR; manually sample the text when
an image has colored labels or other contrasting objects.

**Save settings** stores the theme, scale, picking options, background/text
modes and colors, default range, and ranges keyed by color in this browser's
local storage. Images and the current palette are not stored. **Restore
defaults** resets the controls; save again to keep the reset preferences.

Screenshot resolution depends on the capture tool and browser zoom. If the
default screen ratio does not match the original on-screen size, adjust the
divisor manually. Scaling changes only display size, with scrolling for images
larger than the workspace.

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
Tests cover background/text detection, nearby picking, rectangle extraction,
transparency, highlight ranges, and settings validation. No server or account is
needed for image processing or saved preferences.
