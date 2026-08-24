const express = require("express");
const {
  getTodayLog,
  addMeal,
  deleteMeal,
  getHistory,
} = require("../controllers/logController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/today", protect, getTodayLog);
router.get("/history", protect, getHistory);
router.post("/add", protect, addMeal);
router.delete("/entry/:entryId", protect, deleteMeal);

module.exports = router;
