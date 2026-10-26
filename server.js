
"use strict";

const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "5mb" }));

// Database setup

const databasePath = path.resolve(
    __dirname,
    "../PersonalNotehubs/database/notes.db"
);

const db = new Database(databasePath);


db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'Personal',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`);

// Add new columns safely to an existing database.
const existingColumns = db.prepare(
    "PRAGMA table_info(notes)"
).all().map(column => column.name);

const newColumns = [
    ["tags", "TEXT NOT NULL DEFAULT ''"],
    ["color", "TEXT NOT NULL DEFAULT 'lavender'"],
    ["is_favorite", "INTEGER NOT NULL DEFAULT 0"],
    ["is_pinned", "INTEGER NOT NULL DEFAULT 0"]
];

for (const [name, definition] of newColumns) {
    if (!existingColumns.includes(name)) {
        db.exec(`ALTER TABLE notes ADD COLUMN ${name} ${definition}`);
    }
}

// Return a consistent format to the frontend.
function formatNote(note) {
    return {
        ...note,
        is_favorite: Boolean(note.is_favorite),
        is_pinned: Boolean(note.is_pinned)
    };
}

function validNote(body) {
    return body &&
        typeof body.title === "string" &&
        body.title.trim().length > 0 &&
        body.title.trim().length <= 100 &&
        typeof (body.content ?? "") === "string" &&
        (body.content ?? "").length <= 10000 &&
        ["Study", "Work", "Personal", "Ideas"].includes(
            body.category || "Personal"
        ) &&
        ["lavender", "mint", "peach", "blue"].includes(
            body.color || "lavender"
        );
}

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "Personal Notes Hub backend is running"
    });
});

// Get all notes
app.get("/api/notes", (req, res) => {
    const notes = db.prepare(`
        SELECT * FROM notes
        ORDER BY is_pinned DESC, id DESC
    `).all();

    res.json({
        success: true,
        data: notes.map(formatNote)
    });
});

// Get one note
app.get("/api/notes/:id", (req, res) => {
    const note = db.prepare(
        "SELECT * FROM notes WHERE id = ?"
    ).get(Number(req.params.id));

    if (!note) {
        return res.status(404).json({
            success: false,
            message: "Note not found"
        });
    }

    res.json({ success: true, data: formatNote(note) });
});

// Create note
app.post("/api/notes", (req, res) => {
    if (!validNote(req.body)) {
        return res.status(400).json({
            success: false,
            message: "Please provide valid note details"
        });
    }

    const {
        title,
        content = "",
        category = "Personal",
        color = "lavender",
        tags = "",
        is_favorite = false,
        is_pinned = false
    } = req.body;

    const result = db.prepare(`
        INSERT INTO notes
        (title, content, category, color, tags, is_favorite, is_pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        title.trim(),
        content,
        category,
        color,
        typeof tags === "string" ? tags : "",
        Number(Boolean(is_favorite)),
        Number(Boolean(is_pinned))
    );

    const note = db.prepare(
        "SELECT * FROM notes WHERE id = ?"
    ).get(result.lastInsertRowid);

    res.status(201).json({
        success: true,
        data: formatNote(note)
    });
});

// Update note
app.put("/api/notes/:id", (req, res) => {
    const id = Number(req.params.id);

    if (!validNote(req.body)) {
        return res.status(400).json({
            success: false,
            message: "Please provide valid note details"
        });
    }

    const {
        title,
        content = "",
        category = "Personal",
        color = "lavender",
        tags = "",
        is_favorite = false,
        is_pinned = false
    } = req.body;

    const result = db.prepare(`
        UPDATE notes
        SET title = ?, content = ?, category = ?, color = ?,
            tags = ?, is_favorite = ?, is_pinned = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        title.trim(),
        content,
        category,
        color,
        typeof tags === "string" ? tags : "",
        Number(Boolean(is_favorite)),
        Number(Boolean(is_pinned)),
        id
    );

    if (!result.changes) {
        return res.status(404).json({
            success: false,
            message: "Note not found"
        });
    }

    const note = db.prepare(
        "SELECT * FROM notes WHERE id = ?"
    ).get(id);

    res.json({ success: true, data: formatNote(note) });
});

// Delete note
app.delete("/api/notes/:id", (req, res) => {
    const result = db.prepare(
        "DELETE FROM notes WHERE id = ?"
    ).run(Number(req.params.id));

    if (!result.changes) {
        return res.status(404).json({
            success: false,
            message: "Note not found"
        });
    }

    res.json({
        success: true,
        message: "Note deleted successfully"
    });
});

// Import multiple notes from a JSON backup.
app.post("/api/notes/import", (req, res) => {
    const imported = req.body.notes;

    if (!Array.isArray(imported) || imported.length > 1000) {
        return res.status(400).json({
            success: false,
            message: "Invalid notes import"
        });
    }

    const insert = db.prepare(`
        INSERT INTO notes
        (title, content, category, color, tags, is_favorite, is_pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const importTransaction = db.transaction(items => {
        for (const note of items) {
            if (!validNote({
                ...note,
                category: note.category || "Personal",
                color: note.color || "lavender"
            })) {
                throw new Error("Invalid note in import file");
            }

            insert.run(
                note.title.trim(),
                note.content || "",
                note.category || "Personal",
                note.color || "lavender",
                typeof note.tags === "string" ? note.tags : "",
                Number(Boolean(note.is_favorite)),
                Number(Boolean(note.is_pinned ?? note.pinned))
            );
        }
    });

    try {
        importTransaction(imported);
        res.json({ success: true, message: "Notes imported successfully" });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// Serve the existing frontend.
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Personal Notes Hub running at http://localhost:${PORT}`);
    console.log("Database:", databasePath);
});
