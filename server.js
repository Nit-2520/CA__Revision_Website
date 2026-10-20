const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "revision.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  section_no TEXT NOT NULL,
  name TEXT NOT NULL,
  revised INTEGER NOT NULL DEFAULT 0,
  keywords TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);
`);
db.pragma("foreign_keys = ON");
app.use(express.json({ limit: "25mb" }));
app.use(express.static(path.join(__dirname, "public")));

const allChapters = db.prepare("SELECT * FROM chapters ORDER BY sort_order, id");
const allSections = db.prepare("SELECT * FROM sections WHERE chapter_id = ? ORDER BY sort_order, section_no");
function sectionOut(s) {
  return { id:s.id, chapterId:s.chapter_id, number:s.section_no, name:s.name,
    revised:!!s.revised, keywords:JSON.parse(s.keywords || "[]"), notes:s.notes,
    images:JSON.parse(s.images || "[]") };
}
function chapterOut(c) {
  const sections = allSections.all(c.id).map(sectionOut);
  const revised = sections.filter(s => s.revised).length;
  return { id:c.id, name:c.name, sections, revised, total:sections.length,
    progress:sections.length ? Math.round(revised/sections.length*100) : 0 };
}
function getChapter(id) {
  const c = db.prepare("SELECT * FROM chapters WHERE id = ?").get(id);
  return c ? chapterOut(c) : null;
}
function parseLines(text) {
  return String(text || "").split(/\r?\n/).map(line => {
    const m = line.trim().match(/^(.+?)\s*\|\s*(.+)$/);
    return m ? { number:m[1].trim(), name:m[2].trim() } : null;
  }).filter(Boolean);
}
app.get("/api/health", (_req,res) => res.json({ ok:true }));
app.get("/api/chapters", (_req,res) => res.json(allChapters.all().map(chapterOut)));
app.post("/api/chapters", (req,res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error:"Chapter name is required." });
  const result = db.prepare("INSERT INTO chapters(name,sort_order) VALUES(?,?)").run(name, allChapters.all().length);
  res.status(201).json(getChapter(result.lastInsertRowid));
});
app.get("/api/chapters/:id", (req,res) => {
  const c = getChapter(Number(req.params.id));
  if (!c) return res.status(404).json({ error:"Chapter not found." });
  res.json(c);
});
app.delete("/api/chapters/:id", (req,res) => {
  const result = db.prepare("DELETE FROM chapters WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error:"Chapter not found." });
  res.json({ ok:true });
});
app.post("/api/chapters/:id/sections", (req,res) => {
  const chapterId = Number(req.params.id);
  if (!db.prepare("SELECT id FROM chapters WHERE id = ?").get(chapterId)) return res.status(404).json({error:"Chapter not found."});
  const items = req.body.bulk ? parseLines(req.body.bulk) : [{number:String(req.body.number||"").trim(),name:String(req.body.name||"").trim()}];
  if (!items.length || items.some(x => !x.number || !x.name)) return res.status(400).json({error:"Enter section number and name, or use lines like 12 | Registered office."});
  const insert = db.prepare("INSERT INTO sections(chapter_id,section_no,name,sort_order) VALUES(?,?,?,?)");
  const addMany = db.transaction((rows) => {
    let count = 0;
    for (const item of rows) {
      const exists = db.prepare("SELECT id FROM sections WHERE chapter_id=? AND lower(section_no)=lower(?) AND lower(name)=lower(?)").get(chapterId,item.number,item.name);
      if (!exists) { insert.run(chapterId,item.number,item.name,db.prepare("SELECT COUNT(*) n FROM sections WHERE chapter_id=?").get(chapterId).n); count++; }
    }
    return count;
  });
  const added = addMany(items);
  res.status(201).json({ added, chapter:getChapter(chapterId) });
});
app.put("/api/sections/:id", (req,res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM sections WHERE id=?").get(id);
  if (!existing) return res.status(404).json({error:"Section not found."});
  const b = req.body;
  const number = b.number === undefined ? existing.section_no : String(b.number);
  const name = b.name === undefined ? existing.name : String(b.name);
  const revised = b.revised === undefined ? existing.revised : (b.revised ? 1 : 0);
  const keywords = b.keywords === undefined ? existing.keywords : JSON.stringify(Array.isArray(b.keywords) ? b.keywords : []);
  const notes = b.notes === undefined ? existing.notes : String(b.notes);
  const images = b.images === undefined ? existing.images : JSON.stringify(Array.isArray(b.images) ? b.images : []);
  try {
    db.prepare("UPDATE sections SET section_no=?,name=?,revised=?,keywords=?,notes=?,images=? WHERE id=?")
      .run(number,name,revised,keywords,notes,images,id);
  } catch (e) {
    if (String(e).includes("too big") || String(e).includes("SQLITE_FULL")) return res.status(507).json({error:"Server storage is full. Export a backup and remove some images."});
    throw e;
  }
  res.json(sectionOut(db.prepare("SELECT * FROM sections WHERE id=?").get(id)));
});
app.delete("/api/sections/:id", (req,res) => {
  const result = db.prepare("DELETE FROM sections WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({error:"Section not found."});
  res.json({ok:true});
});
app.get("/api/export", (_req,res) => {
  const payload = { version:1, exportedAt:new Date().toISOString(), chapters:allChapters.all().map(chapterOut) };
  res.setHeader("Content-Disposition", 'attachment; filename="ca-inter-law-backup.json"');
  res.json(payload);
});
app.post("/api/import", (req,res) => {
  const data = req.body;
  if (!data || !Array.isArray(data.chapters)) return res.status(400).json({error:"Invalid backup format."});
  const replace = db.transaction(() => {
    db.prepare("DELETE FROM sections").run();
    db.prepare("DELETE FROM chapters").run();
    const insC = db.prepare("INSERT INTO chapters(name,sort_order) VALUES(?,?)");
    const insS = db.prepare("INSERT INTO sections(chapter_id,section_no,name,revised,keywords,notes,images,sort_order) VALUES(?,?,?,?,?,?,?,?)");
    data.chapters.forEach((c,i) => {
      const cid = Number(insC.run(String(c.name || "Untitled chapter"),i).lastInsertRowid);
      (c.sections || []).forEach((s,j) => insS.run(cid,String(s.number ?? s.no ?? ""),String(s.name || ""),s.revised?1:0,JSON.stringify(s.keywords||[]),String(s.notes||""),JSON.stringify(s.images||[]),j));
    });
  });
  try { replace(); res.json({ok:true}); }
  catch(e) { res.status(500).json({error:"Could not restore backup: "+e.message}); }
});
app.get("*", (_req,res) => res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, () => console.log(`CA Law Revision app running at http://localhost:${PORT}`));
