import { expect, it } from 'vitest';
import { readMarksFile } from './marksFile';

const rolls = new Set([1, 2, 3, 4]);

it('reads marks, half marks and AB, and says which line is wrong', () => {
  const file = '﻿rollNo,marks\r\n1,45\r\n2,37.5\r\n3,AB\r\n9,10\r\n2,11\r\n4,51\r\nx,3\r\n4,\r\n';
  const { rows, problems } = readMarksFile(file, rolls, 50);
  expect(rows).toEqual([
    { rollNo: 1, marks: 45, absent: false },
    { rollNo: 2, marks: 37.5, absent: false },
    { rollNo: 3, marks: null, absent: true },
  ]);
  expect(problems).toEqual([
    { line: 5, reason: 'unknownRoll' },
    { line: 6, reason: 'repeatedRoll' },
    { line: 7, reason: 'marks' },
    { line: 8, reason: 'rollNo' },
    { line: 9, reason: 'repeatedRoll' },
  ]);
});

it('refuses a file with another header or no rows', () => {
  expect(readMarksFile('name,marks\n1,2', rolls, 50).problems).toEqual([{ line: 1, reason: 'header' }]);
  expect(readMarksFile('rollNo,marks\n', rolls, 50).problems).toEqual([{ line: 1, reason: 'empty' }]);
});
