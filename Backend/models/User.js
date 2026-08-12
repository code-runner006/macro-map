const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    age: {
      type: Number,
      required: [true, "Age is required"],
    },
    weight: {
      type: Number,
      required: [true, "Weight is required"],
    },
    height: {
      type: Number,
      required: [true, "Height is required"],
    },
    bmi: {
      type: Number,
    },
    currentStateBMI: {
      type: String,
      enum: ["Underweight", "Normal", "Overweight", "Obese"],
    },
    currentStateUser: {
      type: String,
      enum: ["Underweight", "Normal", "Overweight", "Obese"],
    },
    activityLevel: {
      type: String,
      enum: ["Sedentary", "Light", "Moderate", "Very Active"],
    },
    goalType: {
      type: String,
      enum: ["Bulk", "Cut", "Maintain"],
    },
    targets: {
      protein: { type: Number },
      calories: { type: Number },
      carbs: { type: Number },
      fat: { type: Number },
    },
    availableFoods: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Food",
      },
    ],
  },
  {
    timestamps: true,
  },
);

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

module.exports = User;
