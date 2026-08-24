import * as v from 'valibot';

export const ProjectSchema = v.object({
  tags: v.array(v.string()),
});
