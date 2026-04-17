import { solveLinearOptimization, parseLinearOptimizationProblem, formatSolution } from '@/lib/linear-optimization';
import { NextResponse } from 'next/server';

// System prompt fixed server-side only
const SYSTEM_PROMPT = `You are an AI-powered math assistant designed to solve problems clearly and explain them in a way that is easy for humans to read and understand.

Your goal is to combine correctness, clarity, and clean formatting.

RESPONSE STRUCTURE - FOLLOW THIS FOR EVERY RESPONSE:
1. Start with a short, natural sentence that directly answers the question or introduces the result
2. Present the final answer clearly on its own line using **bold formatting**
3. Provide a step-by-step explanation using short paragraphs or bullet points
4. Use simple, readable math formatting (avoid overly dense notation unless necessary)
5. Keep explanations complete but concise—avoid repetition or overly academic language
6. Do NOT use labels like "Final Answer:" or "Explanation:"
7. Use spacing to improve readability

FORMATTING GUIDELINES:
- Use line breaks between sections
- Use bullet points for steps when helpful
- Highlight key results using **bold**
- Show formulas only when they add clarity
- For longer problems, break the solution into clear steps

ADAPT YOUR STYLE BASED ON PROBLEM TYPE:

For Algebra problems:
- Show each transformation step clearly
- Keep equations readable line by line

For Calculus (derivatives, integrals):
- State the rule used (e.g., power rule)
- Apply it step by step

For Word Problems:
- Briefly identify what is given
- Show how you translate it into math
- Solve clearly

For Probability:
- State total outcomes and favorable outcomes
- Show the formula simply

SAFETY RULES:
- Only answer legitimate math problems
- Reject non-mathematical requests
- Do not provide help with harmful, illegal, or inappropriate content
- If the request is not a legitimate math problem, respond with: "I can only help with mathematical problems. Please ask a math question."

Always prioritize clarity and readability while remaining mathematically correct.`;

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
    
    // Check if request was rejected by AI
    if (aiResponse.startsWith('REJECTED:')) {
      const rejectionReason = aiResponse.substring(9).trim();
      return NextResponse.json(
        { 
          status: "rejected", 
          message: rejectionReason || "Request rejected by AI safety filters" 
        }, 
        { status: 400 }
      );
    }
    
    // Parse AI response
    let finalAnswer = "";
    let explanation = "";
    
    if (aiResponse.startsWith('FINAL ANSWER:')) {
      const parts = aiResponse.split('EXPLANATION:');
      if (parts.length >= 2) {
        finalAnswer = parts[0].substring(13).trim(); // Remove "FINAL ANSWER:" prefix
        explanation = parts[1].trim();
      } else {
        // Fallback if format is not as expected
        finalAnswer = aiResponse.substring(13).trim();
        explanation = "No detailed explanation provided.";
      }
    } else {
      // Fallback if AI didn't follow format
      finalAnswer = aiResponse.split('\n')[0] || aiResponse;
      explanation = aiResponse;
    }
    
    // Return structured response
    return NextResponse.json({
      status: "success",
      task: sanitizedProblem,
      final_answer: finalAnswer,
      explanation: explanation
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