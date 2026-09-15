const express = require("express");
const {
  getActivePlan,
  generatePlan,
  logActivePlan,
  discardPlan,
} = require("../controllers/mealplanController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getActivePlan);
router.post("/generate", protect, generatePlan);
router.post("/log", protect, logActivePlan);
router.delete("/", protect, discardPlan);

module.exports = router;
