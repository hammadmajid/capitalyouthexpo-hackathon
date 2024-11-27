import { ApiFailure } from '@hsm/api-client';
import { z } from 'zod';
import { safeMessage } from './messages';
export function customerProfileError(error: unknown) {
  if (error instanceof z.ZodError) {
    const field = error.issues[0]?.path[0];
    if (field === 'age') return 'Enter an age from 18 to 120.';
    if (field === 'phone') return 'Enter a valid Pakistani mobile number.';
    if (field === 'fullName') return 'Enter your full name.';
    if (field === 'gender') return 'Choose your gender.';
    if (field === 'institution') return 'Use a shorter institution name.';
    return 'Check your profile details and try again.';
  }
  if (error instanceof ApiFailure && error.code === 'CONFLICT') {
    const field = error.problem.errors?.[0]?.path;
    if (field === 'fullName')
      return 'Your saved name requires identity review to change. Use your saved name to save the rest of your profile.';
    if (field === 'gender')
      return 'Your saved gender requires identity review to change. Use your saved gender to save the rest of your profile.';
    if (field === 'profilePhotoFileId')
      return 'This photo is not ready to save. Choose it again and wait for the preview.';
    if (error.problem.detail === 'Identity correction requires review')
      return 'Name or gender changes require identity review. Use Profile reviews for a name correction or contact Help & support.';
    return 'Your profile could not be saved because it conflicts with your saved details. Check your details and try again.';
  }
  return safeMessage(error);
}
