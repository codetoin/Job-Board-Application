import { Router } from "express";
import passport from "passport";

const router = Router();


router.get("/login", (req, res) => {
  res.render("authentication/login.ejs");
});

router.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      return res.redirect("/register");
    }

    req.logIn(user, (err) => {
      if (err) return next(err);

      // 🔑 ROLE-BASED REDIRECT
      if (user.role === "jobseeker") {
        return res.redirect("/jobseeker/dashboard");
      } else if (user.role === "admin") {
        res.redirect("/admin/dashboard");
      } else {
        return res.redirect("/employer/dashboard");
      }
    });
  })(req, res, next);
});

export default router;
