const Food = require("../models/Food");

const getAllFoods = async (req, res) => {
  const search = req.query.search || "";

  const foods = await Food.find({
    name: { $regex: search, $options: "i" },
  }).sort({ category: 1, name: 1 });

  res.status(200).json({
    count: foods.length,
    foods,
  });
};

const getFoodById = async (req, res) => {
  const food = await Food.findById(req.params.id);

  if (!food) {
    return res.status(404).json({ message: "Food not found" });
  }

  res.status(200).json({ food });
};

module.exports = { getAllFoods, getFoodById };
