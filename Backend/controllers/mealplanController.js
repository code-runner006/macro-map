const MealPlan = require("../models/MealPlan");
const User = require("../models/User");
const DailyLog = require("../models/DailyLog");
const generateMealPlan = require("../utils/mealPlanAlgorithm");

const getActivePlan = async (req, res) => {
  const plan = await MealPlan.findOne({ userId: req.user._id }).populate(
    "meals.items.foodId",
  );

  if (!plan) {
    return res.status(200).json({ message: "No active meal plan", plan: null });
  }

  res.status(200).json({ plan });
};

const generatePlan = async (req, res) => {
  const user = await User.findById(req.user._id).populate("availableFoods");

  if (!user.availableFoods || user.availableFoods.length === 0) {
    return res.status(400).json({
      message:
        "Please select your available foods first before generating a meal plan.",
    });
  }

  const result = await generateMealPlan(
    user,
    user.availableFoods,
    req.body.numberOfMeals || 3,
  );

  if (result.error) {
    return res.status(400).json({ message: result.message });
  }

  await MealPlan.findOneAndDelete({ userId: req.user._id });

  const plan = await MealPlan.create({
    userId: req.user._id,
    meals: result.meals,
    totalNutrition: result.totalNutrition,
    warning: result.warning,
  });

  await plan.populate("meals.items.foodId");

  res.status(201).json({
    message: "Meal plan generated successfully",
    plan,
    warning: result.warning,
    coverage: result.coverage,
  });
};

const logActivePlan = async (req, res) => {
  const plan = await MealPlan.findOne({ userId: req.user._id }).populate(
    "meals.items.foodId",
  );

  if (!plan) {
    return res.status(404).json({ message: "No active meal plan found" });
  }

  const today = new Date().toISOString().split("T")[0];

  let log = await DailyLog.findOne({ userId: req.user._id, date: today });

  if (!log) {
    log = await DailyLog.create({
      userId: req.user._id,
      date: today,
      meals: [],
      totalNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    });
  }

  for (const meal of plan.meals) {
    for (const item of meal.items) {
      log.meals.push({
        foodId: item.foodId._id,
        quantity: item.quantity,
        calculatedNutrition: item.calculatedNutrition,
      });

      log.totalNutrition.calories = parseFloat(
        (
          log.totalNutrition.calories + item.calculatedNutrition.calories
        ).toFixed(1),
      );
      log.totalNutrition.protein = parseFloat(
        (log.totalNutrition.protein + item.calculatedNutrition.protein).toFixed(
          1,
        ),
      );
      log.totalNutrition.carbs = parseFloat(
        (log.totalNutrition.carbs + item.calculatedNutrition.carbs).toFixed(1),
      );
      log.totalNutrition.fat = parseFloat(
        (log.totalNutrition.fat + item.calculatedNutrition.fat).toFixed(1),
      );
    }
  }

  await log.save();

  await MealPlan.findOneAndDelete({ userId: req.user._id });

  res.status(200).json({
    message: "Meal plan logged to today's daily log successfully",
    log,
  });
};

const discardPlan = async (req, res) => {
  const plan = await MealPlan.findOneAndDelete({ userId: req.user._id });

  if (!plan) {
    return res.status(404).json({ message: "No active meal plan found" });
  }

  res.status(200).json({ message: "Meal plan discarded successfully" });
};

module.exports = { getActivePlan, generatePlan, logActivePlan, discardPlan };
