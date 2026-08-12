const User = require("../models/User");
const calculateBMI = require("../utils/bmiCalculator");

const signup = async (req, res) => {
  const {
    name,
    email,
    password,
    age,
    weight,
    height,
    currentStateUser,
    activityLevel,
  } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "Email already in use" });
  }

  const { bmi, currentStateBMI } = calculateBMI(weight, height);

  const user = await User.create({
    name,
    email,
    password,
    age,
    weight,
    height,
    bmi,
    currentStateBMI,
    currentStateUser,
    activityLevel,
  });

  res.status(201).json({
    message: "Account created successfully",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
};

module.exports = { signup };
