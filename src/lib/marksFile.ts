export type MarksFileProblem = { line: number; reason: 'header' | 'empty' | 'rollNo' | 'unknownRoll' | 'repeatedRoll' | 'marks' };
export type MarksFileRow = { rollNo: number; marks: number | null; absent: boolean };

export const MARKS_FILE_HEADER = ['rollNo', 'marks'] as const;

/**
 * Reads a teacher's file of `rollNo,marks` lines. A mark is a whole or half number up to the paper's maximum, or AB
 * for a student who was absent. Lines are checked here only so the teacher sees what is wrong before anything is
 * filled in; the server checks the marks again when they are saved.
 */
export function readMarksFile(text: string, rolls: ReadonlySet<number>, maxMarks: number) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() !== '');
  const problems: MarksFileProblem[] = [];
  const rows: MarksFileRow[] = [];
  const [header = '', ...body] = lines;
  if (header.split(',').map((cell) => cell.trim()).join(',') !== MARKS_FILE_HEADER.join(',')) {
    return { rows, problems: [{ line: 1, reason: 'header' } as const] };
  }
  if (body.length === 0) return { rows, problems: [{ line: 1, reason: 'empty' } as const] };
  const seen = new Set<number>();
  body.forEach((line, index) => {
    const at = index + 2;
    const [rollText = '', markText = ''] = line.split(',').map((cell) => cell.trim());
    const rollNo = Number(rollText);
    if (!/^\d+$/.test(rollText)) return problems.push({ line: at, reason: 'rollNo' });
    if (!rolls.has(rollNo)) return problems.push({ line: at, reason: 'unknownRoll' });
    if (seen.has(rollNo)) return problems.push({ line: at, reason: 'repeatedRoll' });
    seen.add(rollNo);
    if (markText.toUpperCase() === 'AB') return rows.push({ rollNo, marks: null, absent: true });
    const marks = Number(markText);
    if (markText === '' || Number.isNaN(marks) || marks < 0 || marks > maxMarks || !Number.isInteger(marks * 2)) {
      return problems.push({ line: at, reason: 'marks' });
    }
    rows.push({ rollNo, marks, absent: false });
  });
  return { rows, problems };
}
