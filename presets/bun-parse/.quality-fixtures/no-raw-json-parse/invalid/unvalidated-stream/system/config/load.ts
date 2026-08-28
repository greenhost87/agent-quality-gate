export async function loadStream(stream: ReadableStream): Promise<unknown> {
  return Bun.readableStreamToJSON(stream);
}
