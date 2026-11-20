const FOLDER_NAME = 'star glb uploads';
const MAX_MB = 25;

const COLS = ['ID', 'Uploaded', 'Student', 'Theme', 'Project', 'Size (MB)',
              'Status', 'Last change', 'File ID', 'Thumbnail', 'Site'];
const C = {}; COLS.forEach((n, i) => C[n] = i);

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
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (!it.hasNext()) throw new Error('Drive folder "' + FOLDER_NAME + '" not found');
  return it.next();
}

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

function log_() { return SpreadsheetApp.getActive().getSheetByName('Uploads'); }
function ensureHeaders_() {
  const sh = log_(), cell = sh.getRange(1, C['Site'] + 1);
  if (!cell.getValue()) cell.setValue('Site').setFontWeight('bold');
}
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
    thumb: r[C['Thumbnail']],
    site: r[C['Site']] || ''
  };
}

function list_() {
  const items = rows_().filter(x => x.r[C['Status']] !== 'Deleted')
    .map(x => item_(x.r)).reverse();
  return { themes: themes_(), items: items };
}

function file_(id) {
  const hit = find_(id);
  const blob = DriveApp.getFileById(hit.r[C['File ID']]).getBlob();
  return { id: id, data: Utilities.base64Encode(blob.getBytes()) };
}

function upload_(b) {
  const student = clean_(b.student), theme = clean_(b.theme), project = clean_(b.project);
  const site = clean_(b.site);
  if (!student || !theme || !project) throw new Error('Name, theme and project name are all required');
  if (!b.data) throw new Error('No file received');
  const bytes = Utilities.base64Decode(b.data);
  const mb = bytes.length / 1048576;
  if (mb > MAX_MB) throw new Error('File is over ' + MAX_MB + ' MB');
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
  row[C['Thumbnail']] = thumb; row[C['Site']] = site;
  ensureHeaders_();
  log_().appendRow(row);
  return { ok: true, item: item_(row) };
}

function update_(b) {
  const hit = find_(b.id);
  if (!same_(hit.r[C['Student']], b.student)) throw new Error('This sketch belongs to another name');
  const project = clean_(b.project), theme = clean_(b.theme), site = clean_(b.site);
  if (!project || !theme) throw new Error('Project name and theme are required');
  ensureHeaders_();
  const sh = log_();
  sh.getRange(hit.row, C['Theme'] + 1).setValue(theme);
  sh.getRange(hit.row, C['Project'] + 1).setValue(project);
  sh.getRange(hit.row, C['Site'] + 1).setValue(site);
  sh.getRange(hit.row, C['Last change'] + 1).setValue('Edited ' + new Date().toLocaleString());
  try { DriveApp.getFileById(hit.r[C['File ID']])
          .setName((clean_(b.student) + ' - ' + project).replace(/[\\/:*?"<>|]/g, '') + ' (' + b.id + ').glb'); } catch (e) {}
  hit.r[C['Theme']] = theme; hit.r[C['Project']] = project; hit.r[C['Site']] = site;
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
