import { Router } from "express";
import bcrypt from "bcryptjs";
import db from "../../db/db.js";
import { Result } from "pg";

const router = Router();
const salt_rounds = 12;

router.get("/register", (req, res) => {
  res.render("authentication/register.ejs");
});

// Register route
router.post("/register", async (req, res, next) => {
  const { username, email, role, password, confirmPassword } = req.body;

  try {
    // 0️⃣ Check passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        message: "Passwords do not match",
      });
    }

    // 1️⃣ Check if user already exists
    const checkUser = await db.query("SELECT id FROM users WHERE email = $1", [
      email,
    ]);

    if (checkUser.rows.length > 0) {
      return res.status(400).json({
        message: "Email already exists",
      });
    }

    const allowedRoles = ["jobseeker", "employer"];
    const safeRole = allowedRoles.includes(role) ? role : "jobseeker";

    // 2️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, salt_rounds);

    // 3️⃣ Insert user into database
    const result = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *",
      [username, email, hashedPassword, role]
    );

    const user = result.rows[0];

    req.login(user, (err) => {
      if (err) return next(err);
      if (role === "jobseeker") {
        return res.redirect("/jobseeker/profile");
      } else if (role === "employer") {
        return res.redirect("/employer/dashboard");
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Registration failed",
    });
  }
});

export default router;
