const fs = require("node:fs");
const path = require("node:path");
const { MongoMemoryServer } = require("mongodb-memory-server");

function findSystemMongod() {
  if (process.env.MONGOMS_SYSTEM_BINARY) return process.env.MONGOMS_SYSTEM_BINARY;
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(dir, "mongod");
    if (dir && fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

async function startMemoryMongo() {
  const systemBinary = findSystemMongod();
  return MongoMemoryServer.create(systemBinary ? { binary: { systemBinary, checkMD5: false } } : {});
}

module.exports = { startMemoryMongo };
