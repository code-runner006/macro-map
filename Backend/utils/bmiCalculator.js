const calculateBMI = (weight, height) => {
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);
  const roundedBMI = Math.round(bmi * 10) / 10;

  let category;

  if (roundedBMI < 18.5) {
    category = "Underweight";
  } else if (roundedBMI < 25) {
    category = "Normal";
  } else if (roundedBMI < 30) {
    category = "Overweight";
  } else {
    category = "Obese";
  }

  return {
    bmi: roundedBMI,
    currentStateBMI: category,
  };
};

module.exports = calculateBMI;
