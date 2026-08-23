const express = require("express");
const {
  updateProfile,
  updateTargets,
  updateFoods,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.put("/profile", protect, updateProfile);
router.put("/targets", protect, updateTargets);
router.put("/foods", protect, updateFoods);

module.exports = router;
