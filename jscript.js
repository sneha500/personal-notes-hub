
"use strict";

const API = "/api/notes";

const noteForm = document.getElementById("noteForm");
const noteTitle = document.getElementById("noteTitle");
const noteContent = document.getElementById("noteContent");
const noteCategory = document.getElementById("noteCategory");
const noteColor = document.getElementById("noteColor");

const notesGrid = document.getElementById("notesGrid");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const sortSelect = document.getElementById("sortSelect");

const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const formHeading = document.getElementById("formHeading");

const totalCount = document.getElementById("totalCount");
const pinnedCount = document.getElementById("pinnedCount");
const categoryCount = document.getElementById("categoryCount");

const themeBtn = document.getElementById("themeBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

const categories = ["Study", "Work", "Personal", "Ideas"];
const colors = ["lavender", "mint", "peach", "blue"];

let notes = [];
let editingId = null;

function normalizeNote(note) {
    return {
        ...note,
        id: Number(note.id),
        color: colors.includes(note.color) ? note.color : "lavender",
        pinned: Boolean(note.is_pinned ?? note.pinned),
        createdAt: Date.parse(note.created_at) || Date.now(),
        updatedAt: Date.parse(note.updated_at) || Date.now()
    };
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
        throw new Error(result.message || "Request failed");
    }

    return result;
}

async function loadNotes() {
    try {
        const result = await apiRequest(API);
        notes = result.data.map(normalizeNote);
        renderNotes();
    } catch (error) {
        console.error(error);
        alert("Could not load notes. Make sure the backend is running.");
    }
}

function notePayload(note) {
    return {
        title: note.title,
        content: note.content,
        category: note.category,
        color: note.color,
        tags: note.tags || "",
        is_favorite: Boolean(note.is_favorite),
        is_pinned: Boolean(note.pinned)
    };
}

noteForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const title = noteTitle.value.trim();
    const content = noteContent.value.trim();
    const category = noteCategory.value;
    const color = noteColor.value;

    if (!title || !content) {
        alert("Please enter both a title and content.");
        return;
    }

    if (
        title.length > 100 ||
        content.length > 10000 ||
        !categories.includes(category) ||
        !colors.includes(color)
    ) {
        alert("Please check the note details.");
        return;
    }

    const existing = notes.find(note => note.id === editingId);

    const payload = {
        title,
        content,
        category,
        color,
        tags: existing?.tags || "",
        is_favorite: existing?.is_favorite || false,
        is_pinned: existing?.pinned || false
    };

    try {
        saveBtn.disabled = true;

        if (editingId !== null) {
            await apiRequest(`${API}/${editingId}`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });
        } else {
            await apiRequest(API, {
                method: "POST",
                body: JSON.stringify(payload)
            });
        }

        resetForm();
        await loadNotes();
    } catch (error) {
        alert("Could not save note: " + error.message);
    } finally {
        saveBtn.disabled = false;
    }
});

function renderNotes() {
    const query = searchInput.value.trim().toLowerCase();
    const category = categoryFilter.value;
    const sortBy = sortSelect.value;

    const filteredNotes = notes.filter(note => {
        const matchesSearch =
            note.title.toLowerCase().includes(query) ||
            note.content.toLowerCase().includes(query);

        const matchesCategory =
            category === "All" || note.category === category;

        return matchesSearch && matchesCategory;
    });

    filteredNotes.sort((a, b) => {
        if (a.pinned !== b.pinned) {
            return Number(b.pinned) - Number(a.pinned);
        }

        if (sortBy === "title") {
            return a.title.localeCompare(b.title);
        }

        if (sortBy === "created") {
            return b.createdAt - a.createdAt;
        }

        return b.updatedAt - a.updatedAt;
    });

    notesGrid.replaceChildren();

    if (filteredNotes.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";

        const heading = document.createElement("h3");
        heading.textContent = notes.length ? "No matching notes found" : "No notes yet";

        const message = document.createElement("p");
        message.textContent = notes.length
            ? "Try another search or category."
            : "Create your first note using the form above.";

        empty.append(heading, message);
        notesGrid.appendChild(empty);
    } else {
        filteredNotes.forEach(note => {
            notesGrid.appendChild(createNoteCard(note));
        });
    }

    updateStats();
}

function createNoteCard(note) {
    const card = document.createElement("article");
    card.className = `note-card ${note.color}`;

    const top = document.createElement("div");
    top.className = "note-top";

    const tag = document.createElement("span");
    tag.className = "category-tag";
    tag.textContent = note.category;

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.className = "pin-btn";
    pinBtn.textContent = note.pinned ? "📌" : "📍";
    pinBtn.title = note.pinned ? "Unpin note" : "Pin note";
    pinBtn.setAttribute("aria-pressed", String(note.pinned));
    pinBtn.addEventListener("click", () => togglePin(note.id));

    top.append(tag, pinBtn);

    const title = document.createElement("h3");
    title.textContent = note.title;

    const content = document.createElement("p");
    content.className = "note-content";
    content.textContent = note.content;

    const date = document.createElement("p");
    date.className = "note-date";
    date.textContent = "Updated " + new Date(note.updatedAt).toLocaleString();

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary-btn";
    editBtn.textContent = "✎ Edit";
    editBtn.addEventListener("click", () => editNote(note.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "🗑 Delete";
    deleteBtn.addEventListener("click", () => deleteNote(note.id));

    actions.append(editBtn, deleteBtn);
    card.append(top, title, content, date, actions);

    return card;
}

function updateStats() {
    totalCount.textContent = notes.length;
    pinnedCount.textContent = notes.filter(note => note.pinned).length;
    categoryCount.textContent = new Set(notes.map(note => note.category)).size;
}

function editNote(id) {
    const note = notes.find(item => item.id === id);
    if (!note) return;

    editingId = id;
    noteTitle.value = note.title;
    noteContent.value = note.content;
    noteCategory.value = note.category;
    noteColor.value = note.color;

    formHeading.textContent = "Edit your note";
    saveBtn.textContent = "Save Changes";
    cancelBtn.hidden = false;

    noteForm.scrollIntoView({ behavior: "smooth", block: "start" });
    noteTitle.focus();
}

function resetForm() {
    noteForm.reset();
    editingId = null;
    formHeading.textContent = "Create a new note";
    saveBtn.textContent = "+ Add Note";
    cancelBtn.hidden = true;
}

cancelBtn.addEventListener("click", resetForm);

async function deleteNote(id) {
    const note = notes.find(item => item.id === id);
    if (!note) return;

    if (!confirm(`Are you sure you want to delete "${note.title}"?`)) {
        return;
    }

    try {
        await apiRequest(`${API}/${id}`, { method: "DELETE" });

        if (editingId === id) resetForm();
        await loadNotes();
    } catch (error) {
        alert("Could not delete note: " + error.message);
    }
}

async function togglePin(id) {
    const note = notes.find(item => item.id === id);
    if (!note) return;

    try {
        await apiRequest(`${API}/${id}`, {
            method: "PUT",
            body: JSON.stringify(notePayload({
                ...note,
                pinned: !note.pinned
            }))
        });

        await loadNotes();
    } catch (error) {
        alert("Could not update pin: " + error.message);
    }
}

searchInput.addEventListener("input", renderNotes);
categoryFilter.addEventListener("change", renderNotes);
sortSelect.addEventListener("change", renderNotes);

// Theme preference remains in the browser.
function applyTheme(theme) {
    const isDark = theme === "dark";
    document.body.classList.toggle("dark", isDark);
    themeBtn.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
    themeBtn.setAttribute("aria-pressed", String(isDark));
}

let currentTheme = "light";

try {
    currentTheme = localStorage.getItem("personalNotesHub_theme") === "dark"
        ? "dark"
        : "light";
} catch (error) {
    console.warn("Theme preference is unavailable.");
}

applyTheme(currentTheme);

themeBtn.addEventListener("click", function () {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    applyTheme(currentTheme);

    try {
        localStorage.setItem("personalNotesHub_theme", currentTheme);
    } catch (error) {
        console.warn("Could not save theme preference.");
    }
});

// Export notes as a JSON file.
exportBtn.addEventListener("click", function () {
    const blob = new Blob(
        [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), notes }, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "personal-notes-backup.json";
    link.click();
    URL.revokeObjectURL(url);
});

// Import notes into SQLite.
importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async function () {
    const file = importFile.files[0];
    if (!file) return;

    try {
        if (file.size > 5 * 1024 * 1024) {
            throw new Error("File is too large. Maximum size is 5 MB.");
        }

        const backup = JSON.parse(await file.text());
        const imported = Array.isArray(backup) ? backup : backup.notes;

        if (!Array.isArray(imported)) {
            throw new Error("Invalid backup file.");
        }

        const valid = imported.filter(note =>
            note &&
            typeof note.title === "string" &&
            note.title.trim() &&
            typeof note.content === "string" &&
            categories.includes(note.category) &&
            colors.includes(note.color)
        );

        if (!valid.length) {
            throw new Error("No valid notes found in the backup.");
        }

        if (!confirm(`Import ${valid.length} notes into your database?`)) {
            return;
        }

        for (const note of valid) {
            await apiRequest(API, {
                method: "POST",
                body: JSON.stringify({
                    title: note.title,
                    content: note.content,
                    category: note.category,
                    color: note.color,
                    tags: note.tags || "",
                    is_favorite: Boolean(note.is_favorite),
                    is_pinned: Boolean(note.is_pinned ?? note.pinned)
                })
            });
        }

        await loadNotes();
        alert("Notes imported successfully.");
    } catch (error) {
        alert("Import failed: " + error.message);
    } finally {
        importFile.value = "";
    }
});

// Start the application.
loadNotes();
