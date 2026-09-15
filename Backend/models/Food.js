const mongoose = require("mongoose");

const foodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Food name is required"],
    trim: true,
  },
  category: {
    type: String,
    required: [true, "Category is required"],
    enum: [
      "Meat & Poultry",
      "Eggs & Dairy",
      "Grains & Bread",
      "Dals & Legumes",
      "Vegetables",
      "Fruits",
      "Oils & Fats",
      "Breakfast & Snacks",
      "Drinks & Beverages",
    ],
  },
  servingSize: {
    type: Number,
    required: [true, "Serving size is required"],
  },
  servingUnit: {
    type: String,
    required: [true, "Serving unit is required"],
  },
  calories: {
    type: Number,
    required: [true, "Calories is required"],
  },
  protein: {
    type: Number,
    required: [true, "Protein is required"],
  },
  carbs: {
    type: Number,
    required: [true, "Carbs is required"],
  },
  fat: {
    type: Number,
    required: [true, "Fat is required"],
  },
  maxDailyQuantity: {
    type: Number,
    required: [true, "Max daily quantity is required"],
  },
  maxPerMealQuantity: {
    type: Number,
    required: [true, "Max per meal quantity is required"],
  },
  mealRole: {
    type: String,
    required: [true, "Meal role is required"],
    enum: [
      "protein_primary",
      "protein_support",
      "carb_staple",
      "breakfast_staple",
      "vegetable",
      "fruit",
      "fat_condiment",
      "beverage",
      "snack",
    ],
  },
});

const Food = mongoose.model("Food", foodSchema);

module.exports = Food;
