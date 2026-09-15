const calculateMacros = (user) => {
  const { weight, height, age, gender, goalType, activityLevel } = user;

  let bmr;
  if (gender === "Male") {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  } else if (gender === "Female") {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161;
  } else {
    const maleBMR = 10 * weight + 6.25 * height - 5 * age + 5;
    const femaleBMR = 10 * weight + 6.25 * height - 5 * age - 161;
    bmr = (maleBMR + femaleBMR) / 2;
  }

  const activityMultipliers = {
    Sedentary: 1.2,
    Light: 1.375,
    Moderate: 1.55,
    "Very Active": 1.725,
  };

  const multiplier = activityMultipliers[activityLevel] || 1.2;
  let tdee = bmr * multiplier;

  if (goalType === "Bulk") {
    tdee += 300;
  } else if (goalType === "Cut") {
    tdee -= 400;
  }

  const calories = Math.round(tdee);
  const protein = Math.round(weight * 2);
  const fat = Math.round((calories * 0.25) / 9);
  const proteinCalories = protein * 4;
  const fatCalories = fat * 9;
  const carbCalories = calories - proteinCalories - fatCalories;
  const carbs = Math.round(carbCalories / 4);

  return {
    calories,
    protein,
    carbs: carbs > 0 ? carbs : 0,
    fat,
  };
};

module.exports = calculateMacros;
