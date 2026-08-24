import * as v from 'valibot';

export const ProjectSchema = v.object({
  name: v.string(),
  tags: v.array(v.string()),
});
