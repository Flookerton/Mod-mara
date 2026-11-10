# Mod-mara: Op Art Studio

Make black and white optical art in your browser: warped grids, endless spirals, hyperbolic
tilings and classic illusions, with live sliders, seamless animation and a favorites gallery.

Everything runs on your own device with WebGL2. There is no server, no account, no cookies,
no tracking, and nothing is uploaded.

## Use it

Open `index.html` in a current browser (Chrome, Edge, Firefox or Safari). It works offline,
straight from the folder.

## Host it anywhere

This folder is plain static files with relative paths and no build step.

1. Copy the whole folder to your web host (any folder name works).
2. Open the page's address in a browser.

That is all. It works on GitHub Pages, on any shared host, or from a USB stick.

## Settings files

"Save settings" writes a small `.json` file that describes a picture exactly. Loading it
(button or drag and drop) brings back the same picture. The random seed shown under the
picture only drives this app's random choices.

## Files

- `index.html` page and security policy
- `app.js` controls, favorites, import and export
- `engine.js` WebGL2 setup and rendering
- `shaders.js` the pattern, illusion and print-finish shaders
- `spec.js` settings, defaults and safe file loading
- `randomize.js` the "Surprise me" choices
- `app.css`, `skins/` the two looks
- `fonts/` open-licensed fonts for the terminal look (see `fonts/OFL.txt`)
