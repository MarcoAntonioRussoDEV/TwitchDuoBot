/**
 * postbuild-env.js
 * Eseguito automaticamente da npm dopo "build" e "deploy".
 * Ripristina il .env originale dal backup creato da prebuild-env.js.
 */

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env");
const backupPath = path.join(root, ".env.bak");

if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, envPath);
    fs.unlinkSync(backupPath);
    console.log("[postbuild-env] .env originale ripristinato.");
} else {
    console.log("[postbuild-env] Nessun backup trovato, nessuna azione.");
}
