export type PayloadObject = { [key: string]: Payload };
export type Payload = string | number | boolean | null | PayloadObject | Payload[];
