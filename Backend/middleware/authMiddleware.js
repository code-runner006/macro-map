const jwt = require("jsonwebtoken");
const User = require("../models/User");
const BlacklistedToken = require("../models/BlacklistedToken");

const protect = async (req, res, next) => {
  const token = req.cookies.jwt;

  if (!token) {
    return res.status(401).json({ message: "You are not logged in" });
  }

  const blacklisted = await BlacklistedToken.findOne({ token });
  if (blacklisted) {
    return res
      .status(401)
      .json({ message: "You have been logged out. Please log in again." });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const user = await User.findById(decoded.id);
  if (!user) {
    return res.status(401).json({ message: "User no longer exists" });
  }

  req.user = user;
  next();
};

module.exports = { protect };
