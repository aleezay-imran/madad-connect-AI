import { resources } from './data/resources'

export const CATEGORY_LABELS = {
  food: 'Food / Ration',
  health: 'Healthcare',
  cancer: 'Cancer Care',
  education: 'Education / Scholarships',
  loan: 'Interest-free Loan',
  cash: 'Financial Aid',
  emergency: 'Emergency',
  orphan_widow: 'Widow / Orphan Support',
  disability: 'Disability Support',
  jobs: 'Jobs / Skills',
  disaster: 'Flood / Disaster Relief',
}

// Words that tell us which need the user is talking about.
// Includes English, Roman Urdu, and Urdu script.
const KEYWORDS = {
  food: ['food', 'ration', 'rashan', 'khana', 'hungry', 'hunger', 'meal', 'meals', 'bhook', 'aata', 'flour', 'راشن', 'کھانا', 'بھوک'],
  health: ['health', 'hospital', 'treatment', 'medicine', 'medical', 'doctor', 'surgery', 'operation', 'dialysis', 'sick', 'illness', 'ilaj', 'ilaaj', 'bimar', 'bimari', 'dawai', 'علاج', 'بیمار', 'بیماری', 'ہسپتال'],
  cancer: ['cancer', 'tumor', 'tumour', 'chemo', 'chemotherapy', 'کینسر'],
  education: ['school', 'fee', 'fees', 'scholarship', 'university', 'college', 'tuition', 'student', 'students', 'admission', 'education', 'parhai', 'padhai', 'taleem', 'فیس', 'سکالرشپ', 'تعلیم', 'اسکول'],
  loan: ['loan', 'loans', 'qarz', 'qarza', 'business', 'shop', 'dukaan', 'karobar', 'قرض', 'کاروبار'],
  cash: ['money', 'cash', 'financial', 'income', 'poor', 'poverty', 'paisa', 'paise', 'paisay', 'gharib', 'ghareeb', 'garib', 'guzara', 'kharcha', 'stipend', 'پیسے', 'مالی', 'غریب'],
  emergency: ['emergency', 'accident', 'ambulance', 'fire', 'rescue', 'ایمرجنسی', 'حادثہ', 'ایمبولینس'],
  orphan_widow: ['widow', 'widowed', 'orphan', 'orphans', 'bewa', 'beva', 'yateem', 'yatim', 'بیوہ', 'یتیم'],
  disability: ['disabled', 'disability', 'handicapped', 'wheelchair', 'apahij', 'mazoor', 'معذور'],
  jobs: ['job', 'jobs', 'unemployed', 'employment', 'skill', 'skills', 'training', 'course', 'naukri', 'rozgar', 'hunar', 'نوکری', 'روزگار'],
  disaster: ['flood', 'floods', 'earthquake', 'disaster', 'sailab', 'selab', 'zalzala', 'سیلاب', 'زلزلہ'],
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^a-z\u0600-\u06FF]+/)
    .filter(Boolean)
}

function wordMatches(token, keyword) {
  return token === keyword || (keyword.length >= 5 && token.startsWith(keyword))
}

// Counts how many words in the text point to each need category.
export function detectNeeds(text) {
  const tokens = tokenize(text)
  const hits = {}

  for (const [category, words] of Object.entries(KEYWORDS)) {
    for (const word of words) {
      for (const token of tokens) {
        if (wordMatches(token, word)) {
          hits[category] = (hits[category] || 0) + 1
        }
      }
    }
  }

  // Cancer is also a healthcare need.
  if (hits.cancer && !hits.health) hits.health = 1

  return hits
}

// Ranks resources for needs, e.g. { health: 1, cancer: 1 }.
export function rankByNeeds(hits) {
  const needs = Object.keys(hits)

  const results = resources
    .map((resource) => {
      let score = 0
      const matchedCategories = []

      for (const category of needs) {
        if (resource.categories.includes(category)) {
          score += Math.min(hits[category], 3) * 2
          if (resource.categories[0] === category) score += 3
          if (category === 'cancer') score += 3
          matchedCategories.push(category)
        }
      }

      return { resource, score, matchedCategories }
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  return { needs, results }
}

// Keyword-based fallback, used when the AI is not available.
export function matchResources(text) {
  return rankByNeeds(detectNeeds(text))
}