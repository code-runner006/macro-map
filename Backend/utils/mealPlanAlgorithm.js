const DailyLog = require("../models/DailyLog");
const calculateMacros = require("./macroCalculator");

/* ══════════════════════════════════════════════════════════════════
   TUNING CONSTANTS
   ══════════════════════════════════════════════════════════════════ */

const CAL_TOLERANCE = 1.03;
const MACRO_CEILING = 1.15;
const TRIM_TOLERANCE = 1.05;
const TOPUP_FLOOR = 0.92;
const PROTEIN_AIM = 0.9;
const MIN_ITEM_CAL = 20;
const FILL_MIN_CAL = 25;
const FILL_LOOP_MAX = 8;

const ROLE_SHARE = {
  protein_support: 0.12,
  fat_condiment: 0.12,
  beverage: 0.15,
};

const MEAL_WEIGHT = { breakfast: 0.25, lunch: 0.35, dinner: 0.35, snack: 0.1 };

const DISPLAY_ORDER = {
  protein_primary: 1,
  snack: 1,
  breakfast_staple: 2,
  carb_staple: 2,
  vegetable: 3,
  fruit: 3,
  protein_support: 4,
  fat_condiment: 5,
  beverage: 6,
};

const TRIM_PRIORITY = [
  "fat_condiment",
  "beverage",
  "protein_support",
  "fruit",
  "snack",
  "vegetable",
  "carb_staple",
  "breakfast_staple",
  "protein_primary",
];

const MACROS = ["calories", "protein", "carbs", "fat"];
const DISCRETE_UNITS = ["piece", "slice", "tbsp", "tsp", "cup", "roti", "egg"];

/* ══════════════════════════════════════════════════════════════════
   NUMERIC HELPERS
   ══════════════════════════════════════════════════════════════════ */

const r1 = (n) => Math.round(n * 10) / 10;
const perUnit = (food, macro) => food[macro] / food.servingSize;

const calcNutrition = (food, qty) => ({
  calories: r1(perUnit(food, "calories") * qty),
  protein: r1(perUnit(food, "protein") * qty),
  carbs: r1(perUnit(food, "carbs") * qty),
  fat: r1(perUnit(food, "fat") * qty),
});

const qtyStep = (food) => {
  const unit = String(food.servingUnit || "").toLowerCase();
  if (DISCRETE_UNITS.includes(unit)) return 0.5;
  if (unit === "ml") return 25;
  return 5;
};

const floorToStep = (qty, step) => r1(Math.floor(qty / step + 1e-9) * step);

/* ══════════════════════════════════════════════════════════════════
   FOOD SELECTION
   ══════════════════════════════════════════════════════════════════ */

const byRole = (foods, role) => foods.filter((f) => f.mealRole === role);

const dailyLeft = (food, usedQty) =>
  food.maxDailyQuantity - (usedQty[food._id.toString()] || 0);

const pickFood = (foods, usedQty) => {
  const candidates = foods.filter((f) => dailyLeft(f, usedQty) > 0);
  if (!candidates.length) return null;
  candidates.sort(
    (a, b) =>
      (usedQty[a._id.toString()] || 0) / a.maxDailyQuantity -
      (usedQty[b._id.toString()] || 0) / b.maxDailyQuantity,
  );
  return candidates[0];
};

/**
 * Largest quantity of `food` that violates none of: its per-meal cap,
 * its remaining daily allowance, or any macro ceiling in `limits`.
 * A limit of undefined/null means "no ceiling for that macro."
 */
const sizeFood = (food, limits, usedQty) => {
  const left = dailyLeft(food, usedQty);
  if (left <= 0) return 0;

  let qty = Math.min(food.maxPerMealQuantity, left);

  for (const macro of MACROS) {
    const cap = limits[macro];
    if (cap === undefined || cap === null) continue;
    const rate = perUnit(food, macro);
    if (rate <= 0) continue;
    if (cap <= 0) return 0;
    qty = Math.min(qty, cap / rate);
  }

  return qty > 0 ? qty : 0;
};

/* ══════════════════════════════════════════════════════════════════
   MEAL OBJECT
   ══════════════════════════════════════════════════════════════════ */

const makeMeal = (mealNumber, mealType) => ({
  mealNumber,
  mealType,
  picked: [],
  mealNutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
});

const recalcMeal = (meal) => {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  meal.picked.forEach((p) =>
    MACROS.forEach((m) => {
      t[m] = r1(t[m] + p.n[m]);
    }),
  );
  meal.mealNutrition = t;
};

/**
 * FIX: mandatory items now get their fallback step even when rawQty
 * arrives as exactly 0 — previously the function returned before that
 * logic could run, which is why tight ceilings silently dropped foods
 * that were supposed to be guaranteed.
 */
const place = (meal, food, rawQty, usedQty, opts = {}) => {
  const { mandatory = false } = opts;
  if (!food) return false;
  if (rawQty <= 0 && !mandatory) return false;

  const step = qtyStep(food);
  let qty = rawQty > 0 ? floorToStep(rawQty, step) : 0;

  if (qty <= 0) {
    if (!mandatory) return false;
    const cap = Math.min(food.maxPerMealQuantity, dailyLeft(food, usedQty));
    if (step > cap) return false;
    qty = step;
  }

  const n = calcNutrition(food, qty);
  if (!mandatory && n.calories < MIN_ITEM_CAL && n.protein < 3) return false;

  meal.picked.push({ food, qty, n });
  MACROS.forEach((m) => {
    meal.mealNutrition[m] = r1(meal.mealNutrition[m] + n[m]);
  });

  const id = food._id.toString();
  usedQty[id] = r1((usedQty[id] || 0) + qty);
  return true;
};

const bump = (meal, item, extraRaw, usedQty) => {
  const step = qtyStep(item.food);
  const roomInMeal = item.food.maxPerMealQuantity - item.qty;
  const add = floorToStep(
    Math.min(extraRaw, roomInMeal, dailyLeft(item.food, usedQty)),
    step,
  );
  if (add <= 0) return 0;

  item.qty = r1(item.qty + add);
  item.n = calcNutrition(item.food, item.qty);
  const id = item.food._id.toString();
  usedQty[id] = r1((usedQty[id] || 0) + add);
  recalcMeal(meal);
  return add;
};

/* ══════════════════════════════════════════════════════════════════
   TARGET RESOLUTION
   ══════════════════════════════════════════════════════════════════ */

const resolveTargets = (user) => {
  const t = user.targets || {};
  const set = (v) => typeof v === "number" && v > 0;
  const anyManual =
    set(t.protein) || set(t.carbs) || set(t.fat) || set(t.calories);

  if (!anyManual && !user.goalType) return null;

  const base = calculateMacros({
    weight: user.weight,
    height: user.height,
    age: user.age,
    gender: user.gender,
    activityLevel: user.activityLevel,
    goalType: user.goalType || "Maintain",
  });

  const protein = set(t.protein) ? t.protein : base.protein;
  const fat = set(t.fat) ? t.fat : null;
  const carbs = set(t.carbs) ? t.carbs : null;

  let calories = set(t.calories) ? t.calories : null;
  if (calories === null) {
    calories =
      fat !== null && carbs !== null
        ? Math.round(protein * 4 + carbs * 4 + fat * 9)
        : base.calories;
  }

  const finalFat =
    fat !== null ? fat : Math.max(0, Math.round((calories * 0.25) / 9));
  const finalCarbs =
    carbs !== null
      ? carbs
      : Math.max(0, Math.round((calories - protein * 4 - finalFat * 9) / 4));

  const macroCalories = protein * 4 + finalCarbs * 4 + finalFat * 9;
  const mismatch = Math.abs(macroCalories - calories) / calories;

  return {
    calories,
    protein,
    carbs: finalCarbs,
    fat: finalFat,
    mismatch: mismatch > 0.1 ? Math.round(macroCalories) : null,
  };
};

/* ══════════════════════════════════════════════════════════════════
   MEAL SEQUENCING
   ══════════════════════════════════════════════════════════════════ */

const SEQUENCES = {
  1: ["dinner"],
  2: ["breakfast", "dinner"],
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "snack", "dinner"],
  5: ["breakfast", "lunch", "snack", "snack", "dinner"],
};

const getSequence = (n) => SEQUENCES[n] || SEQUENCES[3];

/**
 * FIX: compares actual calories eaten so far against what's *expected*
 * at this point in the day (target × slotsUsed/totalSlots), not against
 * the full remaining/target ratio. The old version was ≈1 on a fresh
 * day and incorrectly upgraded every snack to a full meal before the
 * user had eaten anything.
 */
const applyThreshold = (types, pace) => {
  if (pace > 1.2) return types.map((t) => (t === "breakfast" ? t : "snack"));
  if (pace < 0.8) return types.map((t) => (t === "snack" ? "lunch" : t));
  return types;
};

const getRatios = (types) => {
  const total = types.reduce((s, t) => s + MEAL_WEIGHT[t], 0);
  return types.map((t) => MEAL_WEIGHT[t] / total);
};

/* ══════════════════════════════════════════════════════════════════
   MEAL BUILDERS
   ══════════════════════════════════════════════════════════════════ */

const buildStructuredMeal = (mealNumber, type, foods, budget, usedQty) => {
  const meal = makeMeal(mealNumber, type);
  const isBreakfast = type === "breakfast";

  const calCeil = budget.calories * CAL_TOLERANCE;
  const carbCeil = budget.carbs == null ? null : budget.carbs * MACRO_CEILING;
  const fatCeil = budget.fat == null ? null : budget.fat * MACRO_CEILING;

  const roomFor = (macro, ceil) =>
    ceil == null ? null : Math.max(0, ceil - meal.mealNutrition[macro]);
  const calRoom = () => Math.max(0, calCeil - meal.mealNutrition.calories);

  const supportPool = byRole(foods, "protein_support");
  const condimentPool = byRole(foods, "fat_condiment");
  const beveragePool = isBreakfast ? byRole(foods, "beverage") : [];

  let holdback = 0;
  if (supportPool.length) holdback += ROLE_SHARE.protein_support;
  if (condimentPool.length) holdback += ROLE_SHARE.fat_condiment;
  if (beveragePool.length) holdback += ROLE_SHARE.beverage;

  const coreCeil = budget.calories * (1 - holdback);
  const coreRoom = () => Math.max(0, coreCeil - meal.mealNutrition.calories);

  const notAlreadyIn = (pool) =>
    pool.filter((f) => !meal.picked.some((p) => p.food === f));

  /* ── 1. Primary protein ──
     FIX: no more artificial 75% fat sub-cap here. Protein gets the
     real fat ceiling; if that causes a fat overage, trimOverage now
     protects protein while fixing it, which is a better trade-off
     than pre-choking protein for foods that turn out not to need
     the room anyway. */
  const allPrimary = byRole(foods, "protein_primary");
  const dairy = allPrimary.filter((f) => f.category === "Eggs & Dairy");
  const nonDairy = allPrimary.filter((f) => f.category !== "Eggs & Dairy");
  const primaryPool = isBreakfast
    ? dairy.length
      ? dairy
      : nonDairy
    : nonDairy.length
      ? nonDairy
      : dairy;

  const pFood = pickFood(primaryPool, usedQty);
  if (pFood) {
    const raw = sizeFood(
      pFood,
      {
        protein: budget.protein * PROTEIN_AIM,
        calories: coreRoom(),
        carbs: roomFor("carbs", carbCeil),
        fat: roomFor("fat", fatCeil),
      },
      usedQty,
    );
    place(meal, pFood, raw, usedQty, { mandatory: true });
  }

  /* ── 2. Second protein source if still well short ── */
  if (meal.mealNutrition.protein < budget.protein * 0.7) {
    const p2 = pickFood(notAlreadyIn(primaryPool), usedQty);
    if (p2) {
      const raw = sizeFood(
        p2,
        {
          protein: budget.protein * PROTEIN_AIM - meal.mealNutrition.protein,
          calories: coreRoom(),
          carbs: roomFor("carbs", carbCeil),
          fat: roomFor("fat", fatCeil),
        },
        usedQty,
      );
      place(meal, p2, raw, usedQty);
    }
  }

  /* ── 3. Staple
     FIX: now mandatory, so a razor-thin fat/carb ceiling can no longer
     zero out the carb source entirely — that was the direct cause of
     the 0% carbs result on fat-dense food sets. */
  const bfStaples = byRole(foods, "breakfast_staple");
  const cbStaples = byRole(foods, "carb_staple");
  const staplePool = isBreakfast
    ? bfStaples.length
      ? bfStaples
      : cbStaples
    : cbStaples.length
      ? cbStaples
      : bfStaples;

  const sFood = pickFood(staplePool, usedQty);
  if (sFood) {
    const raw = sizeFood(
      sFood,
      {
        calories: coreRoom() * (isBreakfast ? 0.85 : 0.65),
        carbs: roomFor("carbs", carbCeil),
        fat: roomFor("fat", fatCeil),
      },
      usedQty,
    );
    place(meal, sFood, raw, usedQty, { mandatory: true });
  }

  /* ── 4. Vegetables — main meals, up to two ── */
  if (!isBreakfast) {
    const vegPool = byRole(foods, "vegetable");
    for (let i = 0; i < 2; i++) {
      if (coreRoom() < 30) break;
      const v = pickFood(notAlreadyIn(vegPool), usedQty);
      if (!v) break;
      const raw = sizeFood(
        v,
        {
          calories: coreRoom() * 0.6,
          carbs: roomFor("carbs", carbCeil),
          fat: roomFor("fat", fatCeil),
        },
        usedQty,
      );
      if (!place(meal, v, raw, usedQty)) break;
    }
  }

  /* ── 5. Helpers, each inside its reserved share ── */
  const addHelper = (pool, share) => {
    if (!pool.length || calRoom() <= 0) return;
    const f = pickFood(notAlreadyIn(pool), usedQty);
    if (!f) return;
    const raw = sizeFood(
      f,
      {
        calories: Math.min(budget.calories * share, calRoom()),
        carbs: roomFor("carbs", carbCeil),
        fat: roomFor("fat", fatCeil),
      },
      usedQty,
    );
    place(meal, f, raw, usedQty);
  };

  addHelper(supportPool, ROLE_SHARE.protein_support);
  addHelper(condimentPool, ROLE_SHARE.fat_condiment);
  addHelper(beveragePool, ROLE_SHARE.beverage);

  /* ── 6. Fill leftover calories ── */
  fillMeal(meal, foods, { calCeil, carbCeil, fatCeil }, usedQty);

  meal.picked.sort(
    (a, b) =>
      (DISPLAY_ORDER[a.food.mealRole] || 9) -
      (DISPLAY_ORDER[b.food.mealRole] || 9),
  );
  return meal;
};

const buildSnackMeal = (mealNumber, foods, budget, usedQty) => {
  const meal = makeMeal(mealNumber, "snack");

  const calCeil = budget.calories * CAL_TOLERANCE;
  const carbCeil = budget.carbs == null ? null : budget.carbs * MACRO_CEILING;
  const fatCeil = budget.fat == null ? null : budget.fat * MACRO_CEILING;
  const calRoom = () => Math.max(0, calCeil - meal.mealNutrition.calories);
  const roomFor = (macro, ceil) =>
    ceil == null ? null : Math.max(0, ceil - meal.mealNutrition[macro]);

  let pool = [...byRole(foods, "snack"), ...byRole(foods, "fruit")];
  if (!pool.length) {
    pool = [
      ...byRole(foods, "protein_support"),
      ...byRole(foods, "breakfast_staple"),
    ];
  }

  const main = pickFood(pool, usedQty);
  if (main) {
    const raw = sizeFood(
      main,
      {
        calories: calCeil * 0.75,
        carbs: roomFor("carbs", carbCeil),
        fat: roomFor("fat", fatCeil),
      },
      usedQty,
    );
    place(meal, main, raw, usedQty, { mandatory: true });
  }

  const bev = pickFood(
    byRole(foods, "beverage").filter(
      (f) => !meal.picked.some((p) => p.food === f),
    ),
    usedQty,
  );
  if (bev && calRoom() > 0) {
    const raw = sizeFood(
      bev,
      {
        calories: calRoom(),
        carbs: roomFor("carbs", carbCeil),
        fat: roomFor("fat", fatCeil),
      },
      usedQty,
    );
    place(meal, bev, raw, usedQty);
  }

  meal.picked.sort(
    (a, b) =>
      (DISPLAY_ORDER[a.food.mealRole] || 9) -
      (DISPLAY_ORDER[b.food.mealRole] || 9),
  );
  return meal;
};

/**
 * FIX: now loops through multiple candidate foods (up to FILL_LOOP_MAX)
 * instead of trying exactly one. The single-shot version left large
 * calorie gaps unfilled whenever the first candidate hit its own cap
 * quickly — this was the main driver behind the EGGONLY and Group F
 * undershoot results.
 */
const fillMeal = (meal, foods, ceilings, usedQty) => {
  const { calCeil, carbCeil, fatCeil } = ceilings;
  const calRoom = () => Math.max(0, calCeil - meal.mealNutrition.calories);
  const roomFor = (macro, ceil) =>
    ceil == null ? null : Math.max(0, ceil - meal.mealNutrition[macro]);

  const growable = ["carb_staple", "breakfast_staple", "vegetable"];
  for (const item of meal.picked.filter((p) =>
    growable.includes(p.food.mealRole),
  )) {
    if (calRoom() < FILL_MIN_CAL) return;
    const raw = sizeFood(
      item.food,
      {
        calories: calRoom(),
        carbs: roomFor("carbs", carbCeil),
        fat: roomFor("fat", fatCeil),
      },
      usedQty,
    );
    if (raw > 0) bump(meal, item, raw, usedQty);
  }

  let guard = 0;
  while (calRoom() >= FILL_MIN_CAL && guard < FILL_LOOP_MAX) {
    guard++;
    const extras = [
      ...byRole(foods, "vegetable"),
      ...byRole(foods, "carb_staple"),
      ...byRole(foods, "breakfast_staple"),
      ...byRole(foods, "fruit"),
      ...byRole(foods, "protein_support"),
    ].filter(
      (f) =>
        !meal.picked.some((p) => p.food === f) && dailyLeft(f, usedQty) > 0,
    );

    const extra = pickFood(extras, usedQty);
    if (!extra) break;

    const raw = sizeFood(
      extra,
      {
        calories: calRoom(),
        carbs: roomFor("carbs", carbCeil),
        fat: roomFor("fat", fatCeil),
      },
      usedQty,
    );
    if (!place(meal, extra, raw, usedQty)) break;
  }
};

/* ══════════════════════════════════════════════════════════════════
   RECONCILIATION
   ══════════════════════════════════════════════════════════════════ */

const sumTotals = (meals) => {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  meals.forEach((m) =>
    MACROS.forEach((k) => {
      t[k] = r1(t[k] + m.mealNutrition[k]);
    }),
  );
  return t;
};

/**
 * FIX: while total protein is still below 95% of its own target, this
 * refuses to shrink protein_primary/protein_support items to fix a
 * DIFFERENT macro's overage — it was previously cutting the exact food
 * responsible for delivering protein in order to fix a calorie or fat
 * overage, which is backwards. Falls back to allowing it if literally
 * nothing else can be trimmed, so the loop can never get stuck.
 */
const trimOverage = (meals, targets, usedQty) => {
  for (const macro of ["calories", "fat", "carbs", "protein"]) {
    const target = targets[macro];
    if (!target) continue;

    const ceiling = target * TRIM_TOLERANCE;
    let total = sumTotals(meals)[macro];
    if (total <= ceiling) continue;

    const proteinTotal = sumTotals(meals).protein;
    const protectProtein =
      macro !== "protein" &&
      targets.protein &&
      proteinTotal < targets.protein * 0.95;

    const gather = (excludeProtein) => {
      const list = [];
      meals.forEach((meal) =>
        meal.picked.forEach((item) => {
          if (item.n[macro] <= 0) return;
          if (
            excludeProtein &&
            ["protein_primary", "protein_support"].includes(item.food.mealRole)
          )
            return;
          list.push({ meal, item });
        }),
      );
      return list;
    };

    let candidates = gather(protectProtein);
    if (!candidates.length) candidates = gather(false);

    candidates.sort((a, b) => {
      const pa = TRIM_PRIORITY.indexOf(a.item.food.mealRole);
      const pb = TRIM_PRIORITY.indexOf(b.item.food.mealRole);
      if (pa !== pb) return pa - pb;
      return b.item.n[macro] - a.item.n[macro];
    });

    for (const { meal, item } of candidates) {
      if (total <= ceiling) break;

      const rate = perUnit(item.food, macro);
      if (rate <= 0) continue;

      const step = qtyStep(item.food);
      const excess = total - ceiling;

      let newQty = floorToStep(Math.max(0, item.qty - excess / rate), step);
      if (newQty === item.qty) newQty = floorToStep(item.qty - step, step);
      if (newQty < 0) newQty = 0;
      if (newQty === item.qty) continue;
      if (newQty <= 0 && meal.picked.length <= 1) continue;

      const id = item.food._id.toString();
      usedQty[id] = r1(Math.max(0, (usedQty[id] || 0) - (item.qty - newQty)));

      if (newQty <= 0) {
        meal.picked = meal.picked.filter((p) => p !== item);
      } else {
        item.qty = newQty;
        item.n = calcNutrition(item.food, newQty);
      }

      recalcMeal(meal);
      total = sumTotals(meals)[macro];
    }
  }
};

const topUp = (meals, targets, foods, usedQty) => {
  const headroom = (macro) =>
    targets[macro]
      ? Math.max(0, targets[macro] * TRIM_TOLERANCE - sumTotals(meals)[macro])
      : null;

  const mainMeals = meals.filter((m) => m.mealType !== "snack");
  const order = mainMeals.length ? mainMeals : meals;

  if (targets.protein) {
    for (const meal of order) {
      const gap = targets.protein - sumTotals(meals).protein;
      if (gap <= 1) break;

      const calHead = headroom("calories");
      if (calHead !== null && calHead < FILL_MIN_CAL) break;

      const pool = byRole(foods, "protein_primary");
      const f = pickFood(pool, usedQty);
      if (!f) break;

      const limits = {
        protein: gap,
        calories: calHead,
        carbs: headroom("carbs"),
        fat: headroom("fat"),
      };

      const existing = meal.picked.find((p) => p.food === f);
      const raw = sizeFood(f, limits, usedQty);
      if (raw <= 0) continue;

      if (existing) bump(meal, existing, raw, usedQty);
      else place(meal, f, raw, usedQty);
    }
  }

  if (targets.calories) {
    for (const meal of order) {
      const gap = targets.calories - sumTotals(meals).calories;
      if (gap < FILL_MIN_CAL) break;

      const limits = {
        calories: gap,
        carbs: headroom("carbs"),
        fat: headroom("fat"),
      };

      const growable = meal.picked.filter((p) =>
        ["carb_staple", "breakfast_staple", "vegetable"].includes(
          p.food.mealRole,
        ),
      );

      let moved = false;
      for (const item of growable) {
        const raw = sizeFood(item.food, limits, usedQty);
        if (raw > 0 && bump(meal, item, raw, usedQty) > 0) {
          moved = true;
          break;
        }
      }
      if (moved) continue;

      const pool = [
        ...byRole(foods, "carb_staple"),
        ...byRole(foods, "vegetable"),
        ...byRole(foods, "fruit"),
      ].filter((f) => !meal.picked.some((p) => p.food === f));

      const f = pickFood(pool, usedQty);
      if (!f) continue;
      place(meal, f, sizeFood(f, limits, usedQty), usedQty);
    }
  }
};

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
   ══════════════════════════════════════════════════════════════════ */

const generateMealPlan = async (user, availableFoods, numberOfMeals) => {
  const targets = resolveTargets(user);
  if (!targets) {
    return {
      error: true,
      message:
        "Please set your nutrition targets or provide your goal type so we can calculate recommended targets for you.",
    };
  }

  const today = new Date().toISOString().split("T")[0];
  const todayLog = await DailyLog.findOne({ userId: user._id, date: today });

  const remaining = { ...targets };
  const usedQty = {};
  availableFoods.forEach((f) => {
    usedQty[f._id.toString()] = 0;
  });

  if (todayLog) {
    MACROS.forEach((m) => {
      remaining[m] = r1(Math.max(0, targets[m] - todayLog.totalNutrition[m]));
    });
    todayLog.meals.forEach((entry) => {
      const id = entry.foodId ? entry.foodId.toString() : null;
      if (id && usedQty[id] !== undefined) {
        usedQty[id] = r1(usedQty[id] + entry.quantity);
      }
    });
  }

  if (!remaining.calories && !remaining.protein) {
    return {
      error: true,
      message: "You have already met your targets for today. Great job!",
    };
  }

  const primaries = byRole(availableFoods, "protein_primary");
  if (!primaries.length) {
    return {
      error: true,
      message:
        "You have no protein sources selected. Please add foods like chicken, eggs, fish, or daal to your available foods list.",
    };
  }

  let warning = null;
  if (primaries.length === 1) {
    warning = `You only have 1 protein source selected (${primaries[0].name
      .split("/")[0]
      .trim()}). Meals will be very repetitive. Consider adding chicken, eggs, fish, or daal.`;
  }

  const maxProtein = primaries.reduce(
    (sum, f) =>
      sum + perUnit(f, "protein") * Math.max(0, dailyLeft(f, usedQty)),
    0,
  );

  if (maxProtein < remaining.protein * 0.6) {
    return {
      error: true,
      message: `Your selected foods cannot meet your remaining protein goal of ${remaining.protein}g. They can provide at most ~${Math.round(
        maxProtein,
      )}g today. Please add more protein sources like chicken, eggs, or daal.`,
    };
  }
  if (!warning && maxProtein < remaining.protein) {
    warning = `Your available foods may not fully cover your remaining protein target of ${remaining.protein}g. The plan gets as close as possible.`;
  }

  /* Fat feasibility, mirroring the protein check above: if even the
     leanest available protein source would push fat past target while
     covering protein, say so rather than silently skewing the plan. */
  if (!warning && remaining.protein > 0 && remaining.fat) {
    const leanestRatio = Math.min(
      ...primaries.map((f) => (f.protein > 0 ? f.fat / f.protein : Infinity)),
    );
    const minFatForProtein = leanestRatio * remaining.protein;
    if (minFatForProtein > remaining.fat * 1.3) {
      warning = `Hitting your protein goal with your current protein sources will likely push fat above your ${remaining.fat}g target, since even your leanest option carries meaningful fat. Consider adding a leaner source like chicken breast, fish, or egg whites.`;
    }
  }

  if (!warning && targets.mismatch) {
    warning = `Your macro targets add up to about ${targets.mismatch} kcal, which differs from your calorie target of ${targets.calories} kcal. The plan respects both, so one of them will bind first.`;
  }

  const slots = Math.min(5, Math.max(3, numberOfMeals || 3));
  const consumedFraction = targets.calories
    ? 1 - remaining.calories / targets.calories
    : 0;

  const slotsUsed = Math.min(
    slots - 1,
    Math.max(0, Math.round(consumedFraction * slots)),
  );

  let types = getSequence(slots).slice(slotsUsed);

  if (slotsUsed > 0 && targets.calories) {
    const expectedByNow = targets.calories * (slotsUsed / slots);
    const actualSoFar = todayLog ? todayLog.totalNutrition.calories : 0;
    const pace = expectedByNow > 0 ? actualSoFar / expectedByNow : 1;
    types = applyThreshold(types, pace);
  }

  const ratios = getRatios(types);

  const meals = types.map((type, i) => {
    const budget = {
      calories: r1(remaining.calories * ratios[i]),
      protein: r1(remaining.protein * ratios[i]),
      carbs: remaining.carbs ? r1(remaining.carbs * ratios[i]) : null,
      fat: remaining.fat ? r1(remaining.fat * ratios[i]) : null,
    };
    const mealNumber = slotsUsed + i + 1;

    return type === "snack"
      ? buildSnackMeal(mealNumber, availableFoods, budget, usedQty)
      : buildStructuredMeal(mealNumber, type, availableFoods, budget, usedQty);
  });

  trimOverage(meals, remaining, usedQty);
  topUp(meals, remaining, availableFoods, usedQty);
  trimOverage(meals, remaining, usedQty);

  const finalMeals = meals
    .filter((m) => m.picked.length > 0)
    .map((m) => ({
      mealNumber: m.mealNumber,
      mealType: m.mealType,
      items: m.picked.map((p) => ({
        foodId: p.food._id,
        quantity: p.qty,
        calculatedNutrition: p.n,
      })),
      mealNutrition: m.mealNutrition,
    }));

  const totalNutrition = sumTotals(meals);

  return {
    meals: finalMeals,
    totalNutrition,
    warning,
    coverage: {
      targets: {
        calories: targets.calories,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
      },
      remainingAtGeneration: {
        calories: remaining.calories,
        protein: remaining.protein,
        carbs: remaining.carbs,
        fat: remaining.fat,
      },
    },
  };
};

module.exports = generateMealPlan;
