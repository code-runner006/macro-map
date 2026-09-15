const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/authRoutes");
const foodRoutes = require("./routes/foodRoutes");
const userRoutes = require("./routes/userRoutes");
const logRoutes = require("./routes/logRoutes");
const mealplanRoutes = require("./routes/mealplanRoutes");

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/foods", foodRoutes);
app.use("/api/user", userRoutes);
app.use("/api/logs", logRoutes);
app.use("/api/mealplan", mealplanRoutes);

app.get("/", (req, res) => {
  res.json({ message: "MacroMap API is running" });
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Something went wrong";

  res.status(statusCode).json({
    message,
  });
});

module.exports = app;
