// src/services/CreateLoginScreenEmailPasswordApi.ts
// Simulated auth API — swap the body for a real fetch() to your backend.

export class CreateLoginScreenEmailPasswordApi {
  async execute(email: string, password: string): Promise<string> {
    // Simulate network latency.
    await new Promise(resolve => setTimeout(resolve, 50));
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    return 'ok';
  }
}

export const createLoginScreenEmailPasswordApi = new CreateLoginScreenEmailPasswordApi();
