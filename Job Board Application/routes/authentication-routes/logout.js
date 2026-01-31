import { Router } from "express";
import bodyParser from "body-parser";

const router = Router();
 
router.get("/logout", (req, res, next) => {
  req.logout({ keepSessionInfo: false }, (err) => {
    if (err) return next(err);
    res.redirect("/"); // redirect to home after logout
  });
});

export default router;