const User = require("../models/User");
const calculateBMI = require("../utils/bmiCalculator");
const jwt = require("jsonwebtoken");

const createSendToken = (user, statusCode, res) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

  res.cookie("jwt", token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.status(statusCode).json({
    message: "Success",
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
    },
  });
};

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

  createSendToken(user, 201, res);
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please provide email and password" });
  }

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    return res.status(401).json({ message: "Invalid email or password" });
  }

  createSendToken(user, 200, res);
};

module.exports = { signup, login };
