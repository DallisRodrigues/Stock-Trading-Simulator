const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");

const PORT = Number(process.env.LOCAL_MONGO_PORT || 27027);
const dbPath = path.join(__dirname, "..", ".mongo-data");
fs.mkdirSync(dbPath, { recursive: true });

const mongod = spawn(process.env.MONGOD_BIN || "mongod", ["--dbpath", dbPath, "--port", String(PORT), "--bind_ip", "127.0.0.1", "--quiet"], {
  stdio: ["ignore", "ignore", "inherit"],
});
mongod.on("error", (err) => {
  console.error(`[local-db] could not start mongod (${err.message}). Install MongoDB Community or set MONGOD_BIN.`);
  process.exit(1);
});

function waitForPort(port, timeoutMs = 15000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.end();
        resolve();
      });
      sock.once("error", () => {
        if (Date.now() - started > timeoutMs) reject(new Error("mongod did not start in time"));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

waitForPort(PORT)
  .then(() => {
    process.env.MONGODB_URI = `mongodb://127.0.0.1:${PORT}`;
    console.info(`[local-db] mongod running on 127.0.0.1:${PORT} (data: backend/.mongo-data)`);
    process.on("exit", () => mongod.kill("SIGINT"));
    require("../index.js");
  })
  .catch((err) => {
    console.error(`[local-db] ${err.message}`);
    mongod.kill("SIGINT");
    process.exit(1);
  });
