![SteamrollerTool Logo](steamroller-branding/steamroller-logo.png)

# SteamrollerTool

**Steam Assets, Done. Fast.**

By **fufroom**  
If this helps you, consider supporting: **[Buy Me a Coffee](https://ko-fi.com/fufroom)**

## Run with Docker (quick start)

```bash
docker compose up -d --build
```

Open: [http://localhost:8092](http://localhost:8092)

Stop:

```bash
docker compose down
```

## How it works (brief)

- The app UI and asset resizing workflow are mostly **frontend JavaScript** in `index.html`.
- Drag-and-drop image processing and ZIP assembly happen in the browser.
- The only backend-specific part is the **ICNS generator** in `app.js` (`POST /api/generate-icns`), which converts a PNG into a `.icns` file.
- Docker runs this Node service so ICNS generation works consistently across machines.

## License

This project is released under **CC0 1.0 Universal (Creative Commons Zero)**.
