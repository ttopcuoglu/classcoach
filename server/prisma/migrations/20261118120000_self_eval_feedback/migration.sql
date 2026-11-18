-- A supervisor's written feedback on a Self-Eval a teacher shared with them.
ALTER TABLE "AudioSession" ADD COLUMN "selfEvalFeedback" TEXT;
ALTER TABLE "AudioSession" ADD COLUMN "selfEvalFeedbackById" TEXT;
ALTER TABLE "AudioSession" ADD COLUMN "selfEvalFeedbackAt" TIMESTAMP(3);
