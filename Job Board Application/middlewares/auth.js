// middlewares/auth.js
export function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    // User is logged in
    return next();
  }
  // Not logged in
  res.redirect("/login");
}

export function ensureRole(role) {
  return function (req, res, next) {
    if (req.user && req.user.role === role) {
      return next();
    }
    // User is logged in but doesn't have the correct role
    res.status(403).send("Forbidden: You don't have permission to access this page");
  };
}
export function ensureRoles(...roles) {
  return function (req, res, next) {
    if (req.user && roles.includes(req.user.role)) {
      return next();
    }
    res
      .status(403)
      .send("Forbidden: You don't have permission to access this page");
  };
}
