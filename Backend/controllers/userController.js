const User = require("../models/User");
const calculateBMI = require("../utils/bmiCalculator");

const updateProfile = async (req, res) => {
  const { name, age, weight, height, currentStateUser, activityLevel } =
    req.body;

  const updateData = {};

  if (name) updateData.name = name;
  if (age) updateData.age = age;
  if (activityLevel) updateData.activityLevel = activityLevel;
  if (currentStateUser) updateData.currentStateUser = currentStateUser;

  if (weight || height) {
    const newWeight = weight || req.user.weight;
    const newHeight = height || req.user.height;
    const { bmi, currentStateBMI } = calculateBMI(newWeight, newHeight);
    updateData.weight = newWeight;
    updateData.height = newHeight;
    updateData.bmi = bmi;
    updateData.currentStateBMI = currentStateBMI;
  }

  const user = await User.findByIdAndUpdate(req.user._id, updateData, {
    returnDocument: "after",
    runValidators: true,
  });

  res.status(200).json({
    message: "Profile updated successfully",
    user,
  });
};

const updateTargets = async (req, res) => {
  const { goalType, protein, calories, carbs, fat } = req.body;

  const updateData = {};

  if (goalType) updateData.goalType = goalType;
  if (protein) updateData["targets.protein"] = protein;
  if (calories) updateData["targets.calories"] = calories;
  if (carbs) updateData["targets.carbs"] = carbs;
  if (fat) updateData["targets.fat"] = fat;

  const user = await User.findByIdAndUpdate(req.user._id, updateData, {
    returnDocument: "after",
    runValidators: true,
  });

  res.status(200).json({
    message: "Targets updated successfully",
    user,
  });
};

const updateFoods = async (req, res) => {
  const { availableFoods } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { availableFoods },
    { returnDocument: "after", runValidators: true },
  ).populate("availableFoods");

  res.status(200).json({
    message: "Available foods updated successfully",
    user,
  });
};

module.exports = { updateProfile, updateTargets, updateFoods };
