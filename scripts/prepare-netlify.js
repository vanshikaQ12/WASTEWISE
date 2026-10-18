const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const serverPath = path.join(root, "server.js");
const packagePath = path.join(root, "package.json");
const gitignorePath = path.join(root, ".gitignore");

function fail(message) {
    console.error(`\nNetlify setup stopped safely: ${message}`);
    console.error("No changes were written by this script. Check your project files and run it again.");
    process.exit(1);
}
function replaceRequired(source, pattern, replacement, label) {
    if (pattern.test(source)) return source.replace(pattern, replacement);
    fail(`could not find the expected ${label} in your current file. The source may already be adapted or may differ from the expected version.`);
}

if (!fs.existsSync(serverPath) || !fs.existsSync(packagePath)) {
    fail("run this script from your main WasteWise project folder, where server.js and package.json exist.");
}

let server = fs.readFileSync(serverPath, "utf8");
let pkg;
try {
    pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
} catch {
    fail("package.json is not valid JSON.");
}

// Update the server without starting an HTTP listener when imported as a Function.
if (!server.includes("module.exports = app;")) {
    server = replaceRequired(
        server,
        /const openai\s*=\s*new OpenAI\(\{\s*apiKey:\s*process\.env\.OPENAI_API_KEY\s*\}\s*\);?/m,
        'const openai = process.env.OPENAI_API_KEY\n    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })\n    : null;',
        "OpenAI client initialization"
    );

    server = replaceRequired(
        server,
        /const app = express\(\);/,
        'const app = express();\napp.set("trust proxy", 1);',
        "Express app initialization"
    );

    // A missing optional OpenAI key should not prevent the rest of the app from loading.
    server = replaceRequired(
        server,
        /app\.post\(\s*"\/api\/game\/analyze-waste",[\s\S]*?async \(req, res\) => \{\s*try \{\s*if \(!req\.file\) \{/m,
        (match) => match.replace(
            /async \(req, res\) => \{\s*try \{\s*if \(!req\.file\) \{/,
            'async (req, res) => {\n        if (!openai) {\n            return res.status(503).json({\n                message: "Photo analysis is not configured on this deployment yet."\n            });\n        }\n        try {\n            if (!req.file) {'
        ),
        "AI photo-analysis route"
    );

    // Make secure cookies work behind Netlify's HTTPS proxy while keeping local HTTP development usable.
    server = replaceRequired(
        server,
        /secure:\s*false\s*,/,
        'secure: process.env.NETLIFY === "true" || process.env.NODE_ENV === "production",',
        "session cookie secure setting"
    );

    // Replace only the server startup block at EOF. Netlify imports the app; local `node server.js` still starts normally.
    const portMarker = "const PORT = process.env.PORT || 3000;";
    const portIndex = server.lastIndexOf(portMarker);
    if (portIndex < 0) fail("the expected PORT declaration was not found at the end of server.js.");
    server = server.slice(0, portIndex) + `const PORT = process.env.PORT || 3000;\n\nmodule.exports = app;\n\nif (require.main === module) {\n    mongoose.connect(process.env.MONGODB_URI, {\n        family: 4,\n        serverSelectionTimeoutMS: 15000\n    })\n    .then(() => {\n        console.log("MongoDB connected successfully!");\n        app.listen(PORT, "0.0.0.0", () => {\n            console.log(\`WasteWise server running on port \${PORT}\`);\n        });\n    })\n    .catch((error) => {\n        console.error("MongoDB connection failed:", error.message);\n    });\n}\n`;
}

// Add the serverless adapter dependency and Netlify build command idempotently.
pkg.dependencies = pkg.dependencies || {};
pkg.dependencies["serverless-http"] = pkg.dependencies["serverless-http"] || "^3.2.0";
pkg.scripts = pkg.scripts || {};
pkg.scripts["netlify:build"] = "node scripts/netlify-build.js";

// Correct hard-coded local API origins and page link case so the current public paths work on Linux hosting.
const htmlNames = fs.readdirSync(root).filter((name) => name.toLowerCase().endsWith(".html"));
const htmlReplacements = [
    [/http:\/\/localhost:3000/g, ""],
    [/http:\/\/127\.0\.0\.1:3000/g, ""],
    [/LEARN\.html/g, "learn.html"],
    [/PLAY\.html/g, "play.html"],
    [/ABOUT\.html/g, "about.html"],
    [/PROGRESS\.html/g, "progress.html"],
    [/SIGNUP\.html/g, "signin.html"]
];
for (const name of htmlNames) {
    const file = path.join(root, name);
    let html = fs.readFileSync(file, "utf8");
    for (const [pattern, replacement] of htmlReplacements) html = html.replace(pattern, replacement);
    fs.writeFileSync(file, html);
}

fs.writeFileSync(serverPath, server);
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");

let gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "node_modules/\n.env\n.env.*\n!.env.example\n";
if (!gitignore.split(/\r?\n/).includes("public/")) gitignore += `${gitignore.endsWith("\n") ? "" : "\n"}public/\n`;
if (!gitignore.split(/\r?\n/).includes(".env")) gitignore += ".env\n";
fs.writeFileSync(gitignorePath, gitignore);

console.log("Netlify source changes prepared.");
console.log("Next: run npm install, then the syntax checks in NETLIFY_README.txt.");
