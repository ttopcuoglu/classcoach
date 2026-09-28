-- Ask & Practice asks what room the teacher is in. Grade band and subject were
-- added with the focus areas; these two narrow it further at high school, where
-- "Math" splits into Algebra 1 and AP Calculus, and where the same course runs
-- as an honors section and as an inclusion section.

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "course" TEXT,
                       ADD COLUMN     "courseLevel" TEXT;

-- AlterTable
ALTER TABLE "Debrief" ADD COLUMN     "course" TEXT,
                      ADD COLUMN     "courseLevel" TEXT;
