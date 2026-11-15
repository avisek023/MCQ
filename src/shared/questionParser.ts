import { OptionIndex, Question } from './types';

export interface ParseQuestionsResult {
  questions: Question[];
  errors: string[];
  formatDetected: 'json' | 'csv' | 'text' | 'unknown';
}

function makeId(index: number): string {
  return `q-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`;
}

function resolveCorrectIndex(raw: unknown, options: string[]): OptionIndex | null {
  if (typeof raw === 'number' && Number.isInteger(raw)) {
    if (raw >= 0 && raw <= 3) return raw as OptionIndex;
    if (raw >= 1 && raw <= 4) return (raw - 1) as OptionIndex;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const upper = trimmed.toUpperCase();
    if (upper === 'A' || upper === '0' || upper === 'OPTION A') return 0;
    if (upper === 'B' || upper === '1' || upper === 'OPTION B') return 1;
    if (upper === 'C' || upper === '2' || upper === 'OPTION C') return 2;
    if (upper === 'D' || upper === '3' || upper === 'OPTION D') return 3;
    if (/^[1-4]$/.test(upper)) return (Number(upper) - 1) as OptionIndex;

    const matchIdx = options.findIndex(
      (opt) => opt.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (matchIdx >= 0 && matchIdx <= 3) return matchIdx as OptionIndex;
  }
  return null;
}

function parseJsonQuestions(input: string): ParseQuestionsResult {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    return {
      questions: [],
      errors: [`Invalid JSON syntax: ${err instanceof Error ? err.message : 'Unable to parse'}`],
      formatDetected: 'json',
    };
  }

  const rawList: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).questions)
      ? ((parsed as Record<string, unknown>).questions as unknown[])
      : [];

  if (rawList.length === 0) {
    return {
      questions: [],
      errors: ['JSON must be an array of question objects (or { "questions": [...] }).'],
      formatDetected: 'json',
    };
  }

  const questions: Question[] = [];

  rawList.forEach((item, idx) => {
    if (!item || typeof item !== 'object') {
      errors.push(`Item #${idx + 1}: expected an object.`);
      return;
    }
    const obj = item as Record<string, unknown>;
    const prompt = String(obj.question ?? obj.prompt ?? obj.q ?? obj.title ?? '').trim();
    if (!prompt) {
      errors.push(`Item #${idx + 1}: missing "question" text.`);
      return;
    }

    let options: string[] = [];
    if (Array.isArray(obj.options)) {
      options = obj.options.map((v) => String(v ?? '').trim());
    } else if (Array.isArray(obj.choices)) {
      options = obj.choices.map((v) => String(v ?? '').trim());
    } else {
      const a = obj.a ?? obj.A ?? obj.optionA ?? obj.option_a;
      const b = obj.b ?? obj.B ?? obj.optionB ?? obj.option_b;
      const c = obj.c ?? obj.C ?? obj.optionC ?? obj.option_c;
      const d = obj.d ?? obj.D ?? obj.optionD ?? obj.option_d;
      if (a !== undefined || b !== undefined || c !== undefined || d !== undefined) {
        options = [String(a ?? '').trim(), String(b ?? '').trim(), String(c ?? '').trim(), String(d ?? '').trim()];
      }
    }

    if (options.length !== 4 || options.some((o) => !o)) {
      errors.push(`Item #${idx + 1} ("${prompt.slice(0, 30)}..."): requires exactly 4 non-empty options.`);
      return;
    }

    const rawAnswer = obj.correctIndex ?? obj.answer ?? obj.correct ?? obj.correctAnswer ?? obj.ans;
    const correctIndex = resolveCorrectIndex(rawAnswer, options);
    if (correctIndex === null) {
      errors.push(
        `Item #${idx + 1} ("${prompt.slice(0, 30)}..."): invalid answer "${String(rawAnswer ?? '')}". Use 0-3 or A-D.`
      );
      return;
    }

    const explanation = obj.explanation ? String(obj.explanation).trim() : undefined;
    const topic = obj.topic ? String(obj.topic).trim() : obj.category ? String(obj.category).trim() : undefined;

    questions.push({
      id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : makeId(idx),
      question: prompt,
      options: [options[0], options[1], options[2], options[3]],
      correctIndex,
      explanation: explanation || undefined,
      topic: topic || undefined,
    });
  });

  return { questions, errors, formatDetected: 'json' };
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsvQuestions(input: string): ParseQuestionsResult {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { questions: [], errors: ['CSV is empty.'], formatDetected: 'csv' };
  }

  const errors: string[] = [];
  const questions: Question[] = [];

  const firstCells = splitCsvLine(lines[0]).map((c) => c.toLowerCase());
  const hasHeader =
    firstCells.some((c) => c.includes('question') || c.includes('prompt')) &&
    firstCells.some((c) => c.includes('answer') || c.includes('correct'));

  const startRow = hasHeader ? 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length < 6) {
      errors.push(`Row ${i + 1}: expected at least 6 columns (question, A, B, C, D, answer).`);
      continue;
    }
    const [prompt, optA, optB, optC, optD, rawAnswer, explanation, topic] = cells;
    const options = [optA, optB, optC, optD];
    if (!prompt || options.some((o) => !o)) {
      errors.push(`Row ${i + 1}: question and all 4 options must be non-empty.`);
      continue;
    }
    const correctIndex = resolveCorrectIndex(rawAnswer, options);
    if (correctIndex === null) {
      errors.push(`Row ${i + 1}: invalid answer "${rawAnswer}". Use A, B, C, D or 0-3.`);
      continue;
    }
    questions.push({
      id: makeId(i),
      question: prompt,
      options: [optA, optB, optC, optD],
      correctIndex,
      explanation: explanation || undefined,
      topic: topic || undefined,
    });
  }

  return { questions, errors, formatDetected: 'csv' };
}

function parseTextBlocks(input: string): ParseQuestionsResult {
  const blocks = input
    .trim()
    .split(/\r?\n\s*\r?\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const errors: string[] = [];
  const questions: Question[] = [];

  blocks.forEach((block, idx) => {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 5) {
      errors.push(`Block #${idx + 1}: expected question + 4 options (A-D) + Answer line.`);
      return;
    }

    let promptLines: string[] = [];
    const options: string[] = ['', '', '', ''];
    let foundOptions = 0;
    let rawAnswer: string | null = null;
    let explanation: string | undefined;
    let topic: string | undefined;

    for (const line of lines) {
      const topicMatch = line.match(/^(?:Topic|Category)\s*:\s*(.+)$/i);
      if (topicMatch) {
        topic = topicMatch[1].trim();
        continue;
      }

      const expMatch = line.match(/^(?:Explanation|Note)\s*:\s*(.+)$/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }

      const ansMatch = line.match(/^(?:Answer|Ans|Correct)\s*:\s*(.+)$/i);
      if (ansMatch) {
        rawAnswer = ansMatch[1].trim();
        continue;
      }

      const optMatch = line.match(/^(\*?)\s*([A-Da-d])\s*[).:\-]\s*(.+)$/);
      if (optMatch) {
        const star = optMatch[1] === '*';
        const letter = optMatch[2].toUpperCase();
        const optIdx = ['A', 'B', 'C', 'D'].indexOf(letter);
        if (optIdx >= 0) {
          options[optIdx] = optMatch[3].trim();
          foundOptions++;
          if (star) rawAnswer = letter;
          continue;
        }
      }

      if (foundOptions === 0) {
        promptLines.push(line.replace(/^(?:Q\d*|Question\s*\d*)\s*[:.)\-]\s*/i, '').trim());
      }
    }

    const prompt = promptLines.join(' ').trim();
    if (!prompt || options.some((o) => !o)) {
      errors.push(`Block #${idx + 1}: could not find question text and all 4 options A–D.`);
      return;
    }

    const correctIndex = resolveCorrectIndex(rawAnswer, options);
    if (correctIndex === null) {
      errors.push(`Block #${idx + 1} ("${prompt.slice(0, 28)}..."): missing "Answer: A/B/C/D" (or * prefix).`);
      return;
    }

    questions.push({
      id: makeId(idx),
      question: prompt,
      options: [options[0], options[1], options[2], options[3]],
      correctIndex,
      explanation,
      topic,
    });
  });

  return { questions, errors, formatDetected: 'text' };
}

export function parseQuestionsInput(rawInput: string): ParseQuestionsResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { questions: [], errors: ['Please paste or upload some questions first.'], formatDetected: 'unknown' };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseJsonQuestions(trimmed);
  }

  // Detect text/Aiken format if lines start with A) / A. / Answer:
  if (/^\*?[A-Da-d][).:\-]\s+/m.test(trimmed)) {
    return parseTextBlocks(trimmed);
  }

  // Otherwise try CSV if commas exist on first line
  const firstLine = trimmed.split(/\r?\n/)[0] ?? '';
  if (firstLine.includes(',')) {
    return parseCsvQuestions(trimmed);
  }

  return parseTextBlocks(trimmed);
}
