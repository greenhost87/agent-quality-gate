import { readJsonObject } from '@/http/parse-json';

async function readResponseJsonObject(response: Response): Promise<object | null> {
  return readJsonObject(await response.text());
}

export async function loadPayload(response: Response): Promise<object> {
  const body = await readResponseJsonObject(response);
  if (body === null) throw new Error('invalid');
  return body;
}
