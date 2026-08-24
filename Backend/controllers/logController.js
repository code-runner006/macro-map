const DailyLog = require("../models/DailyLog");
const Food = require("../models/Food");

const getTodayLog = async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  let log = await DailyLog.findOne({
    userId: req.user._id,
    date: today,
  }).populate("meals.foodId");

  if (!log) {
    return res.status(200).json({
      message: "No log found for today",
      log: null,
    });
  }

  res.status(200).json({ log });
};

const addMeal = async (req, res) => {
  const { foodId, quantity } = req.body;
  const today = new Date().toISOString().split("T")[0];

  const food = await Food.findById(foodId);
  if (!food) {
    return res.status(404).json({ message: "Food not found" });
  }

  const multiplier = quantity / food.servingSize;
  const calculatedNutrition = {
    calories: parseFloat((food.calories * multiplier).toFixed(1)),
    protein: parseFloat((food.protein * multiplier).toFixed(1)),
    carbs: parseFloat((food.carbs * multiplier).toFixed(1)),
    fat: parseFloat((food.fat * multiplier).toFixed(1)),
  };

  let log = await DailyLog.findOne({
    userId: req.user._id,
    date: today,
  });

  if (!log) {
    log = await DailyLog.create({
      userId: req.user._id,
      date: today,
      meals: [],
      totalNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    });
  }

  log.meals.push({ foodId, quantity, calculatedNutrition });

  log.totalNutrition.calories = parseFloat(
    (log.totalNutrition.calories + calculatedNutrition.calories).toFixed(1),
  );
  log.totalNutrition.protein = parseFloat(
    (log.totalNutrition.protein + calculatedNutrition.protein).toFixed(1),
  );
  log.totalNutrition.carbs = parseFloat(
    (log.totalNutrition.carbs + calculatedNutrition.carbs).toFixed(1),
  );
  log.totalNutrition.fat = parseFloat(
    (log.totalNutrition.fat + calculatedNutrition.fat).toFixed(1),
  );

  await log.save();

  await log.populate("meals.foodId");

  res.status(201).json({
    message: "Meal added successfully",
    log,
  });
};

const deleteMeal = async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  const log = await DailyLog.findOne({
    userId: req.user._id,
    date: today,
  });

  if (!log) {
    return res.status(404).json({ message: "No log found for today" });
  }

  const meal = log.meals.id(req.params.entryId);
  if (!meal) {
    return res.status(404).json({ message: "Meal entry not found" });
  }

  log.totalNutrition.calories = parseFloat(
    (log.totalNutrition.calories - meal.calculatedNutrition.calories).toFixed(
      1,
    ),
  );
  log.totalNutrition.protein = parseFloat(
    (log.totalNutrition.protein - meal.calculatedNutrition.protein).toFixed(1),
  );
  log.totalNutrition.carbs = parseFloat(
    (log.totalNutrition.carbs - meal.calculatedNutrition.carbs).toFixed(1),
  );
  log.totalNutrition.fat = parseFloat(
    (log.totalNutrition.fat - meal.calculatedNutrition.fat).toFixed(1),
  );

  meal.deleteOne();

  await log.save();

  res.status(200).json({
    message: "Meal entry deleted successfully",
    log,
  });
};

const getHistory = async (req, res) => {
  const logs = await DailyLog.find({ userId: req.user._id })
    .sort({ date: -1 })
    .limit(7)
    .select("date totalNutrition");

  res.status(200).json({ logs });
};

module.exports = { getTodayLog, addMeal, deleteMeal, getHistory };
