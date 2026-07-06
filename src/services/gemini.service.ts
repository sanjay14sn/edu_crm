const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const MODEL_FALLBACKS = (
  process.env.GEMINI_MODEL_FALLBACKS ||
  'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-1.5-flash,gemini-1.5-flash-8b'
)
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

type QuizQuestion = {
  q: string;
  options: string[];
  correct: number;
  explanation?: string;
  difficulty?: string;
};

function uniqueModels() {
  return [...new Set([PRIMARY_MODEL, ...MODEL_FALLBACKS])];
}

function isQuotaOrRateLimitError(message: string) {
  return /quota|rate.?limit|429|resource exhausted|limit:\s*0/i.test(message);
}

function extractJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  return JSON.parse(candidate);
}

async function callGeminiModel(prompt: string, model: string) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      `Gemini API request failed (${response.status})`;
    throw new Error(message);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  const usageMetadata = payload?.usageMetadata || payload?.usage_metadata;

  return {
    result: extractJson(text),
    model,
    usage: {
      promptTokens: Number(usageMetadata?.promptTokenCount || 0),
      completionTokens: Number(usageMetadata?.candidatesTokenCount || 0),
      totalTokens: Number(usageMetadata?.totalTokenCount || 0),
    },
  };
}

async function callGemini(prompt: string, tenantId?: string, feature?: string) {
  const models = uniqueModels();
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const response = await callGeminiModel(prompt, model);
      if (tenantId && response.usage.totalTokens > 0) {
        const { recordAiTokenUsage } = await import('../services/usageTracker.service');
        await recordAiTokenUsage(tenantId, response.usage, feature);
      }
      return { result: response.result, model, usage: response.usage };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(message);
      console.warn(`Gemini model "${model}" failed: ${message}`);

      if (!isQuotaOrRateLimitError(message)) {
        throw lastError;
      }
    }
  }

  throw lastError || new Error('All configured Gemini models failed');
}

function normalizeQuizQuestions(raw: unknown, fallbackDifficulty?: string): QuizQuestion[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item: any) => {
      const options = Array.isArray(item?.options)
        ? item.options.map((option: unknown) => String(option ?? '').trim()).filter(Boolean)
        : [];

      while (options.length < 4) {
        options.push(`Option ${String.fromCharCode(65 + options.length)}`);
      }

      const correct = Number.isInteger(item?.correct) ? item.correct : 0;

      return {
        q: String(item?.q || item?.question || '').trim(),
        options: options.slice(0, 4),
        correct: Math.max(0, Math.min(correct, options.length - 1)),
        explanation: String(item?.explanation || '').trim(),
        difficulty: String(item?.difficulty || fallbackDifficulty || 'Medium'),
      };
    })
    .filter((item) => item.q.length > 0);
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildLocalQuizFallback(input: {
  topic: string;
  courseName: string;
  difficulty: string;
  count: number;
  existingTopics?: string[];
}) {
  const count = Math.max(1, Math.min(input.count || 10, 25));
  const topic = input.topic.trim() || `${input.courseName} fundamentals`;
  const courseName = input.courseName.trim() || 'Course';
  const difficulty = input.difficulty.trim() || 'Medium';
  const topicSeed = hashString(`${topic}:${(input.existingTopics || []).join('|')}`);

  const templates = [
    {
      q: `Which statement best describes ${topic} in the context of ${courseName}?`,
      options: [
        `It is a core concept used throughout ${courseName}`,
        'It is unrelated to practical development',
        'It only applies to legacy systems',
        'It is deprecated and should be avoided',
      ],
      explanation: `${topic} is a foundational topic in ${courseName} and appears in real project workflows.`,
    },
    {
      q: `What is the most practical first step when applying ${topic}?`,
      options: [
        'Understand requirements and expected outcomes',
        'Skip planning and start coding immediately',
        'Ignore edge cases until production',
        'Avoid testing completely',
      ],
      explanation: 'Strong outcomes start with clear requirements before implementation.',
    },
    {
      q: `Which approach helps avoid common mistakes with ${topic}?`,
      options: [
        'Follow best practices and validate with tests',
        'Hard-code values without documentation',
        'Disable error handling for speed',
        'Avoid code reviews',
      ],
      explanation: 'Best practices and testing reduce defects in production code.',
    },
    {
      q: `In ${courseName}, why is ${topic} important for learners?`,
      options: [
        'It improves job-ready skills and project quality',
        'It is only useful for certification exams',
        'It has no impact on real applications',
        'It slows down development with no benefit',
      ],
      explanation: `${topic} directly supports practical skills expected in ${courseName}.`,
    },
    {
      q: `Which resource type is most useful when studying ${topic}?`,
      options: [
        'Hands-on exercises with feedback',
        'Memorizing definitions without practice',
        'Ignoring official documentation',
        'Using outdated tutorials only',
      ],
      explanation: 'Hands-on practice with feedback leads to better retention.',
    },
    {
      q: `Which scenario best demonstrates practical use of ${topic}?`,
      options: [
        'Building a feature end-to-end with validation',
        'Reading theory without implementation',
        'Copying code without understanding',
        'Avoiding documentation entirely',
      ],
      explanation: `End-to-end implementation is the best way to master ${topic}.`,
    },
    {
      q: `What should you verify first when troubleshooting ${topic}?`,
      options: [
        'Inputs, assumptions, and expected behavior',
        'Only the final output screenshot',
        'Unrelated modules first',
        'Whether the IDE theme is dark mode',
      ],
      explanation: 'Correct troubleshooting starts with inputs and expected behavior.',
    },
    {
      q: `Which learning path helps you progress fastest in ${topic}?`,
      options: [
        'Concept -> example -> practice -> review',
        'Practice only with no theory',
        'Theory only with no practice',
        'Random tutorials without structure',
      ],
      explanation: 'Structured learning with practice and review works best.',
    },
    {
      q: `How can ${topic} improve your ${courseName} project quality?`,
      options: [
        'Better structure, reliability, and maintainability',
        'It only adds unnecessary complexity',
        'It replaces all other skills',
        'It is only useful in interviews',
      ],
      explanation: `${topic} improves real project quality when applied correctly.`,
    },
  ];

  const rotatedTemplates = [...templates.slice(topicSeed % templates.length), ...templates.slice(0, topicSeed % templates.length)];

  const questions: QuizQuestion[] = Array.from({ length: count }).map((_, index) => {
    const template = rotatedTemplates[index % rotatedTemplates.length];
    const correct = (topicSeed + index) % 4;
    const options = [...template.options];
    const [correctOption] = options.splice(correct, 1);
    options.unshift(correctOption);
    return {
      q: template.q,
      options,
      correct: 0,
      explanation: template.explanation,
      difficulty,
    };
  });

  return {
    title: `${topic} Quiz`,
    timerMinutes: count * 3,
    negativeMarking: '1 mark penalty for wrong answers',
    questions,
    source: 'fallback' as const,
    warning:
      'Gemini quota is unavailable for this API key. Generated a local fallback quiz. Update GEMINI_API_KEY or billing to use AI generation.',
  };
}

export async function generateQuizContent(input: {
  topic: string;
  courseName: string;
  difficulty: string;
  count: number;
  existingTopics?: string[];
  excludeQuestions?: string[];
  tenantId?: string;
}) {
  const count = Math.max(1, Math.min(input.count || 10, 25));
  const topic = input.topic.trim() || `${input.courseName} fundamentals`;
  const courseName = input.courseName.trim() || 'Course';
  const difficulty = input.difficulty.trim() || 'Medium';
  const existingTopics = (input.existingTopics || []).map((item) => item.trim()).filter(Boolean);
  const excludeQuestions = (input.excludeQuestions || []).map((item) => item.trim()).filter(Boolean).slice(0, 40);

  const prompt = `You are an expert technical trainer building LMS quiz content.

Create exactly ${count} multiple-choice questions for the course "${courseName}" focused ONLY on "${topic}".
Difficulty level: ${difficulty}.
${existingTopics.length ? `\nExisting quiz topics already used in this course (do NOT repeat or overlap with these): ${existingTopics.join(', ')}.` : ''}
${excludeQuestions.length ? `\nExisting question stems already used (do NOT repeat or closely paraphrase these):\n- ${excludeQuestions.join('\n- ')}` : ''}

Return ONLY valid JSON in this shape:
{
  "title": "string",
  "timerMinutes": number,
  "negativeMarking": "string",
  "questions": [
    {
      "q": "question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correct": 0,
      "explanation": "why the answer is correct",
      "difficulty": "${difficulty}"
    }
  ]
}

Rules:
- "correct" must be a 0-based index into options (0 to 3)
- Every question must have exactly 4 distinct options
- Questions must be practical and relevant to ${courseName}
- Focus strictly on "${topic}" and make the quiz clearly different from prior topics
- Title must mention "${topic}" and must not duplicate an existing quiz title
- Do not include markdown or commentary outside JSON`;

  try {
    const { result: parsed, model } = await callGemini(prompt, input.tenantId, 'lms_quiz');
    const questions = normalizeQuizQuestions(parsed?.questions, difficulty);

    if (!questions.length) {
      throw new Error('Gemini did not return valid quiz questions');
    }

    return {
      title: String(parsed?.title || `${topic} Quiz`).trim(),
      timerMinutes: Number(parsed?.timerMinutes) || count * 3,
      negativeMarking:
        String(parsed?.negativeMarking || '1 mark penalty for wrong answers').trim(),
      questions,
      source: 'gemini' as const,
      model,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (isQuotaOrRateLimitError(message)) {
      console.warn('Gemini quota/rate limit reached. Using local quiz fallback.');
      return buildLocalQuizFallback(input);
    }
    throw error;
  }
}

export async function generateAssignmentContent(input: {
  topic: string;
  courseName: string;
  difficulty: string;
  tenantId?: string;
}) {
  const topic = input.topic.trim() || `${input.courseName} applied task`;
  const courseName = input.courseName.trim() || 'Course';
  const difficulty = input.difficulty.trim() || 'Medium';

  const prompt = `Create an LMS assignment for "${courseName}" about "${topic}" at ${difficulty} difficulty.
Return ONLY JSON:
{
  "title": "string",
  "difficulty": "string",
  "problemStatement": "string",
  "tasks": ["task 1", "task 2", "task 3"],
  "expectedOutcomes": ["outcome 1", "outcome 2"],
  "evaluationCriteria": ["criteria 1", "criteria 2"]
}`;

  try {
    const { result, model } = await callGemini(prompt, input.tenantId, 'lms_assignment');
    return { ...result, source: 'gemini', model };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (isQuotaOrRateLimitError(message)) {
      return {
        title: `${topic} Applied Assignment`,
        difficulty,
        problemStatement: `Create a practical submission demonstrating ${topic} in ${courseName}.`,
        tasks: [
          `Research ${topic} concepts used in ${courseName}`,
          'Implement a working solution with clear documentation',
          'Submit evidence of testing and reflection',
        ],
        expectedOutcomes: ['Working deliverable', 'Clear documentation'],
        evaluationCriteria: ['Correctness 40%', 'Completeness 30%', 'Presentation 30%'],
        source: 'fallback',
        warning:
          'Gemini quota is unavailable for this API key. Generated a local fallback assignment.',
      };
    }
    throw error;
  }
}

function buildLocalJobPostingFallback(input: {
  title: string;
  company?: string;
  type?: string;
  location?: string;
}) {
  const title = input.title.trim() || 'Software Developer';
  const company = input.company?.trim() || 'our organization';
  const type = input.type?.trim() || 'Full-time';
  const location = input.location?.trim() || 'Hybrid';

  const skillMap: Record<string, string[]> = {
    frontend: ['React', 'TypeScript', 'HTML/CSS', 'Responsive UI', 'Git'],
    backend: ['Node.js', 'REST APIs', 'SQL/NoSQL', 'Authentication', 'Git'],
    fullstack: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'REST APIs', 'Git'],
    designer: ['Figma', 'UI/UX Principles', 'Wireframing', 'Prototyping', 'Design Systems'],
    devops: ['Docker', 'CI/CD', 'Linux', 'Cloud Basics', 'Monitoring'],
    data: ['Python', 'SQL', 'Data Analysis', 'Excel/Sheets', 'Visualization'],
  };

  const lower = title.toLowerCase();
  let skills = ['Communication', 'Problem Solving', 'Team Collaboration', 'Time Management'];
  if (/full.?stack|mern|mean/.test(lower)) skills = skillMap.fullstack;
  else if (/front.?end|react|ui developer/.test(lower)) skills = skillMap.frontend;
  else if (/back.?end|api|node/.test(lower)) skills = skillMap.backend;
  else if (/design|ux|ui\/ux|figma/.test(lower)) skills = skillMap.designer;
  else if (/devops|cloud|sre/.test(lower)) skills = skillMap.devops;
  else if (/data|analyst|science/.test(lower)) skills = skillMap.data;

  const description = [
    `${company} is hiring a ${title} (${type}) based in ${location}.`,
    '',
    'Roles & Responsibilities:',
    `- Deliver high-quality work aligned with the ${title} role expectations`,
    '- Collaborate with cross-functional teams on planning, development, and reviews',
    '- Follow coding/design best practices, documentation standards, and sprint goals',
    '- Participate in stand-ups, code/design reviews, and continuous improvement',
    '',
    'Daily Workflow:',
    '- Review assigned tasks and priorities for the day',
    '- Implement features/fixes with testing and peer feedback',
    '- Update task status and communicate blockers early',
  ].join('\n');

  return {
    description,
    requirements: skills,
    source: 'fallback' as const,
    warning:
      'Gemini quota is unavailable for this API key. Generated a local fallback job posting draft.',
  };
}

export async function generateJobPostingContent(input: {
  title: string;
  company?: string;
  type?: string;
  location?: string;
  tenantId?: string;
}) {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Job title is required');
  }

  const company = input.company?.trim() || 'the hiring company';
  const type = input.type?.trim() || 'Full-time';
  const location = input.location?.trim() || 'Hybrid / Flexible';

  const prompt = `You are an expert technical recruiter writing a student-facing job posting for an education CRM job portal.

Create a job posting draft for:
- Job Title: ${title}
- Company: ${company}
- Job Type: ${type}
- Location: ${location}

Return ONLY valid JSON in this shape:
{
  "description": "string",
  "requirements": ["skill 1", "skill 2", "skill 3", "skill 4", "skill 5"]
}

Rules for "description":
- 2 short paragraphs plus bullet sections for Roles & Responsibilities and Daily Workflow
- Practical, professional, and suitable for fresh graduates or bootcamp students
- Mention collaboration, quality standards, and learning mindset where relevant

Rules for "requirements":
- 5 to 8 comma-ready skill strings
- Match the job title stack and seniority realistically
- Include mix of technical and soft skills where appropriate
- Do not include markdown outside JSON`;

  try {
    const { result: parsed, model } = await callGemini(prompt, input.tenantId, 'job_posting');
    const description = String(parsed?.description || '').trim();
    const requirements = Array.isArray(parsed?.requirements)
      ? parsed.requirements.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : String(parsed?.requirements || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

    if (!description || !requirements.length) {
      throw new Error('Gemini did not return a valid job posting draft');
    }

    return {
      description,
      requirements,
      source: 'gemini' as const,
      model,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (isQuotaOrRateLimitError(message)) {
      console.warn('Gemini quota/rate limit reached. Using local job posting fallback.');
      return buildLocalJobPostingFallback(input);
    }
    throw error;
  }
}
