const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "share.json");

// Initialize JSON DB
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([]));
}

let itemsCache = [];
try {
  itemsCache = JSON.parse(fs.readFileSync(dbPath, "utf8"));
} catch (e) {
  itemsCache = [];
}

const saveDb = () => {
  fs.writeFileSync(dbPath, JSON.stringify(itemsCache, null, 2));
};

const db = {
  getAll: () => itemsCache,
  insert: (item) => {
    itemsCache.push(item);
    saveDb();
  },
  delete: (id) => {
    itemsCache = itemsCache.filter((i) => i.id !== id);
    saveDb();
  },
  getById: (id) => {
    return itemsCache.find((i) => i.id === id);
  },
};

module.exports = db;
