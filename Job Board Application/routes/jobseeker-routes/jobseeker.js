import { Router } from "express";
import { ensureAuthenticated, ensureRole, ensureRoles } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";
import db from "../../db/db.js";
import path from "path";
import fs from "fs";

const router = Router();

router.get(
  "/jobseeker/dashboard",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const userId = req.user.id;

      // --------------------------
      // 1️⃣ Pending from applications table
      // --------------------------
      const pendingQuery = `
        SELECT COUNT(*) AS pending
        FROM applications
        WHERE user_id = $1 AND LOWER(status) = 'pending'
      `;
      const pendingResult = await db.query(pendingQuery, [userId]);
      const pendingCount = Number(pendingResult.rows[0].pending);

      // --------------------------
      // 2️⃣ Accepted from applications_history table
      // --------------------------
      const acceptedQuery = `
        SELECT COUNT(*) AS accepted
        FROM applications_history
        WHERE user_id = $1 AND LOWER(status) = 'accepted'
      `;
      const acceptedResult = await db.query(acceptedQuery, [userId]);
      const acceptedCount = Number(acceptedResult.rows[0].accepted);

      // --------------------------
      // 3️⃣ Total applied = all rows from both tables
      // --------------------------
      const totalAppliedQuery = `
        SELECT
          (SELECT COUNT(*) FROM applications WHERE user_id = $1) +
          (SELECT COUNT(*) FROM applications_history WHERE user_id = $1) AS total
      `;
      const totalAppliedResult = await db.query(totalAppliedQuery, [userId]);
      const totalApplied = Number(totalAppliedResult.rows[0].total);

      const stats = {
        total: totalApplied,
        pending: pendingCount,
        accepted: acceptedCount,
      };

      // --------------------------
      // 4️⃣ Recent Applications (last 5 from applications table)
      // --------------------------
      const recentApplicationsQuery = `
        SELECT
          a.id,
          a.status,
          a.created_at,
          j.title AS job_title,
          c.name AS company_name
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN companies c ON j.company_id = c.id
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC
        LIMIT 5
      `;
      const recentApplications = (await db.query(recentApplicationsQuery, [userId])).rows;

      // --------------------------
      // 5️⃣ Render dashboard
      // --------------------------
      res.render("jobseeker/dashboard.ejs", {
        user: req.user,
        stats,
        recentApplications,
      });
    } catch (error) {
      console.error("Jobseeker dashboard error:", error);
      res.status(500).send("Server Error");
    }
  }
);


router.get(
  "/jobseeker/profile",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const userId = req.user.id;

      // Get profile info
      const profileResult = await db.query(
        "SELECT * FROM jobseeker_profiles WHERE user_id = $1",
        [userId]
      );
      const userProfile = profileResult.rows[0] || {};

      // Get skills
      const skillsResult = await db.query(
        `
        SELECT s.name
        FROM jobseeker_skills js
        JOIN skills s ON js.skill_id = s.id
        WHERE js.user_id = $1
        `,
        [userId]
      );
      const skillsArray = skillsResult.rows.map(row => row.name);

      // Combine user data
      const userData = {
        ...req.user,              // id, name, email, etc.
        bio: userProfile.bio,
        resume_url: userProfile.resume_url,
        image_url: userProfile.image_url,
      };

      res.render("jobseeker/profile.ejs", {
        user: userData,
        skills: skillsArray,
      });
    } catch (err) {
      console.error("Error fetching profile:", err);
      res.status(500).send("Server Error");
    }
  }
);


router.get(
  "/jobseeker/profile/edit",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const userId = req.user.id;

      // Fetch profile info
      const profileResult = await db.query(
        "SELECT * FROM jobseeker_profiles WHERE user_id = $1",
        [userId]
      );
      const userProfile = profileResult.rows[0] || {};

      // Fetch skills for this user
      const skillsResult = await db.query(
        `
        SELECT s.name
        FROM jobseeker_skills js
        JOIN skills s ON js.skill_id = s.id
        WHERE js.user_id = $1
        `,
        [userId]
      );
      const skillsArray = skillsResult.rows.map((row) => row.name);

      // Combine skills as comma-separated string for input field
      userProfile.skills = skillsArray.join(", ");

      res.render("jobseeker/profile-edit.ejs", {
        user: req.user,       // from authentication
        userProfile,          // profile + skills + resume_url + image_url
      });
    } catch (err) {
      console.error("Error fetching profile:", err);
      res.status(500).send("Server Error");
    }
  }
);


router.post(
  "/jobseeker/profile/edit",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "image", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const { name, skills, experience, bio } = req.body;

      await db.query("BEGIN");

      // --------------------------
      // 1️⃣ Handle resume upload
      // --------------------------
      let newResumeUrl = null;
      if (req.files?.resume) {
        newResumeUrl = `/uploads/resumes/${req.files.resume[0].filename}`;

        // Delete old resume if exists
        const oldResume = await db.query(
          "SELECT resume_url FROM jobseeker_profiles WHERE user_id = $1",
          [req.user.id]
        );
        if (oldResume.rows.length && oldResume.rows[0].resume_url) {
          const oldPath = path.join(process.cwd(), oldResume.rows[0].resume_url);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }

      // --------------------------
      // 2️⃣ Handle profile image upload
      // --------------------------
      let newImageUrl = null;
      if (req.files?.image) {
        newImageUrl = `/uploads/images/${req.files.image[0].filename}`;

        // Delete old image if exists
        const oldImage = await db.query(
          "SELECT image_url FROM jobseeker_profiles WHERE user_id = $1",
          [req.user.id]
        );
        if (oldImage.rows.length && oldImage.rows[0].image_url) {
          const oldPath = path.join(process.cwd(), oldImage.rows[0].image_url);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
      }

      // --------------------------
      // 3️⃣ Upsert profile
      // --------------------------
      await db.query(
        `
        INSERT INTO jobseeker_profiles
          (user_id, experience, bio, resume_url, image_url, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET
          experience = EXCLUDED.experience,
          bio = EXCLUDED.bio,
          resume_url = COALESCE(EXCLUDED.resume_url, jobseeker_profiles.resume_url),
          image_url = COALESCE(EXCLUDED.image_url, jobseeker_profiles.image_url),
          updated_at = NOW()
        `,
        [req.user.id, experience, bio, newResumeUrl, newImageUrl]
      );

      // --------------------------
      // 4️⃣ Update user name
      // --------------------------
      await db.query("UPDATE users SET name = $1 WHERE id = $2", [name, req.user.id]);

      // --------------------------
      // 5️⃣ Handle skills
      // --------------------------
      const skillsArray = skills
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      await db.query("DELETE FROM jobseeker_skills WHERE user_id = $1", [req.user.id]);

      for (const skill of skillsArray) {
        let skillId;
        const skillResult = await db.query("SELECT id FROM skills WHERE name = $1", [skill]);
        if (skillResult.rows.length === 0) {
          const newSkill = await db.query("INSERT INTO skills (name) VALUES ($1) RETURNING id", [skill]);
          skillId = newSkill.rows[0].id;
        } else {
          skillId = skillResult.rows[0].id;
        }
        await db.query("INSERT INTO jobseeker_skills (user_id, skill_id) VALUES ($1, $2)", [req.user.id, skillId]);
      }

      // --------------------------
      // 6️⃣ Update all existing applications with new resume
      // --------------------------
      if (newResumeUrl) {
        await db.query(
          `
          UPDATE applications
          SET resume_url = $1
          WHERE user_id = $2
          `,
          [newResumeUrl, req.user.id]
        );
      }

      await db.query("COMMIT");
      res.redirect("/jobseeker/profile");

    } catch (err) {
      await db.query("ROLLBACK");
      console.error("Error saving profile:", err);
      res.status(500).send("Failed to save profile");
    }
  }
);


router.get(
  "/jobs/:id/apply",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const jobId = req.params.id;
      const userId = req.user.id;

      // 1️⃣ Get resume from jobseeker_profile
      const profileResult = await db.query(
        "SELECT resume_url FROM jobseeker_profiles WHERE user_id = $1",
        [userId]
      );

      if (
        profileResult.rows.length === 0 ||
        !profileResult.rows[0].resume_url
      ) {
        return res.send(
          "Please upload your resume in your profile before applying."
        );
      }

      const resume_url = profileResult.rows[0].resume_url;

      // 2️⃣ Get full job details
      const jobQuery = `
      SELECT j.*, c.name AS company_name, cat.name AS category_name
      FROM jobs j
      JOIN companies c ON j.company_id = c.id
      JOIN categories cat ON j.category_id = cat.id
      WHERE j.id = $1
    `;
      const jobResult = await db.query(jobQuery, [jobId]);

      if (jobResult.rows.length === 0) {
        return res.send("Job not found.");
      }

      const job = jobResult.rows[0];

      // 3️⃣ Render the application page
      res.render("jobseeker/applications.ejs", { job, resume_url });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  }
);

router.post(
  "/applications/apply/:jobId",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const jobId = req.params.jobId;

      // 1️⃣ Check if user already applied
      const checkQuery = `
      SELECT id FROM applications 
      WHERE user_id = $1 AND job_id = $2
    `;
      const checkResult = await db.query(checkQuery, [userId, jobId]);

      if (checkResult.rows.length > 0) {
        return res.send("You have already applied for this job.");
      }

      // 2️⃣ Get resume from jobseeker_profile
      const profileResult = await db.query(
        "SELECT resume_url FROM jobseeker_profiles WHERE user_id = $1",
        [userId]
      );

      if (
        profileResult.rows.length === 0 ||
        !profileResult.rows[0].resume_url
      ) {
        return res.send(
          "Please upload your resume in your profile before applying."
        );
      }

      const resume_url = profileResult.rows[0].resume_url;

      // 3️⃣ Insert application into applications table
      const insertQuery = `
      INSERT INTO applications (user_id, job_id, resume_url)
      VALUES ($1, $2, $3)
    `;
      await db.query(insertQuery, [userId, jobId, resume_url]);

      // 4️⃣ Redirect back to dashboard with success
      res.redirect("/jobseeker/dashboard");
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  }
);

router.get(
  "/jobseeker/saved-jobs",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const userId = req.user.id;

      const query = `
      SELECT s.id AS saved_id, j.*, c.name AS company_name, cat.name AS category_name
      FROM saved_jobs s
      JOIN jobs j ON s.job_id = j.id
      JOIN companies c ON j.company_id = c.id
      JOIN categories cat ON j.category_id = cat.id
      WHERE s.user_id = $1
      ORDER BY s.saved_at DESC
    `;

      const savedJobs = (await db.query(query, [userId])).rows;

      // Optionally, get list of jobs already applied to
      const appliedQuery = "SELECT job_id FROM applications WHERE user_id = $1";
      const appliedJobs = (await db.query(appliedQuery, [userId])).rows.map(
        (r) => r.job_id
      );

      res.render("jobseeker/saved.ejs", { savedJobs, appliedJobs });
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  }
);

router.get(
  "/jobs/:jobId/save",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const jobId = req.params.jobId;

      // Check if already saved
      const checkQuery =
        "SELECT id FROM saved_jobs WHERE user_id = $1 AND job_id = $2";
      const checkResult = await db.query(checkQuery, [userId, jobId]);

      if (checkResult.rows.length > 0) {
        // Already saved, just redirect back (or show a message)
        return res.redirect("/jobseeker/saved-jobs");
      }

      // Insert into saved_jobs table
      const insertQuery =
        "INSERT INTO saved_jobs (user_id, job_id) VALUES ($1, $2)";
      await db.query(insertQuery, [userId, jobId]);

      // Redirect to saved jobs page or same page
      res.redirect("/jobseeker/saved-jobs");
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  }
);

router.post(
  "/saved/remove/:jobId",
  ensureAuthenticated,
  ensureRole("jobseeker"),
  async (req, res) => {
    try {
      const userId = req.user.id;
      const jobId = req.params.jobId;

      // Delete the saved job
      const deleteQuery =
        "DELETE FROM saved_jobs WHERE user_id = $1 AND job_id = $2";
      await db.query(deleteQuery, [userId, jobId]);

      // Redirect back to saved jobs page
      res.redirect("/jobseeker/saved-jobs");
    } catch (err) {
      console.error(err);
      res.status(500).send("Server Error");
    }
  }
);

router.get(
  "/jobs/:id",
  ensureAuthenticated,
  ensureRoles("jobseeker", "admin"),
  async (req, res) => {
    const jobId = req.params.id;
    try {
      const result = await db.query(
      `SELECT j.*, c.name AS company
       FROM jobs j
       JOIN companies c ON j.company_id = c.id
       WHERE j.id = $1`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send("Job not found");
    }

    res.render("job-details.ejs", {
      job: result.rows[0],
    });
    } catch (err) {
      console.log(err);
      res.status(500).send("Server error");
    }
  }
);

export default router;
