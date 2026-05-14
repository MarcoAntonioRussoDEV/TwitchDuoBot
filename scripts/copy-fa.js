const fs = require("fs");
const path = require("path");

const src = path.join(
    __dirname,
    "..",
    "node_modules",
    "@fortawesome",
    "fontawesome-free",
);
const dest = path.join(__dirname, "..", "renderer", "vendor", "fa");

fs.mkdirSync(path.join(dest, "css"), { recursive: true });
fs.mkdirSync(path.join(dest, "webfonts"), { recursive: true });

fs.copyFileSync(
    path.join(src, "css", "all.min.css"),
    path.join(dest, "css", "all.min.css"),
);

const webfontsDir = path.join(src, "webfonts");
for (const file of fs.readdirSync(webfontsDir)) {
    fs.copyFileSync(
        path.join(webfontsDir, file),
        path.join(dest, "webfonts", file),
    );
}

console.log("✔ Font Awesome copiato in renderer/vendor/fa/");
