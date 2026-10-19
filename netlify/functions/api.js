const serverless = require("serverless-http");
const mongoose = require("mongoose");
const app = require("../../server");

// Keep a reusable connection promise in a warm Netlify function instance.
let databaseConnectionPromise;
const expressHandler = serverless(app, {
    // Preserve the original Netlify event payload for the Express fallback parser.
    request: (request, event) => {
        if (typeof event.body === "string") {
            request.netlifyRawBody = event.isBase64Encoded
                ? Buffer.from(event.body, "base64").toString("utf8")
                : event.body;
        } else if (Buffer.isBuffer(event.body)) {
            request.netlifyRawBody = event.body.toString("utf8");
        }
    }
});

exports.handler = async (event, context) => {
    // Allow the runtime to reuse open database connections between invocations.
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("Missing MONGODB_URI environment variable");
        }

        if (mongoose.connection.readyState !== 1) {
            if (!databaseConnectionPromise) {
                databaseConnectionPromise = mongoose.connect(
                    process.env.MONGODB_URI,
                    {
                        family: 4,
                        serverSelectionTimeoutMS: 15000
                    }
                ).catch((error) => {
                    databaseConnectionPromise = null;
                    throw error;
                });
            }

            await databaseConnectionPromise;
        }

        return await expressHandler(event, context);
    } catch (error) {
        console.error("WasteWise Netlify function error:", error.message);
        return {
            statusCode: 503,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            },
            body: JSON.stringify({
                message: "WasteWise backend is temporarily unavailable. Check the Netlify environment variables and MongoDB Atlas connection settings."
            })
        };
    }
};
