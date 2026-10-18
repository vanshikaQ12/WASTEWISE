const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publishDir = path.join(root, "public");
const includedFileExtensions = new Set([
    ".html", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg",
    ".gif", ".ico", ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".pdf"
]);
const includedAssetDirectories = new Set(["assets", "images", "fonts", "media", "css", "js"]);

fs.rmSync(publishDir, { recursive: true, force: true });
fs.mkdirSync(publishDir, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const source = path.join(root, entry.name);

    if (entry.isFile() && includedFileExtensions.has(path.extname(entry.name).toLowerCase())) {
        fs.copyFileSync(source, path.join(publishDir, entry.name));
        continue;
    }

    if (entry.isDirectory() && includedAssetDirectories.has(entry.name.toLowerCase())) {
        fs.cpSync(source, path.join(publishDir, entry.name), { recursive: true });
    }
}

if (!fs.existsSync(path.join(publishDir, "index.html"))) {
    throw new Error("Build failed: index.html was not found in the project root.");
}

console.log(`WasteWise static files prepared in ${publishDir}`);
console.log(`Copied ${fs.readdirSync(publishDir).length} top-level entries.`);
