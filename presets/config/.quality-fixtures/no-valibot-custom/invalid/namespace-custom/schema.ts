import * as v from 'valibot';

export const PixelSchema = v.custom<`${number}px`>(
  (input): input is `${number}px` => typeof input === 'string' && /^\d+px$/u.test(input),
);
