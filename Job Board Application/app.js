import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import passport from "passport";
import env from "dotenv";
import "./routes/config-routes/passport.js";
import registerRoutes from "./routes/authentication-routes/register.js";
import loginRoutes from "./routes/authentication-routes/login.js";
import logoutRoutes from "./routes/authentication-routes/logout.js";

import jobseekerRoutes from "./routes/jobseeker-routes/jobseeker.js";
import employerRoutes from "./routes/employer-routes/employer.js";
import adminRoutes from "./routes/admins-routes/admin.js";

import db from "./db/db.js";

import path from "path";

env.config();

const app = express();
const port = 3000;
const __dirname = path.resolve();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24, // ✅ 1 day
      httpOnly: true,
      sameSite: "lax",
      secure: false, // set true in HTTPS production
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.use(jobseekerRoutes);
app.use(employerRoutes);
app.use(adminRoutes);

app.use(registerRoutes);
app.use(loginRoutes);
app.use(logoutRoutes);






app.get("/", (req, res) => {
  res.render("home.ejs", { user : req.user });
});

app.get("/jobs", async (req, res) => {
  try {
    const { q, location } = req.query;

    let query = `
      SELECT j.*, c.name AS company
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      WHERE j.is_active = TRUE
    `;

    const values = [];
    let index = 1;

    // 🔍 Search by job title or description
    if (q) {
      query += ` AND (j.title ILIKE $${index} OR j.description ILIKE $${index})`;
      values.push(`%${q}%`);
      index++;
    }

    // 📍 Filter by location
    if (location) {
      query += ` AND j.location = $${index}`;
      values.push(location);
      index++;
    }

    query += ` ORDER BY j.created_at DESC`;

    const result = await db.query(query, values);

    res.render("jobs.ejs", {
      jobs: result.rows,
      user: req.user,
      filters: { q, location }, // 👈 for keeping values in form
    });
  } catch (err) {
    console.error(err);
    res.send("Error loading jobs");
  }
});


app.get("/about", (req, res) => {
  res.render("about.ejs");
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
