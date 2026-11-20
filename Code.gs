/**
 * SKETCH-TO-AR — Google Apps Script back end
 * ------------------------------------------------------------
 * Stores uploaded .glb files in a Google Drive folder and logs
 * every upload / edit / delete in this Google Sheet.
 *
 * ONE-TIME SETUP (see the guide for screenshots-level detail):
 *   1. Create a new Google Sheet. Extensions > Apps Script.
 *   2. Delete the sample code, paste this whole file, Save.
 *   3. Pick "setup" in the function menu, click Run, approve access.
 *   4. Deploy > New deployment > type "Web app"
 *        Execute as: Me      Who has access: Anyone
 *      Click Deploy and copy the Web app URL.
 *   5. Paste that URL into API_URL at the top of index.html.
 *
 * Themes: edit the "Themes" tab of the Sheet (one per row).
 * No code change needed.
 */

const FOLDER_NAME = 'Sketch-to-AR uploads';
const MAX_MB = 25;

const COLS = ['ID', 'Uploaded', 'Student', 'Theme', 'Project', 'Size (MB)',
              'Status', 'Last change', 'File ID', 'Thumbnail'];
const C = {}; COLS.forEach((n, i) => C[n] = i);

// ---------- setup ----------
function setup() {
  const ss = SpreadsheetApp.getActive();
  let log = ss.getSheetByName('Uploads');
  if (!log) log = ss.insertSheet('Uploads', 0);
  if (log.getLastRow() === 0) {
    log.appendRow(COLS);
    log.setFrozenRows(1);
    log.getRange(1, 1, 1, COLS.length).setFontWeight('bold');
    log.setColumnWidth(C['Thumbnail'] + 1, 80);
  }
  let th = ss.getSheetByName('Themes');
  if (!th) {
    th = ss.insertSheet('Themes');
    th.appendRow(['Theme']);
    th.getRange(1, 1).setFontWeight('bold');
    ['Theme A', 'Theme B', 'Theme C'].forEach(t => th.appendRow([t]));
  }
  const s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  getFolder_();
}

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

// ---------- HTTP ----------
function doGet(e) {
  try {
    const a = e.parameter.action;
    if (a === 'list') return out_(list_());
    if (a === 'file') return out_(file_(e.parameter.id));
    return out_({ error: 'Unknown action' });
  } catch (err) { return out_({ error: String(err.message || err) }); }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.action === 'upload') return out_(upload_(b));
    if (b.action === 'update') return out_(update_(b));
    if (b.action === 'delete') return out_(delete_(b));
    return out_({ error: 'Unknown action' });
  } catch (err) {
    return out_({ error: String(err.message || err) });
  } finally { lock.releaseLock(); }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- helpers ----------
function log_() { return SpreadsheetApp.getActive().getSheetByName('Uploads'); }
function clean_(s, max) { return String(s || '').trim().replace(/\s+/g, ' ').slice(0, max || 80); }
function same_(a, b) { return clean_(a).toLowerCase() === clean_(b).toLowerCase(); }

function themes_() {
  const th = SpreadsheetApp.getActive().getSheetByName('Themes');
  if (!th || th.getLastRow() < 2) return [];
  return th.getRange(2, 1, th.getLastRow() - 1, 1).getValues()
    .map(r => clean_(r[0])).filter(Boolean);
}

function rows_() {
  const sh = log_();
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, COLS.length).getValues()
    .map((r, i) => ({ r: r, row: i + 2 }));
}

function find_(id) {
  const hit = rows_().find(x => x.r[C['ID']] === id);
  if (!hit || hit.r[C['Status']] === 'Deleted') throw new Error('Sketch not found');
  return hit;
}

function item_(r) {
  return {
    id: r[C['ID']],
    uploaded: r[C['Uploaded']] instanceof Date ? r[C['Uploaded']].toISOString() : String(r[C['Uploaded']]),
    student: r[C['Student']],
    theme: r[C['Theme']],
    project: r[C['Project']],
    sizeMB: r[C['Size (MB)']],
    thumb: r[C['Thumbnail']]
  };
}

// ---------- actions ----------
function list_() {
  const items = rows_().filter(x => x.r[C['Status']] !== 'Deleted')
    .map(x => item_(x.r)).reverse();               // newest first
  return { themes: themes_(), items: items };
}

function file_(id) {
  const hit = find_(id);
  const blob = DriveApp.getFileById(hit.r[C['File ID']]).getBlob();
  return { id: id, data: Utilities.base64Encode(blob.getBytes()) };
}

function upload_(b) {
  const student = clean_(b.student), theme = clean_(b.theme), project = clean_(b.project);
  if (!student || !theme || !project) throw new Error('Name, theme and project name are all required');
  if (!b.data) throw new Error('No file received');
  const bytes = Utilities.base64Decode(b.data);
  const mb = bytes.length / 1048576;
  if (mb > MAX_MB) throw new Error('File is over ' + MAX_MB + ' MB');
  // GLB files start with the ASCII bytes "glTF"
  if (!(bytes[0] === 0x67 && bytes[1] === 0x6C && bytes[2] === 0x54 && bytes[3] === 0x46))
    throw new Error('That is not a .glb file');

  const id = Utilities.getUuid().slice(0, 8);
  const fname = (student + ' - ' + project).replace(/[\\/:*?"<>|]/g, '') + ' (' + id + ').glb';
  const file = getFolder_().createFile(Utilities.newBlob(bytes, 'model/gltf-binary', fname));
  let thumb = String(b.thumb || '');
  if (thumb.length > 45000 || thumb.indexOf('data:image/') !== 0) thumb = '';

  const now = new Date();
  const row = [];
  row[C['ID']] = id; row[C['Uploaded']] = now; row[C['Student']] = student;
  row[C['Theme']] = theme; row[C['Project']] = project;
  row[C['Size (MB)']] = Math.round(mb * 100) / 100; row[C['Status']] = 'Live';
  row[C['Last change']] = 'Uploaded ' + now.toLocaleString(); row[C['File ID']] = file.getId();
  row[C['Thumbnail']] = thumb;
  log_().appendRow(row);
  return { ok: true, item: item_(row) };
}

function update_(b) {
  const hit = find_(b.id);
  if (!same_(hit.r[C['Student']], b.student)) throw new Error('This sketch belongs to another name');
  const project = clean_(b.project), theme = clean_(b.theme);
  if (!project || !theme) throw new Error('Project name and theme are required');
  const sh = log_();
  sh.getRange(hit.row, C['Theme'] + 1).setValue(theme);
  sh.getRange(hit.row, C['Project'] + 1).setValue(project);
  sh.getRange(hit.row, C['Last change'] + 1).setValue('Edited ' + new Date().toLocaleString());
  try { DriveApp.getFileById(hit.r[C['File ID']])
          .setName((clean_(b.student) + ' - ' + project).replace(/[\\/:*?"<>|]/g, '') + ' (' + b.id + ').glb'); } catch (e) {}
  hit.r[C['Theme']] = theme; hit.r[C['Project']] = project;
  return { ok: true, item: item_(hit.r) };
}

function delete_(b) {
  const hit = find_(b.id);
  if (!same_(hit.r[C['Student']], b.student)) throw new Error('This sketch belongs to another name');
  try { DriveApp.getFileById(hit.r[C['File ID']]).setTrashed(true); } catch (e) {}
  const sh = log_();
  sh.getRange(hit.row, C['Status'] + 1).setValue('Deleted');
  sh.getRange(hit.row, C['Last change'] + 1).setValue('Deleted ' + new Date().toLocaleString());
  return { ok: true };
}
