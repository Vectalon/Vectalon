export class CreateLoginScreenEmailPasswordApi {
  async execute(): Promise<string> {
    return 'ok';
  }
}

export const createLoginScreenEmailPasswordApi = new CreateLoginScreenEmailPasswordApi();
