export class AddGreetCommandApi {
  async execute(): Promise<string> {
    return 'ok';
  }
}

export const addGreetCommandApi = new AddGreetCommandApi();
