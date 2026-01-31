import { Router } from "express";
import { ensureAuthenticated, ensureRole } from "../../middlewares/auth.js";
import db from "../../db/db.js";

const router = Router();

router.get(
  "/admin/dashboard",
  ensureAuthenticated,
  ensureRole("admin"),
  async (req, res) => {
    try {
      // Total users
      const usersResult = await db.query("SELECT COUNT(*) FROM users");

      // Total companies
      const companiesResult = await db.query("SELECT COUNT(*) FROM companies");

      // Total jobs
      const jobsResult = await db.query("SELECT COUNT(*) FROM jobs");

      // Total applications
      const applicationsResult = await db.query("SELECT COUNT(*) FROM applications");

      // Inactive jobs (is_active = false)
      const inactiveJobsResult = await db.query(
        "SELECT COUNT(*) FROM jobs WHERE is_active = false"
      );

      // Recent activity (simple text-based)
      const recentJobs = await db.query(
        "SELECT title FROM jobs ORDER BY created_at DESC LIMIT 3"
      );

      const recentUsers = await db.query(
        "SELECT name FROM users ORDER BY created_at DESC LIMIT 3"
      );

      const recentActivities = [
        ...recentJobs.rows.map(j => `New job posted: ${j.title}`),
        ...recentUsers.rows.map(u => `New user registered: ${u.name}`)
      ];

      res.render("admins/admin-dashboard.ejs", {
        totalUsers: usersResult.rows[0].count,
        totalCompanies: companiesResult.rows[0].count,
        totalJobs: jobsResult.rows[0].count,
        totalApplications: applicationsResult.rows[0].count,
        inactiveJobs: inactiveJobsResult.rows[0].count,
        recentActivities
      });

    } catch (error) {
      console.error("Admin dashboard error:", error);
      res.status(500).send("Server Error");
    }
  }
);




export default router;
