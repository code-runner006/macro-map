const express = require("express");
const { getAllFoods, getFoodById } = require("../controllers/foodController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", protect, getAllFoods);
router.get("/:id", protect, getFoodById);

module.exports = router;
