import { defineNullishAbsenceRule } from '../nullish-absence.ts';

export default defineNullishAbsenceRule({
  messageId: 'mixedNullish',
  message: 'Do not mix absence forms in one type: {{forms}}.',
  allows: (forms) =>
    !(
      (forms.has('null') &&
        (forms.has('undefined') || forms.has('void') || forms.has('optional'))) ||
      (forms.has('optional') && forms.has('void'))
    ),
});
