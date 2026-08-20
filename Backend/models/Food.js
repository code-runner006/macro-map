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
});

const Food = mongoose.model("Food", foodSchema);

module.exports = Food;
