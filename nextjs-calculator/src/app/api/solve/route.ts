import { solveLinearOptimization, parseLinearOptimizationProblem, formatSolution } from '@/lib/linear-optimization';
import { NextResponse } from 'next/server';

// System prompt fixed server-side only
const SYSTEM_PROMPT = `You are an AI-powered math assistant that solves problems clearly and presents equations using LaTeX for maximum readability.

Your goal is to produce answers that are both mathematically correct and easy for humans to read.

---

OUTPUT STRUCTURE

1. Start with a short, natural sentence introducing the result.
2. Show the final answer clearly on its own line using bold formatting.
3. Provide a step-by-step explanation using short paragraphs or bullet points.
4. Use spacing to separate sections for readability.
5. Do NOT use labels like "Final Answer:" or "Explanation:".

---

LATEX RULES (VERY IMPORTANT)

Use LaTeX formatting for all mathematical expressions where it improves clarity.

• Inline math: wrap with ( ... )
• Display equations (important steps): wrap with [ ... ]

Use LaTeX for:

* Fractions: (\frac{a}{b})
* Exponents: (x^2)
* Roots: (\sqrt{x})
* Derivatives: (\frac{d}{dx}(x^2))
* Integrals: (\int x^2 \, dx)
* Trigonometry: (\sin(x), \cos(x), \tan(x))
* Equations and transformations
* Probability formulas

Avoid LaTeX for:

* Simple numbers (e.g., 2, 15, 300)
* Plain sentences

---

EXPLANATION STYLE

Adapt based on problem type:

• Algebra:
Show each step clearly using LaTeX:
[
2x + 5 = 15
]
[
2x = 10
]
[
x = 5
]

• Calculus:
State the rule, then apply it:
(e.g., power rule)

• Trigonometry:
Use standard identities in LaTeX

• Probability:
Show formula clearly:
[
P(E) = \frac{\text{favorable outcomes}}{\text{total outcomes}}
]

• Word problems:

* Briefly identify given values
* Convert to equations (in LaTeX)
* Solve step-by-step

---

SPECIAL GUIDANCE FOR PARAMETERS AND IDENTITIES

If the problem asks for a parameter such as "solve for a" in an equation with x, determine whether the equation must hold for all values of x or only for specific values.

* If it must hold for all x, compare coefficients of each power of x.
* If any coefficient equation is inconsistent, clearly state that no valid solution exists.
* Do not fabricate a solution when the equation is impossible or contradictory.

---

TONE & STYLE

* Clear and human-friendly
* Concise but complete
* Avoid overly academic or robotic phrasing
* Avoid long dense paragraphs

---

EXAMPLES

Example 1 (Algebra):

Solve (2x + 5 = 15)

**Answer:** (x = 5)

[
2x + 5 = 15
]

Subtract 5 from both sides:

[
2x = 10
]

Divide by 2:

[
x = 5
]

Example 2 (Calculus):

Find the derivative of (x^2 + 3x - 5)

**Answer:** (2x + 3)

Differentiate term by term using the power rule:

[
\frac{d}{dx}(x^2) = 2x
]

[
\frac{d}{dx}(3x) = 3
]

[
\frac{d}{dx}(-5) = 0
]

So the result is:

[
2x + 3
]

Example 3 (Probability):

What is the probability of rolling a 6?

**Answer:** (\frac{1}{6}) (≈ 0.167 or 16.7%)

[
P(6) = \frac{1}{6}
]

There are 6 equally likely outcomes, and only one favorable outcome.

Example 4 (Word Problem):

A train travels 300 km in 4 hours.

**Answer:** (75 \text{ km/h})

Speed is given by:

[
\text{Speed} = \frac{\text{Distance}}{\text{Time}}
]

[
\frac{300}{4} = 75
]

---

Always prioritize clarity, clean formatting, and proper LaTeX usage.`;

// Safety checks
const isRequestSafe = (problem: string): boolean => {
  // Check for potentially unsafe content
  const unsafePatterns = [
    /violence|kill|harm|illegal|drug|weapon/i,
    /system\s*prompt|instruction|config/i,
    /password|secret|key/i,
  ];
  
  return !unsafePatterns.some(pattern => pattern.test(problem));
};

// Sanitize input
const sanitizeInput = (input: string): string => {
  // Remove excessive whitespace and limit length
  return input.trim().substring(0, 1000);
};

const parseAIResponse = (aiResponse: string) => {
  const cleaned = aiResponse.trim();

  if (/^REJECTED:/i.test(cleaned)) {
    return {
      rejected: true,
      reason: cleaned.replace(/^REJECTED:\s*/i, '').trim() || 'Request rejected by AI safety filters'
    };
  }

  const explanationSplit = cleaned.split(/EXPLANATION\s*:/i);
  if (explanationSplit.length >= 2) {
    const firstPart = explanationSplit[0].trim();
    const answerMatch = firstPart.match(/^(?:FINAL ANSWER|Answer)\s*:\s*(.*)$/i);
    const finalAnswer = answerMatch ? answerMatch[1].trim() : firstPart;
    const explanation = explanationSplit.slice(1).join('EXPLANATION:').trim();
    return { finalAnswer, explanation };
  }

  const answerMatch = cleaned.match(/^(?:FINAL ANSWER|Answer)\s*:\s*(.*)$/im);
  if (answerMatch) {
    const finalAnswer = answerMatch[1].trim();
    const remainder = cleaned.slice(answerMatch.index! + answerMatch[0].length).trim();
    const explanation = remainder || cleaned;
    return { finalAnswer, explanation };
  }

  const noSolutionMatch = cleaned.match(/no (?:solution|valid value|possible value)|impossible/i);
  if (noSolutionMatch) {
    return {
      finalAnswer: 'No solution exists for the given problem.',
      explanation: cleaned
    };
  }

  return {
    finalAnswer: cleaned.split('\n')[0].trim() || cleaned,
    explanation: cleaned
  };
};

// Check if a problem is a linear optimization problem
const isLinearOptimizationProblem = (problem: string): boolean => {
  // Simple heuristic to detect linear optimization problems
  const keywords = [
    'maximize', 'minimize', 'profit', 'cost', 'production',
    'constraint', 'limit', 'maximum', 'minimum', 'optimize',
    'gewinn', 'maximieren', 'profit', 'arbeitsstunden', 'material'
  ];
  
  const lowerProblem = problem.toLowerCase();
  return keywords.some(keyword => lowerProblem.includes(keyword)) &&
         (lowerProblem.includes('car') || lowerProblem.includes('product') || lowerProblem.includes('item') || lowerProblem.includes('werkzeug'));
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { problem } = body;
    
    // Validate input
    if (!problem || typeof problem !== 'string') {
      return NextResponse.json(
        { 
          status: "rejected", 
          message: "No problem provided or invalid format" 
        }, 
        { status: 400 }
      );
    }
    
    // Sanitize input
    const sanitizedProblem = sanitizeInput(problem);
    
    // Safety check
    if (!isRequestSafe(sanitizedProblem)) {
      return NextResponse.json(
        { 
          status: "rejected", 
          message: "Request contains inappropriate content" 
        }, 
        { status: 400 }
      );
    }
// Check if this is a linear optimization problem
if (isLinearOptimizationProblem(sanitizedProblem)) {
  try {
    const lp = parseLinearOptimizationProblem(sanitizedProblem);
    if (lp) {
      const solution = solveLinearOptimization(lp);
      const explanation = formatSolution(solution, lp);
      
      // Round values for discrete problems
      const x = lp.discrete ? Math.round(solution.x) : solution.x;
      const y = lp.discrete ? Math.round(solution.y) : solution.y;
      const objectiveValue = lp.discrete ? Math.round(solution.objectiveValue) : solution.objectiveValue;
      
      return NextResponse.json({
        status: "success",
        task: sanitizedProblem,
        final_answer: `Produce ${x} units of ${lp.variables.x} and ${y} units of ${lp.variables.y} for maximum profit of Fr. ${objectiveValue.toLocaleString()}.`,
        explanation: explanation
      });
    } else {
      // Linear optimization problem detected but not supported
      return NextResponse.json(
        { 
          status: "error", 
          message: "This linear optimization problem is not currently supported. Please try a different type of math problem." 
        }, 
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Linear optimization error:', error);
    return NextResponse.json(
      { 
        status: "error", 
        message: "Error solving linear optimization problem. Please try a different type of math problem." 
      }, 
      { status: 500 }
    );
  }
}
    
    // Check for environment variables
    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterApiKey) {
      return NextResponse.json(
        { 
          status: "error", 
          message: "AI calculation service is currently unavailable. Please try again later or contact support." 
        }, 
        { status: 503 }
      );
    }
    
    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
        'X-Title': 'AI-Powered Calculator'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: sanitizedProblem }
        ],
        temperature: 0.2,
        stream: false
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', errorText);
      return NextResponse.json(
        { 
          status: "error", 
          message: "AI service temporarily unavailable" 
        }, 
        { status: 502 }
      );
    }
    
    const data = await response.json();
    const aiResponse = data?.choices?.[0]?.message?.content || '';
    
    const parsedResponse = parseAIResponse(aiResponse);
    if ((parsedResponse as any).rejected) {
      return NextResponse.json(
        { 
          status: "rejected", 
          message: (parsedResponse as any).reason || "Request rejected by AI safety filters" 
        }, 
        { status: 400 }
      );
    }
    
    // Return structured response
    return NextResponse.json({
      status: "success",
      task: sanitizedProblem,
      final_answer: parsedResponse.finalAnswer,
      explanation: parsedResponse.explanation
    });
    
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { 
        status: "error", 
        message: "Internal server error" 
      }, 
      { status: 500 }
    );
  }
}