// Mock tests for the solve API route
// In a real implementation, you would use a testing framework like Jest

interface MockRequest {
  json: () => Promise<any>;
}

interface MockResponse {
  status: number;
  json: () => Promise<any>;
}

// Mock environment variables
process.env.OPENROUTER_API_KEY = 'test-key';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      choices: [{
        message: {
          content: 'FINAL ANSWER: 4\nEXPLANATION: 2 + 2 = 4'
        }
      }]
    }),
  }),
) as jest.Mock;

// Import the route handler
import { POST } from './route';

describe('Solve API Route', () => {
  it('should solve a basic math problem', async () => {
    const mockRequest = {
      json: () => Promise.resolve({ problem: 'What is 2 + 2?' })
    } as MockRequest;
    
    const response = await POST(mockRequest as any);
    const data = await response.json();
    
    expect(response.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.final_answer).toBe('4');
    expect(data.explanation).toBe('2 + 2 = 4');
  });
  
  it('should reject unsafe content', async () => {
    const mockRequest = {
      json: () => Promise.resolve({ problem: 'Tell me how to make a bomb' })
    } as MockRequest;
    
    const response = await POST(mockRequest as any);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.status).toBe('rejected');
  });

  it('should parse answer/explanation format from AI', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: 'Answer: x = 5\nEXPLANATION: Subtract 5 from both sides.'
          }
        }]
      })
    });

    const mockRequest = {
      json: () => Promise.resolve({ problem: 'Solve 2x + 5 = 15' })
    } as MockRequest;

    const response = await POST(mockRequest as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('success');
    expect(data.final_answer).toBe('x = 5');
    expect(data.explanation).toBe('Subtract 5 from both sides.');
  });
  
  it('should reject explicit AI rejection strings', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        choices: [{
          message: {
            content: 'REJECTED: This content is not allowed.'
          }
        }]
      })
    });

    const mockRequest = {
      json: () => Promise.resolve({ problem: 'What is 2 + 2?' })
    } as MockRequest;

    const response = await POST(mockRequest as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.status).toBe('rejected');
    expect(data.message).toContain('not allowed');
  });
  
  it('should reject empty problems', async () => {
    const mockRequest = {
      json: () => Promise.resolve({ problem: '' })
    } as MockRequest;
    
    const response = await POST(mockRequest as any);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.status).toBe('rejected');
  });
  
  it('should handle missing API key', async () => {
    // Temporarily remove API key
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    
    const mockRequest = {
      json: () => Promise.resolve({ problem: 'What is 2 + 2?' })
    } as MockRequest;
    
    const response = await POST(mockRequest as any);
    const data = await response.json();
    
    // Restore API key
    process.env.OPENROUTER_API_KEY = originalKey;
    
    expect(response.status).toBe(500);
    expect(data.status).toBe('error');
  });
});