const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const OpenAI = require("openai")
const multer = require("multer")
require("dotenv").config();
const User = require('./models/user');
/* =========================
   WASTEWISE AI SETUP
========================= */

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024 // Maximum 5 MB
    },

    fileFilter: (req, file, callback) => {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error("Please upload a JPG, PNG, or WEBP image.")
            );
        }

        callback(null, true);
    }
});

const WASTE_CATEGORIES = [
    "Organic waste",
    "Plastic",
    "Paper/cardboard",
    "Glass/metal",
    "Other waste"
];

const app = express();

// Read JSON sent from the frontend
app.use(express.json());


app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,

        store: MongoStore.create({
            mongoUrl: process.env.MONGODB_URI,
            mongoOptions: {
                family: 4
            }
        }),

        cookie: {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

// Serve your HTML, CSS, JS and other frontend files

/* =========================
   TEST ROUTE
========================= */

app.get("/api/test", (req, res) => {
    res.json({
        message: "WasteWise backend is working!"
    });
});


/* =========================
   SIGN UP
========================= */

console.log("SIGNUP ROUTE LOADED");
app.post("/api/signup", async (req, res) => {

    try {

        const { name, email, password } = req.body;

        // Check that all fields are present
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill in all fields."
            });
        }

        // Check if the email already exists
        const existingUser = await User.findOne({
            email: email.toLowerCase()
        });

        if (existingUser) {
            return res.status(400).json({
                message: "An account with this email already exists."
            });
        }

        // Securely hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create the new user
        const newUser = new User({
            name: name,
            email: email.toLowerCase(),
            password: hashedPassword
        });

        // Save user to MongoDB
await newUser.save();

// Automatically log in the newly registered user
req.session.regenerate((err) => {

    if (err) {
        console.error("Signup session error:", err);

        return res.status(500).json({
            message: "Account created, but unable to start a session."
        });
    }

    req.session.userId = newUser._id.toString();
    req.session.userName = newUser.name;
    req.session.userEmail = newUser.email;

    req.session.save((err) => {

        if (err) {
            console.error("Session save error:", err);

            return res.status(500).json({
                message: "Account created, but unable to save the session."
            });
        }

        res.status(201).json({
            message: "Account created successfully!",
            redirect: "/INTERFACE.html"
        });

    });

});

    } catch (error) {

        console.error("Signup error:", error);

        res.status(500).json({
            message: "Something went wrong while creating the account."
        });

    }
});

    /* =========================
               LOGIN
     ========================= */


app.post("/api/login", async (req, res) => {

    try {

        const { email, password } = req.body;

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Please enter your email and password."
            });
        }

        // Find user
        const user = await User.findOne({
            email: email.toLowerCase()
        });

        // User doesn't exist
        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        // Compare password
        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        // Wrong password
        if (!passwordMatch) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        // Create a fresh login session
        req.session.regenerate((err) => {

            if (err) {
                console.error("Session error:", err);

                return res.status(500).json({
                    message: "Unable to create login session."
                });
            }

            // Store the logged-in user's information
            req.session.userId = user._id.toString();
            req.session.userName = user.name;
            req.session.userEmail = user.email;

            // Save session
            req.session.save((err) => {

                if (err) {
                    console.error("Session save error:", err);

                    return res.status(500).json({
                        message: "Unable to save login session."
                    });
                }

                // Login successful
                res.status(200).json({
                    message: "Login successful!",
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        points: user.points,
                        progress: user.progress
                    }
                });

            });

        });

    } catch (error) {

        console.error("Login error:", error);

        res.status(500).json({
            message: "Something went wrong during login."
        });

    }

});
/* =========================
   AUTHENTICATION CHECK
========================= */

function requireLogin(req, res, next) {

    if (!req.session.userId) {
        return res.redirect("/LOGIN.html");
    }

    next();
}

/* =========================
   API LOGIN CHECK
========================= */

function requireApiLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            message: "Please log in before uploading a photo."
        });
    }

    next();
}


/* =========================
   NORMALIZE PIE CHART DATA
========================= */

function normalizeWastePercentages(rawCategories) {
    const values = WASTE_CATEGORIES.map((name) => {
        const value = Number(rawCategories?.[name]);

        return Number.isFinite(value)
            ? Math.max(0, value)
            : 0;
    });

    const total = values.reduce((sum, value) => sum + value, 0);

    if (total <= 0) {
        return null;
    }

    const exact = values.map((value) => value / total * 100);
    const percentages = exact.map((value) => Math.floor(value));

    let remaining =
        100 - percentages.reduce((sum, value) => sum + value, 0);

    const ranked = exact
        .map((value, index) => ({
            index,
            fraction: value - Math.floor(value)
        }))
        .sort((a, b) => b.fraction - a.fraction);

    for (let i = 0; i < remaining; i++) {
        percentages[ranked[i].index]++;
    }

    return WASTE_CATEGORIES.map((name, index) => ({
        name,
        percentage: percentages[index]
    }));
}


/* =========================
   AI WASTE PHOTO ANALYSIS
========================= */

app.post(
    "/api/game/analyze-waste",
    requireApiLogin,

    (req, res, next) => {
        upload.single("photo")(req, res, (error) => {
            if (error) {
                const message =
                    error.code === "LIMIT_FILE_SIZE"
                        ? "The photo must be 5 MB or smaller."
                        : error.message;

                return res.status(400).json({ message });
            }

            next();
        });
    },

    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({
                    message: "Please choose a photo first."
                });
            }

            const base64Image = req.file.buffer.toString("base64");

            const imageUrl =
                `data:${req.file.mimetype};base64,${base64Image}`;

            const response = await openai.chat.completions.create({
                model: "gpt-4.1-mini",

                response_format: {
                    type: "json_object"
                },

                messages: [
                    {
                        role: "system",
                        content: `
You are the waste-sorting assistant for WasteWise Daily Sort.

Analyze the uploaded photograph carefully.

Return JSON only, with these fields:
- isRelevantPhoto: boolean
- message: string
- summary: string
- sortingFeedback: string
- categories: object containing all five category names:
  "Organic waste", "Plastic", "Paper/cardboard",
  "Glass/metal", "Other waste"

For a relevant waste photo:
- Estimate each category's share of the visible waste.
- Use non-negative numeric percentages.
- Make the percentages add up to approximately 100.
- Base estimates on visible area, count, or apparent volume,
  never claim they are measured percentages by weight.
- Do not claim to identify hidden items.
- Give constructive sorting feedback based only on the image.
- If sorting cannot be judged from the image, say so.

For an unrelated image or an image where waste cannot
reasonably be identified, set isRelevantPhoto to false.
Explain that a clear photo of waste is needed.

Never claim an estimate is exact.
                        `
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Analyze this photo for the WasteWise Daily Sort game."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageUrl,
                                    detail: "high"
                                }
                            }
                        ]
                    }
                ]
            });

            const text =
                response.choices?.[0]?.message?.content;

            if (!text) {
                return res.status(502).json({
                    message: "The AI returned no analysis. Please try again."
                });
            }

            let analysis;

            try {
                analysis = JSON.parse(text);
            } catch {
                return res.status(502).json({
                    message: "The AI response could not be processed. Please try again."
                });
            }

            if (analysis.isRelevantPhoto !== true) {
                return res.status(422).json({
                    message:
                        analysis.message ||
                        "Please upload a clear photo showing waste."
                });
            }

            const categories =
                normalizeWastePercentages(analysis.categories);

            if (!categories) {
                return res.status(502).json({
                    message: "The waste percentages could not be estimated. Please try another photo."
                });
            }

            res.json({
                message: "Waste photo analyzed successfully.",

                summary:
                    String(analysis.summary || "Waste photo analyzed.")
                        .slice(0, 500),

                sortingFeedback:
                    String(analysis.sortingFeedback || "Review your waste separation.")
                        .slice(0, 1000),

                categories
            });

        } catch (error) {
            console.error(
                "Waste photo analysis error:",
                error.message
            );

            res.status(502).json({
                message:
                    "AI analysis failed. Check your API access and billing, then try again."
            });
        }
    }
);


/* =========================
   GET CURRENT USER
========================= */

app.get("/api/me", requireLogin, async (req, res) => {

    try {

        const user = await User.findById(req.session.userId)
            .select("-password");

        if (!user) {

            req.session.destroy(() => {});

            return res.status(401).json({
                message: "User account not found."
            });
        }

        res.status(200).json({
            user: user
        });

    } catch (error) {

        console.error("Current user error:", error);

        res.status(500).json({
            message: "Unable to load user information."
        });

    }

});
/* =========================
   COMPLETE ACTIVITY
========================= */

app.post("/api/activity/complete", requireLogin, async (req, res) => {

    try {

        const { type, activityId } = req.body;

        if (!type || !activityId) {
            return res.status(400).json({
                message: "Activity type and activity ID are required."
            });
        }

        if (type !== "lesson" && type !== "game") {
            return res.status(400).json({
                message: "Invalid activity type."
            });
        }

        const field =
            type === "lesson"
                ? "completedLessons"
                : "completedGames";

        const pointsEarned =
            type === "lesson"
                ? 10
                : 20;


        /* =========================
           UPDATE USER
        ========================= */

        const updatedUser = await User.findOneAndUpdate(

            {
                _id: req.session.userId,

                [field]: {
                    $ne: activityId
                }
            },

            {
                $addToSet: {
                    [field]: activityId
                },

                $inc: {
                    points: pointsEarned
                }
            },

            {
                returnDocument: "after"
            }

        ).select("-password");


        /* =========================
           USER NOT FOUND
           OR ACTIVITY ALREADY DONE
        ========================= */

        if (!updatedUser) {

            const existingUser =
                await User.findById(req.session.userId);

            if (!existingUser) {

                return res.status(404).json({
                    message: "User not found."
                });

            }

            /* Recalculate progress */

            const TOTAL_LESSONS = 3;

            const completedLessons =
                existingUser.completedLessons.length;

            const progress =
                Math.round(
                    (completedLessons / TOTAL_LESSONS) * 100
                );

            existingUser.progress = progress;

            await existingUser.save();

            return res.status(200).json({

                message: "Activity already completed.",

                alreadyCompleted: true,

                points: existingUser.points,

                progress: existingUser.progress

            });

        }


        /* =========================
           CALCULATE PROGRESS
        ========================= */

        const TOTAL_LESSONS = 3;

        const completedLessons =
            updatedUser.completedLessons.length;

        const progress =
            Math.round(
                (completedLessons / TOTAL_LESSONS) * 100
            );


        /* Save progress */

        updatedUser.progress = progress;

        await updatedUser.save();


        /* =========================
           SEND RESPONSE
        ========================= */

        res.status(200).json({

            message: "Activity completed!",

            alreadyCompleted: false,

            pointsEarned: pointsEarned,

            points: updatedUser.points,

            progress: updatedUser.progress,

            completedLessons:
                updatedUser.completedLessons,

            completedGames:
                updatedUser.completedGames

        });

    } catch (error) {

        console.error(
            "Activity completion error:",
            error
        );

        res.status(500).json({
            message: "Unable to complete activity."
        });

    }

});
/* =========================
   PROTECT INTERFACE
========================= */

app.get("/INTERFACE.html", requireLogin, (req, res) => {

    res.sendFile(__dirname + "/INTERFACE.html");

});


/* =========================
   SERVE FRONTEND FILES
========================= */

app.use(express.static(__dirname));

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI, {
    family: 4
})
.then(() => {
    console.log("MongoDB connected successfully!");

    app.listen(PORT, "0.0.0.0", () => {
        console.log(`WasteWise server running on port ${PORT}`);
    });
})
.catch((error) => {
    console.error(
        "MongoDB connection failed:",
        error.message
    );
});
