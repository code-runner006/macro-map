const DailyLog = require("../models/DailyLog");
const calculateMacros = require("./macroCalculator");

// ── Pure helpers ──────────────────────────────────────────────────────────

const calcNutrition = (food, quantity) => {
  const m = quantity / food.servingSize;
  return {
    calories: parseFloat((food.calories * m).toFixed(1)),
    protein: parseFloat((food.protein * m).toFixed(1)),
    carbs: parseFloat((food.carbs * m).toFixed(1)),
    fat: parseFloat((food.fat * m).toFixed(1)),
  };
};

const byRole = (foods, role) => foods.filter((f) => f.mealRole === role);

// Prefer foods not used today; fall back to any with remaining daily allowance
const pickFood = (foods, usedQty) => {
  const unused = foods.filter((f) => !(usedQty[f._id.toString()] > 0));
  if (unused.length) return unused[0];
  return (
    foods.find((f) => (usedQty[f._id.toString()] || 0) < f.maxDailyQuantity) ||
    null
  );
};

const qtyForProtein = (food, targetProtein, usedQty) => {
  const used = usedQty[food._id.toString()] || 0;
  const dailyRem = food.maxDailyQuantity - used;
  if (dailyRem <= 0) return 0;
  const perUnit = food.protein / food.servingSize;
  if (perUnit <= 0) return 0;
  return parseFloat(
    Math.min(
      targetProtein / perUnit,
      food.maxPerMealQuantity,
      dailyRem,
    ).toFixed(1),
  );
};

const qtyForCalories = (food, targetCal, usedQty) => {
  const used = usedQty[food._id.toString()] || 0;
  const dailyRem = food.maxDailyQuantity - used;
  if (dailyRem <= 0) return 0;
  const perUnit = food.calories / food.servingSize;
  if (perUnit <= 0) return 0;
  return parseFloat(
    Math.min(targetCal / perUnit, food.maxPerMealQuantity, dailyRem).toFixed(1),
  );
};

const addItem = (food, qty, items, nutrition, usedQty) => {
  if (!food || qty <= 0) return;
  const n = calcNutrition(food, qty);
  items.push({ foodId: food._id, quantity: qty, calculatedNutrition: n });
  nutrition.calories = parseFloat((nutrition.calories + n.calories).toFixed(1));
  nutrition.protein = parseFloat((nutrition.protein + n.protein).toFixed(1));
  nutrition.carbs = parseFloat((nutrition.carbs + n.carbs).toFixed(1));
  nutrition.fat = parseFloat((nutrition.fat + n.fat).toFixed(1));
  usedQty[food._id.toString()] = (usedQty[food._id.toString()] || 0) + qty;
};

// ── Meal type sequencing ──────────────────────────────────────────────────

const getMealTypes = (n) =>
  ({
    3: ["breakfast", "lunch", "dinner"],
    4: ["breakfast", "lunch", "snack", "dinner"],
    5: ["breakfast", "lunch", "snack", "snack", "dinner"],
  })[n] || ["breakfast", "lunch", "dinner"];

const applyThreshold = (types, remFraction) => {
  if (remFraction < 0.2)
    return types.map((t) => (t === "breakfast" ? t : "snack"));
  if (remFraction > 0.85)
    return types.map((t) => (t === "snack" ? "lunch" : t));
  return types;
};

const getMacroRatios = (types) => {
  const w = { breakfast: 0.25, lunch: 0.35, dinner: 0.35, snack: 0.1 };
  const total = types.reduce((s, t) => s + w[t], 0);
  return types.map((t) => w[t] / total);
};

// ── Meal builders ─────────────────────────────────────────────────────────

const buildBreakfast = (mealNum, foods, mealProtein, mealCal, usedQty) => {
  const items = [];
  const n = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  // 1. Protein — prefer eggs for breakfast
  const eggs = foods.filter(
    (f) => f.mealRole === "protein_primary" && f.category === "Eggs & Dairy",
  );
  const otherProt = byRole(foods, "protein_primary").filter(
    (f) => f.category !== "Eggs & Dairy",
  );
  const protPool = eggs.length ? eggs : otherProt;
  const pFood = pickFood(protPool, usedQty);
  if (pFood)
    addItem(
      pFood,
      qtyForProtein(pFood, mealProtein, usedQty),
      items,
      n,
      usedQty,
    );

  // 2. Breakfast staple — fill remaining calories
  const bfPool = byRole(foods, "breakfast_staple").length
    ? byRole(foods, "breakfast_staple")
    : byRole(foods, "carb_staple");
  const sFood = pickFood(bfPool, usedQty);
  if (sFood) {
    const remCal = Math.max(0, mealCal - n.calories);
    addItem(
      sFood,
      qtyForCalories(sFood, remCal * 0.8, usedQty),
      items,
      n,
      usedQty,
    );
  }

  // 3. Optional protein support
  const supFood = pickFood(byRole(foods, "protein_support"), usedQty);
  if (supFood && n.calories < mealCal * 0.9) {
    const used = usedQty[supFood._id.toString()] || 0;
    const qty = parseFloat(
      Math.min(
        supFood.maxPerMealQuantity * 0.5,
        supFood.maxDailyQuantity - used,
      ).toFixed(1),
    );
    addItem(supFood, qty, items, n, usedQty);
  }

  // 4. Fat condiment
  const fatFood = pickFood(byRole(foods, "fat_condiment"), usedQty);
  if (fatFood) {
    const used = usedQty[fatFood._id.toString()] || 0;
    const qty = parseFloat(
      Math.min(
        fatFood.maxPerMealQuantity,
        fatFood.maxDailyQuantity - used,
      ).toFixed(1),
    );
    addItem(fatFood, qty, items, n, usedQty);
  }

  // 5. Beverage
  const bevFood = pickFood(byRole(foods, "beverage"), usedQty);
  if (bevFood) {
    const used = usedQty[bevFood._id.toString()] || 0;
    const qty = parseFloat(
      Math.min(
        bevFood.maxPerMealQuantity,
        bevFood.maxDailyQuantity - used,
      ).toFixed(1),
    );
    addItem(bevFood, qty, items, n, usedQty);
  }

  return { mealNumber: mealNum, items, mealNutrition: n };
};

const buildMainMeal = (mealNum, foods, mealProtein, mealCal, usedQty) => {
  const items = [];
  const n = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  // 1. Protein — prefer meat/daal over eggs for main meals
  const meatDaal = byRole(foods, "protein_primary").filter(
    (f) => f.category !== "Eggs & Dairy",
  );
  const allProt = byRole(foods, "protein_primary");
  const pFood = pickFood(meatDaal.length ? meatDaal : allProt, usedQty);
  if (pFood)
    addItem(
      pFood,
      qtyForProtein(pFood, mealProtein, usedQty),
      items,
      n,
      usedQty,
    );

  // 2. Carb staple — ~60% of remaining calories
  const cFood = pickFood(byRole(foods, "carb_staple"), usedQty);
  if (cFood) {
    const remCal = Math.max(0, mealCal - n.calories);
    addItem(
      cFood,
      qtyForCalories(cFood, remCal * 0.6, usedQty),
      items,
      n,
      usedQty,
    );
  }

  // 3. Vegetables — up to 2, fill remaining calories
  const vegs = byRole(foods, "vegetable");
  let vegCount = 0;
  for (const veg of vegs) {
    if (vegCount >= 2) break;
    const remCal = Math.max(0, mealCal - n.calories);
    if (remCal < 30) break;
    const qty = qtyForCalories(veg, remCal * 0.4, usedQty);
    if (qty > 0) {
      addItem(veg, qty, items, n, usedQty);
      vegCount++;
    }
  }

  // 4. Fat condiment
  const fatFood = pickFood(byRole(foods, "fat_condiment"), usedQty);
  if (fatFood) {
    const used = usedQty[fatFood._id.toString()] || 0;
    const qty = parseFloat(
      Math.min(
        fatFood.maxPerMealQuantity,
        fatFood.maxDailyQuantity - used,
      ).toFixed(1),
    );
    addItem(fatFood, qty, items, n, usedQty);
  }

  // 5. Optional protein support
  const supFood = pickFood(byRole(foods, "protein_support"), usedQty);
  if (supFood && n.protein < mealProtein * 0.9) {
    const used = usedQty[supFood._id.toString()] || 0;
    const qty = parseFloat(
      Math.min(
        supFood.maxPerMealQuantity * 0.5,
        supFood.maxDailyQuantity - used,
      ).toFixed(1),
    );
    addItem(supFood, qty, items, n, usedQty);
  }

  return { mealNumber: mealNum, items, mealNutrition: n };
};

const buildSnackMeal = (mealNum, foods, mealCal, usedQty) => {
  const items = [];
  const n = { calories: 0, protein: 0, carbs: 0, fat: 0 };

  // 1. Snack item or fruit
  const snackPool = [...byRole(foods, "snack"), ...byRole(foods, "fruit")];
  const sFood = pickFood(snackPool, usedQty);
  if (sFood) {
    const used = usedQty[sFood._id.toString()] || 0;
    const qty = parseFloat(
      Math.min(sFood.maxPerMealQuantity, sFood.maxDailyQuantity - used).toFixed(
        1,
      ),
    );
    addItem(sFood, qty, items, n, usedQty);
  }

  // 2. Optional beverage
  const bevFood = pickFood(byRole(foods, "beverage"), usedQty);
  if (bevFood && n.calories < mealCal * 0.7) {
    const used = usedQty[bevFood._id.toString()] || 0;
    const qty = parseFloat(
      Math.min(
        bevFood.maxPerMealQuantity,
        bevFood.maxDailyQuantity - used,
      ).toFixed(1),
    );
    addItem(bevFood, qty, items, n, usedQty);
  }

  return { mealNumber: mealNum, items, mealNutrition: n };
};

// ── Main export ───────────────────────────────────────────────────────────

const generateMealPlan = async (user, availableFoods, numberOfMeals) => {
  // ── Step 1: Resolve targets ─────────────────────────────────────
  let targets;
  const hasManualTargets =
    user.targets &&
    (user.targets.protein ||
      user.targets.calories ||
      user.targets.carbs ||
      user.targets.fat);

  if (hasManualTargets) {
    const p = user.targets.protein || 0;
    const f = user.targets.fat || 0;
    const c = user.targets.carbs || 0;
    targets = {
      protein: p,
      fat: f,
      carbs: c,
      calories: user.targets.calories || Math.round(p * 4 + c * 4 + f * 9),
    };
  } else if (user.goalType) {
    targets = calculateMacros(user);
  } else {
    return {
      error: true,
      message:
        "Please set your nutrition targets or provide your goal type so we can calculate recommended targets for you.",
    };
  }

  // ── Step 2: Today's log → remaining macros ──────────────────────
  const today = new Date().toISOString().split("T")[0];
  const todayLog = await DailyLog.findOne({ userId: user._id, date: today });

  let remaining = { ...targets };
  let mealsLoggedCount = 0;

  if (todayLog) {
    remaining.protein = Math.max(
      0,
      targets.protein - todayLog.totalNutrition.protein,
    );
    remaining.calories = Math.max(
      0,
      targets.calories - todayLog.totalNutrition.calories,
    );
    remaining.carbs = Math.max(
      0,
      targets.carbs - todayLog.totalNutrition.carbs,
    );
    remaining.fat = Math.max(0, targets.fat - todayLog.totalNutrition.fat);
    mealsLoggedCount = todayLog.meals.length;
  }

  // ── Step 3: Already met check ───────────────────────────────────
  if (
    !remaining.protein &&
    !remaining.calories &&
    !remaining.carbs &&
    !remaining.fat
  ) {
    return {
      error: true,
      message: "You have already met your targets for today. Great job!",
    };
  }

  // ── Step 4: Food composition validation ─────────────────────────
  const proteinPrimaries = byRole(availableFoods, "protein_primary");
  const carbStaples = byRole(availableFoods, "carb_staple");
  const bfStaples = byRole(availableFoods, "breakfast_staple");

  if (proteinPrimaries.length === 0) {
    return {
      error: true,
      message:
        "You have no protein sources selected. Please add foods like chicken, eggs, fish, or daal to your available foods list.",
    };
  }

  let warning = null;

  if (proteinPrimaries.length === 1) {
    warning = `You only have 1 protein source selected (${proteinPrimaries[0].name.split("/")[0].trim()}). Meals will be very repetitive. Consider adding chicken, eggs, fish, or daal.`;
  }

  // ── Step 5: Protein feasibility check ──────────────────────────
  const maxPossibleProtein = proteinPrimaries.reduce((total, food) => {
    return total + (food.protein / food.servingSize) * food.maxDailyQuantity;
  }, 0);

  if (maxPossibleProtein < remaining.protein * 0.6) {
    return {
      error: true,
      message: `Your selected foods cannot meet your protein goal of ${remaining.protein}g. Your foods can provide a maximum of ~${Math.round(maxPossibleProtein)}g protein. Please add more protein sources like chicken, eggs, or daal.`,
    };
  }

  if (!warning && maxPossibleProtein < remaining.protein) {
    warning = `Your available foods may not fully cover your protein target of ${remaining.protein}g. The plan gets as close as possible. Consider adding more protein sources.`;
  }

  // ── Step 6: Determine meal types with threshold adjustment ──────
  const remainingMeals = numberOfMeals - mealsLoggedCount;
  const effectiveMeals = Math.max(1, remainingMeals);

  let mealTypes = getMealTypes(effectiveMeals);

  if (mealsLoggedCount > 0 && todayLog) {
    const expectedConsumed =
      targets.calories * (mealsLoggedCount / numberOfMeals);
    const actualConsumed = todayLog.totalNutrition.calories;
    const remFraction = remaining.calories / targets.calories;
    mealTypes = applyThreshold(mealTypes, remFraction);
  }

  // ── Step 7: Distribute macros across meals ──────────────────────
  const ratios = getMacroRatios(mealTypes);

  // ── Step 8: Daily usage tracker ────────────────────────────────
  const usedQty = {};
  availableFoods.forEach((f) => {
    usedQty[f._id.toString()] = 0;
  });

  // ── Step 9: Build each meal ─────────────────────────────────────
  const meals = [];

  for (let i = 0; i < mealTypes.length; i++) {
    const type = mealTypes[i];
    const mealProt = parseFloat((remaining.protein * ratios[i]).toFixed(1));
    const mealCal = parseFloat((remaining.calories * ratios[i]).toFixed(1));
    const mealNumber = mealsLoggedCount + i + 1;

    let meal;
    if (type === "breakfast") {
      meal = buildBreakfast(
        mealNumber,
        availableFoods,
        mealProt,
        mealCal,
        usedQty,
      );
    } else if (type === "snack") {
      meal = buildSnackMeal(mealNumber, availableFoods, mealCal, usedQty);
    } else {
      meal = buildMainMeal(
        mealNumber,
        availableFoods,
        mealProt,
        mealCal,
        usedQty,
      );
    }

    meals.push(meal);
  }

  // ── Step 10: Total nutrition across all meals ───────────────────
  const totalNutrition = meals.reduce(
    (total, meal) => {
      total.calories = parseFloat(
        (total.calories + meal.mealNutrition.calories).toFixed(1),
      );
      total.protein = parseFloat(
        (total.protein + meal.mealNutrition.protein).toFixed(1),
      );
      total.carbs = parseFloat(
        (total.carbs + meal.mealNutrition.carbs).toFixed(1),
      );
      total.fat = parseFloat((total.fat + meal.mealNutrition.fat).toFixed(1));
      return total;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return { meals, totalNutrition, warning };
};

module.exports = generateMealPlan;
