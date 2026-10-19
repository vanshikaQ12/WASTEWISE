WASTEWISE — NETLIFY ADAPTER
===========================

This package adapts the existing root-level HTML pages and Express backend to Netlify's documented Express + Netlify Functions setup. It does not replace the site's existing HTML design.

BEFORE YOU START
----------------
1. Open the existing ca1 CH110/WASTEWISE project folder in VS Code.
2. Make sure your most recent work is saved and pushed to GitHub.
3. Copy the contents of this ZIP into the project root (merge folders; do not replace your existing HTML pages).
4. Make a backup or commit your work before running the preparation script.

PREPARE THE PROJECT
-------------------
In VS Code's terminal, with the terminal in the project root, run:

  node scripts/prepare-netlify.js
  npm install
  node --check server.js
  node --check netlify/functions/api.js
  npm run netlify:build

The preparation script is designed to:
- export the Express app without starting a long-running listener when imported by Netlify Functions;
- initialize OpenAI only when OPENAI_API_KEY is set, so its absence does not crash non-AI routes;
- set Express proxy trust and HTTPS-aware session cookies;
- change HTML localhost API origins to same-origin URLs and normalize nav links that differed only in capitalization;
- add the serverless-http dependency and a Netlify build script.

If the preparation script stops with a message saying it could not find expected code, it makes no changes. Do not force it; review the indicated section of server.js manually first.

COMMIT THE CHANGES
------------------
After the checks above pass:

  git status
  git add server.js package.json package-lock.json .gitignore netlify.toml netlify scripts *.html
  git commit -m "Adapt WasteWise for Netlify"
  git push

Do not stage or upload .env or node_modules. The generated public/ folder is deliberately ignored; Netlify creates it during its build.

NETLIFY SITE SETTINGS
---------------------
1. In Netlify, choose Add new project / Import an existing project.
2. Connect GitHub and select vanshikaQ12/WASTEWISE, branch main.
3. netlify.toml defines these settings:
   Build command: npm run netlify:build
   Publish directory: public
   Functions directory: netlify/functions
4. In Site configuration / Environment variables, add:
   MONGODB_URI       = your MongoDB Atlas connection URI
   SESSION_SECRET    = a long, random private value
   OPENAI_API_KEY    = your OpenAI key (optional; without it, the rest of the app can start, but photo analysis returns a configuration message)
5. Trigger deployment and inspect the Deploy log and Function logs.

IMPORTANT DATABASE NOTE
-----------------------
This config puts the existing Express app behind Netlify Functions and connects Mongoose at function invocation. The existing express-session / connect-mongo setup also uses MongoDB. Login/signup require valid MONGODB_URI and SESSION_SECRET. In MongoDB Atlas, ensure the deployment can reach the cluster through Atlas Network Access. A persistent Atlas TLS/network problem must still be fixed in Atlas or connection settings; moving to Netlify alone cannot guarantee a database connection.

NETLIFY ROUTING
---------------
netlify.toml rewrites /api/* to the api function. Existing frontend calls should use relative URLs such as /api/login and /api/signup, not localhost URLs.

After deployment, test these individually:
- https://YOUR-SITE.netlify.app/ (index page)
- https://YOUR-SITE.netlify.app/api/test (should return JSON if the database configuration permits the function to initialize)
- sign up and login with a test account
- test Play and Progress

Never commit .env or share secret values. Static pages are publicly delivered by Netlify; the API routes enforce login for protected data operations. Review every protected-page script before using this for sensitive information.
