import { Router } from "express";
import { ensureAuthenticated, ensureRole } from "../../middlewares/auth.js";
import { upload } from "../../middlewares/upload.js";
import db from "../../db/db.js";
import path from "path";
import fs from "fs";

const router = Router();

router.get(
  "/employer/dashboard",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    try {
      const employerId = req.user.id;

      // Total jobs
      const jobsResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM jobs j
         JOIN companies c ON j.company_id = c.id
         WHERE c.user_id = $1`,
        [employerId],
      );

      // Total applications (current applications table)
      const applicationsResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM applications a
         JOIN jobs j ON a.job_id = j.id
         JOIN companies c ON j.company_id = c.id
         WHERE c.user_id = $1`,
        [employerId],
      );

      // New applications (last 7 days)
      const newApplicationsResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM applications a
         JOIN jobs j ON a.job_id = j.id
         JOIN companies c ON j.company_id = c.id
         WHERE c.user_id = $1
           AND a.created_at >= NOW() - INTERVAL '7 days'`,
        [employerId],
      );

      // Hired candidates (from history table)
      const hiredResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM applications_history h
         JOIN jobs j ON h.job_id = j.id
         JOIN companies c ON j.company_id = c.id
         WHERE c.user_id = $1
           AND h.status = 'accepted'`,
        [employerId],
      );

      res.render("employer/dashboard.ejs", {
        user: req.user,
        stats: {
          totalJobs: jobsResult.rows[0].count,
          totalApplications: applicationsResult.rows[0].count,
          newApplications: newApplicationsResult.rows[0].count,
          hired: hiredResult.rows[0].count,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
    }
  },
);

router.get(
  "/employer/my-jobs",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    try {
      const employerId = req.user.id;

      const jobsResult = await db.query(
        `
        SELECT 
          j.id,
          j.title,
          j.job_type,
          j.location,
          j.is_active,
          j.created_at,
          COUNT(a.id) AS applications_count
        FROM jobs j
        JOIN companies c ON j.company_id = c.id
        LEFT JOIN applications a ON a.job_id = j.id
        WHERE c.user_id = $1
        GROUP BY j.id
        ORDER BY j.created_at DESC
        `,
        [employerId],
      );

      res.render("employer/my-jobs.ejs", {
        jobs: jobsResult.rows,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
    }
  },
);

router.get(
  "/employer/jobs/edit/:id",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const employerId = req.user.id;

    try {
      const jobResult = await db.query(
        `
        SELECT 
          j.id,
          j.title,
          j.job_type,
          j.experience_level,
          j.location,
          j.salary,
          j.description,
          j.requirements,
          j.remote,
          j.is_active,
          j.category_id
        FROM jobs j
        JOIN companies c ON j.company_id = c.id
        WHERE j.id = $1 AND c.user_id = $2
        `,
        [jobId, employerId],
      );

      if (jobResult.rows.length === 0) {
        return res.status(404).send("Job not found");
      }

      const categoriesResult = await db.query(
        "SELECT id, name FROM categories ORDER BY name",
      );

      res.render("employer/edit-job.ejs", {
        job: jobResult.rows[0], // ✅ job.id is NOW CORRECT
        categories: categoriesResult.rows,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
    }
  },
);

router.post(
  "/employer/jobs/edit/:id",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const jobId = Number(req.params.id);
    const employerId = req.user.id;

    try {
      const result = await db.query(
        `UPDATE jobs
         SET title = $1,
             job_type = $2,
             experience_level = $3,
             location = $4,
             salary = $5,
             description = $6,
             requirements = $7,
             remote = $8,
             is_active = $9,
             category_id = $10,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $11
           AND company_id = (
             SELECT id FROM companies WHERE user_id = $12
           )
         RETURNING id`,
        [
          req.body.title,
          req.body.job_type, // ✅ FIXED
          req.body.experience_level,
          req.body.location,
          req.body.salary,
          req.body.description,
          req.body.requirements,
          req.body.remote === "true", // ✅ FIXED
          req.body.is_active === "true",
          req.body.category_id,
          jobId,
          employerId,
        ],
      );

      if (result.rowCount === 0) {
        return res.status(404).send("Job not found or not yours");
      }

      res.redirect("/employer/my-jobs");
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);

// Close a job (mark as inactive)
router.post(
  "/employer/jobs/close/:id",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const jobId = req.params.id;
    const employerId = req.user.id;

    try {
      // Ensure the job belongs to this employer
      const jobResult = await db.query(
        "SELECT * FROM jobs WHERE id = $1 AND company_id IN (SELECT id FROM companies WHERE user_id = $2)",
        [jobId, employerId]
      );

      if (jobResult.rows.length === 0) {
        return res.status(403).send("You are not authorized to close this job.");
      }

      // Update the job to inactive
      await db.query("UPDATE jobs SET is_active = false, updated_at = NOW() WHERE id = $1", [jobId]);

      // Redirect back to jobs page
      res.redirect("/employer/my-jobs");
    } catch (err) {
      console.error("Error closing job:", err);
      res.status(500).send("Server error");
    }
  }
);


router.get(
  "/employer/post-job",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const categoriesResult = await db.query(
      "SELECT id, name FROM categories ORDER BY name",
    );

    res.render("employer/post-job.ejs", {
      categories: categoriesResult.rows,
    });
  },
);

router.post(
  "/employer/jobs/create",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    try {
      const employerId = req.user.id;
      const remoteBool = req.body.remote === "true";
      const isActiveBool = req.body.is_active === "true";

      const {
        title,
        type,
        experience_level,
        location,
        salary,
        description,
        requirements,
        remote,
        is_active,
        category_id,
      } = req.body;

      // 1️⃣ Get employer company
      const companyResult = await db.query(
        "SELECT id FROM companies WHERE user_id = $1",
        [employerId],
      );

      if (companyResult.rows.length === 0) {
        return res.status(400).send("Company not found");
      }

      const companyId = companyResult.rows[0].id;

      // 2️⃣ Insert job
      await db.query(
        `
  INSERT INTO jobs
  (
    title,
    description,
    requirements,
    location,
    job_type,
    experience_level,
    salary,
    remote,
    is_active,
    company_id,
    category_id
  )
  VALUES
  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `,
        [
          title,
          description,
          requirements,
          location,
          type,
          experience_level,
          salary,
          remote === "true",
          is_active === "true",
          companyId,
          category_id,
        ],
      );

      res.redirect("/employer/my-jobs");
    } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
    }
  },
);

// GET /employer/applicants

router.get(
  "/employer/applicants",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const employerId = req.user.id;

    try {
      // Fetch all applicants for this employer's jobs
      const applicantsResult = await db.query(
        `
        SELECT 
          a.id AS applicant_id,
          u.name AS name,
          u.email,
          j.title AS job_title,
          a.resume_url,
          a.status,
          a.created_at AS applied_at
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN users u ON a.user_id = u.id
        JOIN companies c ON j.company_id = c.id
        WHERE c.user_id = $1
        ORDER BY a.created_at DESC
        `,
        [employerId]
      );

      const applicants = applicantsResult.rows.map(app => ({
        ...app,
        // resume_url comes straight from DB; no manipulation needed
        resume_url: app.resume_url || null
      }));

      // Stats for cards
      const statsResult = await db.query(
        `
        SELECT 
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'reviewed') AS reviewed,
          COUNT(*) FILTER (WHERE status = 'accepted') AS accepted
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        JOIN companies c ON j.company_id = c.id
        WHERE c.user_id = $1
        `,
        [employerId]
      );

      const stats = statsResult.rows[0];

      // Render EJS
      res.render("employer/applicants.ejs", { applicants, stats });
    } catch (err) {
      console.error("Error fetching applicants:", err);
      res.status(500).send("Server error");
    }
  }
);



router.post(
  "/employer/applicants/:id/status",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const applicationId = Number(req.params.id);
    const employerId = req.user.id;
    const { status } = req.body;

    try {
      if (status === "accepted" || status === "rejected") {
        // 1️⃣ Move the application to history before deleting
        await db.query(
          `
          INSERT INTO applications_history (user_id, job_id, resume_url, status, updated_at)
          SELECT user_id, job_id, resume_url, $1, NOW()
          FROM applications
          WHERE id = $2
          `,
          [status, applicationId],
        );

        // 2️⃣ Delete from applications
        const result = await db.query(
          `
          DELETE FROM applications a
          USING jobs j
          JOIN companies c ON j.company_id = c.id
          WHERE a.job_id = j.id
            AND a.id = $1
            AND c.user_id = $2
          RETURNING a.id
          `,
          [applicationId, employerId],
        );

        if (result.rowCount === 0) {
          return res.status(404).send("Application not found or not yours");
        }
      } else {
        // Update status for pending/reviewed
        const result = await db.query(
          `
          UPDATE applications a
          SET status = $1
          FROM jobs j
          JOIN companies c ON j.company_id = c.id
          WHERE a.job_id = j.id
            AND a.id = $2
            AND c.user_id = $3
          RETURNING a.id
          `,
          [status, applicationId, employerId],
        );

        if (result.rowCount === 0) {
          return res.status(404).send("Application not found or not yours");
        }
      }

      res.redirect("/employer/applicants");
    } catch (err) {
      console.error(err);
      res.status(500).send("Server error");
    }
  },
);

router.get(
  "/employer/company/profile",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    try {
      const employerId = req.user.id;

      // 1️⃣ Fetch company info
      const companyResult = await db.query(
        `SELECT *
         FROM companies
         WHERE user_id = $1`,
        [employerId],
      );

      if (companyResult.rows.length === 0) {
        return res.status(404).send("Company profile not found");
      }

      const company = companyResult.rows[0];

      // 2️⃣ Total jobs
      const jobsResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM jobs
         WHERE company_id = $1`,
        [company.id],
      );

      // 3️⃣ Total applications
      const applicationsResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM applications a
         JOIN jobs j ON a.job_id = j.id
         WHERE j.company_id = $1`,
        [company.id],
      );

      // 5️⃣ Hired candidates
      const hiredResult = await db.query(
        `SELECT COUNT(*) AS count
         FROM applications_history h
         JOIN jobs j ON h.job_id = j.id
         WHERE j.company_id = $1
           AND h.status = 'accepted'`,
        [company.id],
      );

      // 7️⃣ Build stats object (SAFE)
      const stats = {
        totalJobs: jobsResult.rows[0].count,
        totalApplications: applicationsResult.rows[0].count,
        hired: hiredResult.rows[0].count,
      };

      // 8️⃣ Render page
      res.render("employer/profile.ejs", {
        user: req.user,
        company,
        stats,
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Server error");
    }
  },
);

router.get(
  "/employer/profile/edit",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const result = await db.query(
      "SELECT * FROM companies WHERE user_id = $1",
      [req.user.id]
    );

    res.render("employer/edit-profile.ejs", {
      user: req.user,
      company: result.rows[0],
    });
  }
);

router.post(
  "/employer/profile/edit",
  ensureAuthenticated,
  ensureRole("employer"),
  async (req, res) => {
    const { name, email, phone, website, description } = req.body;

    await db.query(
      `UPDATE companies
       SET name = $1,
           email = $2,
           phone = $3,
           website = $4,
           description = $5
       WHERE user_id = $6`,
      [name, email, phone, website, description, req.user.id]
    );

    res.redirect("/employer/company/profile");
  }
);



export default router;
