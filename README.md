# Calculator

A small, dependency-free calculator sample built with vanilla HTML, CSS, and JavaScript.

**Live site:** <https://noroblemo.github.io/calculator/>

## Features

- Basic arithmetic (`+`, `−`, `×`, `÷`), percent, sign toggle, and decimals
- Keyboard support: digits, operators, `Enter`/`=`, `Backspace`, and `Esc`/`C` to clear
- Persistent calculation history saved in `localStorage` — click a result to reuse it
- Responsive, dark glassmorphism UI with no build step

## Run it

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## Files

- `index.html` — markup and calculator keypad
- `style.css` — theme, layout, and responsive styles
- `app.js` — calculator state machine, formatting, keyboard input, and history
