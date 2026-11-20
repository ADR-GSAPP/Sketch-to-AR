# Sketch-to-AR (ADR1): project notes for Claude Code

Phone-first web platform where students in the ADR1 course (Columbia GSAPP, Amelyn Ng) upload Blender sketches as GLB files and place them life-sized in AR. Built and maintained by Khaled Alanjery (assistantship). TA testing: Tianrun Li.

Live site: https://adr-gsapp.github.io/Sketch-to-AR/  (GitHub Pages, repo ADR-GSAPP/Sketch-to-AR, branch main, root)

## Architecture
- **index.html**: the whole front end in one file. No build step, no framework.
  - `<model-viewer>` 3.5.0 from the Google CDN; fonts DM Sans + Geist Pixel (Google Fonts).
  - Brand: dark `#0e0e0f`, neon green accent `#39ff14`, muted `#8a8a8f`, Geist Pixel for headings/buttons.
  - Three tabs: **Library**, **Viewer Bay**, **My Uploads**. Desktop: top tab bar. Phone (≤760px): fixed bottom tab bar.
  - `window.API_URL` near the top = the deployed Google Apps Script web app URL. **Never overwrite or blank it.** Empty → demo mode.
- **Code.gs**: Google Apps Script back end, bound to a Google Sheet owned by Khaled's *personal (non-Columbia) Google account*. The copy in this repo is reference only; the running copy lives in Apps Script.
  - GET `?action=list` → `{themes, items}`; GET `?action=file&id=` → base64 GLB.
  - POST (body is JSON sent as text/plain to avoid a CORS preflight) with `action` = `upload` | `update` | `delete`.
  - Files saved into the Drive folder **"star glb uploads"** (looked up by name via `getFoldersByName`). Every upload/edit/delete is logged in the Sheet's **Uploads** tab; deletes trash the Drive file and mark the row `Deleted` (row kept).
  - Themes come from the Sheet's **Themes** tab (column A, below header). Current themes: REPAIR & RECIRCULATE MATERIALS; REST, REPOSE, RECHARGE; BLOCK PARTY, BODEGA, COMMUNITY BUILDING; SOLARPUNK (COLLECTIVIZE RESOURCES); SOILPUNK (REGENERATE THE EARTH).
  - The repo's Code.gs uses `'star glb uploads'` and throws if the folder is missing (synced 2026-11-19 to match what was deployed). If the deployed script and this copy ever differ, the deployed one wins.
  - Uploads tab columns: ID, Uploaded, Student, Theme, Project, Size (MB), Status, Last change, File ID, Thumbnail, **Site** (added last so old rows stay aligned; header auto-added by `ensureHeaders_`).
  - After changing the script: Deploy > Manage deployments > edit > **New version** (URL stays the same). Access must be **Anyone**. Columbia (LionMail) deployments only allow "Anyone at Columbia", which breaks the site with a CORS error, which is why the back end moved to a personal account.
- **demo/**: six sample GLBs (oak-tree, park-bench, street-lamp, cafe-chair, stone-gateway, planter-box) at real-world scale in meters, Y-up, with real PBR materials (baseColorFactor in linear space, no vertex colors), plus 240×320 JPEG thumbnails. The same GLBs and thumbnails are also **embedded as base64 in index.html** (`DEMO_DATA`) so demo mode works from `file://`. If you regenerate the demos, update both.

## Behaviour decisions (made by Khaled; keep unless he says otherwise)
- **One file per sketch: GLB only.** No USDZ upload. iPhone AR uses model-viewer's auto-generated USDZ (known trade-off: no animation in iPhone AR).
- **Upload is desktop only** (`(hover:hover) and (pointer:fine)` and width > 760). Phones get Library, Viewer Bay and My Uploads (rename/change theme/delete), with no upload form.
- Upload fields: **student name, theme, project name, site (optional free text)**. No student ID / UNI. Site is editable in My Uploads.
- Library has a **search box** (matches project, student, site, theme) above the theme chips. Tile plate shows student · theme; site appears in the tile tooltip.
- **Ownership is name-only** (type your name in My Uploads to see/edit/delete your sketches). Honor system, chosen deliberately. Two-step inline delete (no `confirm()` pop-ups).
- **Library = Mortal Kombat character-select feel**: "Choose your sketch", theme filter chips, tiles with thumbnail + name plate. First tap selects: the tile enlarges to 2×2, glows, shows a "P1" tag and spins the live 3D model (`auto-rotate`, turntable), and the sketch replaces whatever is in the Viewer Bay. A second tap on the same tile opens the Viewer Bay.
- **Viewer Bay = Khaled's original single-page viewer, kept as-is**: headline "Tap below to place this life-sized sketch in your space!", 480px model-viewer, the green "View in AR" button slotted inside model-viewer, and the hint "Works best on a phone with AR support (iOS Quick Look or Android Scene Viewer)." Don't add a nameplate/QR/etc. without asking.
- Thumbnails are generated client-side at upload (`model-viewer.toBlob` → 240×320 JPEG data URL, kept under ~44k chars so it fits in a Sheet cell).
- Name field placeholder: "YOUR NAME HERE".
- Max upload 25 MB (Apps Script payload limit, GitHub browser-upload limit). Recommend students keep models under ~10 MB because files load through Apps Script as base64.

## Known issues / to-do
- Test on real phones (TAs): iPhone Safari + Android Chrome, AR placement, true scale, textures, large files (~20 MB). Android loads models from blob URLs, so it uses WebXR rather than Scene Viewer; some phones may not support it.
- The student guide (a Claude Doc, "ADR1 — Sketch to AR: One-File Workflow") describes the *old* GitHub-folder-per-model workflow and needs rewriting for this upload flow.
- Optional ideas raised but not built: optional USDZ field for animated sketches on iPhone; desktop QR code in the Viewer Bay; locking AR to true scale (`ar-scale="fixed"`).

## Working in this repo
- The folder lives inside Google Drive (CloudStorage), so file syncing can lag; commit/push with GitHub Desktop.
- Test locally with a static server (`python3 -m http.server`) rather than `file://` when checking anything that fetches.
- GitHub Pages caches; after a push, hard-reload (⌘⇧R) or use a private window.
