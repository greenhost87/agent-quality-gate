import { custom } from 'valibot';

export const PixelSchema = custom<`${number}px`>(
  (input): input is `${number}px` => typeof input === 'string' && /^\d+px$/u.test(input),
);
