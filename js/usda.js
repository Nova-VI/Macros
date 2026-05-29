import { getApiKey, getIncludeBranded } from './db.js';

const BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

const NUTRIENT_IDS = {
  calories: 1008, protein: 1003, carbs: 1005, fat: 1004, fiber: 1079,
  sugar: 2000, sodium: 1093, sat_fat: 1258, cholesterol: 1253, potassium: 1092,
  vit_a: 1106, vit_c: 1162, vit_d: 1114, calcium: 1087, iron: 1089
};

export async function searchUSDA(query) {
  const apiKey = getApiKey();
  if (!apiKey) return [];
  try {
    const includeBranded = getIncludeBranded();
    const dataTypes = includeBranded ? 'Foundation,SR%20Legacy,Branded' : 'Foundation,SR%20Legacy';
    
    const res = await fetch(`${BASE_URL}/foods/search?query=${encodeURIComponent(query)}&dataType=${dataTypes}&requireAllWords=true&pageSize=15&api_key=${apiKey}`);
    if (!res.ok) throw new Error("USDA Query Failed.");
    const data = await res.json();
    let results = data.foods || [];

    const q = query.toLowerCase();
    results.sort((a, b) => {
      const aName = a.description.toLowerCase();
      const bName = b.description.toLowerCase();
      const aStarts = aName.startsWith(q);
      const bStarts = bName.startsWith(q);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aName.length - bName.length;
    });

    return results;
  } catch (error) {
    console.error("USDA Search Error:", error);
    return [];
  }
}

export async function getUSDAFoodDetails(fdcId) {
  const apiKey = getApiKey();
  try {
    const res = await fetch(`${BASE_URL}/food/${fdcId}?api_key=${apiKey}`);
    if (!res.ok) throw new Error("USDA Detail Fetch Failed.");
    const data = await res.json();
    
    const getAmt = (id) => {
      const nutrient = data.foodNutrients.find(n => n.nutrient.id === id);
      return nutrient ? nutrient.amount : 0;
    };

    return {
      usda_fdc_id: data.fdcId, name: data.description, source: 'usda',
      serving_size_g: 100, serving_name: '', 
      macros: { calories: getAmt(NUTRIENT_IDS.calories), protein_g: getAmt(NUTRIENT_IDS.protein), carbs_g: getAmt(NUTRIENT_IDS.carbs), fat_g: getAmt(NUTRIENT_IDS.fat) },
      micros: {
        fiber_g: getAmt(NUTRIENT_IDS.fiber), sugar_g: getAmt(NUTRIENT_IDS.sugar), sodium_mg: getAmt(NUTRIENT_IDS.sodium),
        saturated_fat_g: getAmt(NUTRIENT_IDS.sat_fat), cholesterol_mg: getAmt(NUTRIENT_IDS.cholesterol), potassium_mg: getAmt(NUTRIENT_IDS.potassium),
        vitamin_a_ug: getAmt(NUTRIENT_IDS.vit_a), vitamin_c_mg: getAmt(NUTRIENT_IDS.vit_c), vitamin_d_ug: getAmt(NUTRIENT_IDS.vit_d),
        calcium_mg: getAmt(NUTRIENT_IDS.calcium), iron_mg: getAmt(NUTRIENT_IDS.iron)
      }
    };
  } catch (error) {
    console.error("USDA Detail Error:", error);
    return null;
  }
}