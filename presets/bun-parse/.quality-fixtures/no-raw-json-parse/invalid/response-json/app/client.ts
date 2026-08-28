export async function readResponse(response: Response): Promise<unknown> {
  return response.json();
}
