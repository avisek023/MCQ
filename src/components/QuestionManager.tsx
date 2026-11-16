import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileText,
  Lock,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { parseQuestionsInput } from '../shared/questionParser';
import { STARTER_DECK_TITLE, STARTER_QUESTIONS } from '../shared/starterQuestions';
import { DeckSummary, OPTION_LETTERS, OptionIndex, Question } from '../shared/types';

interface QuestionManagerProps {
  canEdit: boolean;
  deckSummary: DeckSummary;
  editableQuestions: Question[] | null;
  onUpdateDeck: (title: string, questions: Question[]) => void;
}

const SAMPLE_JSON = JSON.stringify(
  [
    {
      topic: 'Biology',
      question: 'Which organelle is responsible for producing most of the cell’s ATP?',
      options: ['Golgi apparatus', 'Mitochondria', 'Ribosome', 'Lysosome'],
      correctIndex: 1,
      explanation: 'Mitochondria generate chemical energy in the form of ATP via oxidative phosphorylation.',
    },
    {
      topic: 'Physics',
      question: 'What is the approximate speed of light in a vacuum?',
      options: ['300,000 km/s', '150,000 km/s', '30,000 km/s', '1,080 km/h'],
      answer: 'A',
    },
  ],
  null,
  2
);

const SAMPLE_TEXT = `Topic: General Knowledge
Which ocean is the deepest on Earth?
A) Atlantic Ocean
B) Indian Ocean
C) Pacific Ocean
D) Arctic Ocean
Answer: C
Explanation: The Mariana Trench in the Pacific Ocean reaches nearly 11,000 meters deep.

Topic: Chemistry
What is the chemical symbol for Gold?
A) Gd
B) Go
C) Ag
D) Au
Answer: D`;

const SAMPLE_CSV = `question,A,B,C,D,answer,explanation,topic
"Which data structure uses LIFO ordering?","Queue","Stack","Heap","Graph","B","Last-In, First-Out defines a stack.","Computing"
"What year did the Apollo 11 Moon landing occur?","1965","1967","1969","1971","C","Neil Armstrong and Buzz Aldrin landed on July 20, 1969.","History"`;

export const QuestionManager: React.FC<QuestionManagerProps> = ({
  canEdit,
  deckSummary,
  editableQuestions,
  onUpdateDeck,
}) => {
  const [activeTab, setActiveTab] = useState<'deck' | 'upload' | 'add'>('deck');
  const [deckTitleInput, setDeckTitleInput] = useState(deckSummary.title);
  const [rawPaste, setRawPaste] = useState('');
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  // Single question builder state
  const [prompt, setPrompt] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctIdx, setCorrectIdx] = useState<OptionIndex>(0);
  const [topic, setTopic] = useState('');
  const [explanation, setExplanation] = useState('');
  const [builderError, setBuilderError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedPreview = useMemo(() => {
    if (!rawPaste.trim()) return null;
    return parseQuestionsInput(rawPaste);
  }, [rawPaste]);

  const currentQuestions = editableQuestions ?? [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setRawPaste(content);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      if (baseName) {
        setDeckTitleInput(baseName);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([SAMPLE_JSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quizduel-template.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyUpload = (mode: 'replace' | 'append') => {
    if (!parsedPreview || parsedPreview.questions.length === 0) return;
    const nextQuestions =
      mode === 'replace'
        ? parsedPreview.questions
        : [...currentQuestions, ...parsedPreview.questions];
    const nextTitle =
      deckTitleInput.trim() ||
      (mode === 'replace' ? 'Custom Uploaded Deck' : deckSummary.title);
    onUpdateDeck(nextTitle, nextQuestions);
    setUploadNotice(
      `${mode === 'replace' ? 'Loaded' : 'Added'} ${parsedPreview.questions.length} question${
        parsedPreview.questions.length === 1 ? '' : 's'
      } into the room.`
    );
    setRawPaste('');
    setActiveTab('deck');
  };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const p = prompt.trim();
    const opts = [optA.trim(), optB.trim(), optC.trim(), optD.trim()];
    if (!p || opts.some((o) => !o)) {
      setBuilderError('Enter the question text and all four options (A–D).');
      return;
    }
    setBuilderError(null);
    const newQ: Question = {
      id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      question: p,
      options: [opts[0], opts[1], opts[2], opts[3]],
      correctIndex: correctIdx,
      topic: topic.trim() || undefined,
      explanation: explanation.trim() || undefined,
    };
    const nextTitle =
      deckSummary.title === STARTER_DECK_TITLE ? 'Custom MCQ Deck' : deckSummary.title;
    onUpdateDeck(nextTitle, [...currentQuestions, newQ]);
    setPrompt('');
    setOptA('');
    setOptB('');
    setOptC('');
    setOptD('');
    setTopic('');
    setExplanation('');
    setCorrectIdx(0);
    setUploadNotice('Added 1 question to the active deck.');
    setActiveTab('deck');
  };

  const handleDeleteQuestion = (id: string) => {
    if (currentQuestions.length <= 1) {
      setUploadNotice('Keep at least 1 question in the deck, or upload a replacement pack.');
      return;
    }
    onUpdateDeck(
      deckSummary.title,
      currentQuestions.filter((q) => q.id !== id)
    );
  };

  const handleResetStarter = () => {
    setDeckTitleInput(STARTER_DECK_TITLE);
    onUpdateDeck(STARTER_DECK_TITLE, STARTER_QUESTIONS);
    setUploadNotice('Restored the 6-question Starter Warmup Pack.');
  };

  if (!canEdit) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Active Question Deck
            </p>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              {deckSummary.title}
            </h2>
          </div>
          <Lock className="h-5 w-5 text-slate-400 shrink-0" />
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">
          <span className="font-mono-tabular font-semibold text-slate-900 dark:text-white">
            {deckSummary.count}
          </span>{' '}
          questions loaded by {deckSummary.updatedBy}. Answers stay hidden until each round’s
          simultaneous reveal.
        </p>

        {deckSummary.topics.length > 0 && (
          <div className="border-t border-slate-200 dark:border-white/10 pt-4 text-xs text-slate-500 dark:text-slate-400">
            Topics included: {deckSummary.topics.join(' · ')}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#131D33] p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Question Bank · <span className="font-mono-tabular">{deckSummary.count}</span>{' '}
            questions ready
          </p>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            {deckSummary.title}
          </h2>
        </div>

        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/80 dark:bg-[#0B1221] p-1 border border-slate-200 dark:border-white/5 self-start">
          <button
            type="button"
            onClick={() => {
              setActiveTab('deck');
              setUploadNotice(null);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'deck'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Active Deck ({deckSummary.count})
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('upload');
              setUploadNotice(null);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'upload'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Upload / Paste
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('add');
              setUploadNotice(null);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'add'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            Add One
          </button>
        </div>
      </div>

      {uploadNotice && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-400/60 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <span className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {uploadNotice}
          </span>
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'deck' && (
        <div>
          <div className="max-h-[340px] overflow-y-auto space-y-2.5 pr-1">
            {currentQuestions.map((q, idx) => (
              <div
                key={q.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] p-3.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-mono-tabular font-semibold text-slate-700 dark:text-slate-300">
                      Q{idx + 1}
                    </span>
                    {q.topic && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{q.topic}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Ans: {OPTION_LETTERS[q.correctIndex]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-100 leading-snug">
                    {q.question}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteQuestion(q.id)}
                  aria-label={`Remove question ${idx + 1}`}
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-300 transition-colors shrink-0 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-white/10 pt-4">
            <button
              type="button"
              onClick={handleResetStarter}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Starter Pack
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-white hover:border-amber-500/60 dark:hover:border-amber-400/50 transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              Upload Custom MCQs
            </button>
          </div>
        </div>
      )}

      {activeTab === 'upload' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="deck-title"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Deck Title
              </label>
              <input
                id="deck-title"
                type="text"
                maxLength={60}
                value={deckTitleInput}
                onChange={(e) => setDeckTitleInput(e.target.value)}
                placeholder="e.g. Biology Midterm Review"
                className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.csv,.txt"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-white hover:border-amber-500/60 dark:hover:border-amber-400/60 transition-colors cursor-pointer"
              >
                <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                Choose File (.json, .csv, .txt)
              </button>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                title="Download sample JSON template"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Download className="h-4 w-4" />
                Template
              </button>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="paste-questions"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Paste JSON, CSV, or A/B/C/D Text
              </label>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setRawPaste(SAMPLE_TEXT)}
                  className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                >
                  Load Text Example
                </button>
                <button
                  type="button"
                  onClick={() => setRawPaste(SAMPLE_CSV)}
                  className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                >
                  Load CSV Example
                </button>
                <button
                  type="button"
                  onClick={() => setRawPaste(SAMPLE_JSON)}
                  className="text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 cursor-pointer"
                >
                  Load JSON Example
                </button>
              </div>
            </div>
            <textarea
              id="paste-questions"
              rows={7}
              value={rawPaste}
              onChange={(e) => setRawPaste(e.target.value)}
              placeholder={`Paste questions in any format:\n\nWhat is 2 + 2?\nA) 3\nB) 4\nC) 5\nD) 6\nAnswer: B`}
              className="font-mono-tabular w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] p-3 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>

          {parsedPreview && (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1221] p-3.5 text-xs">
              <div className="flex items-center justify-between text-slate-800 dark:text-slate-200 mb-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <FileText className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  Detected {parsedPreview.formatDetected.toUpperCase()} ·{' '}
                  <span className="font-mono-tabular font-semibold text-emerald-700 dark:text-emerald-400">
                    {parsedPreview.questions.length} valid question
                    {parsedPreview.questions.length === 1 ? '' : 's'}
                  </span>
                </span>
              </div>
              {parsedPreview.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-red-600 dark:text-red-300">
                  {parsedPreview.errors.slice(0, 4).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                  {parsedPreview.errors.length > 4 && (
                    <li>...and {parsedPreview.errors.length - 4} more formatting warnings</li>
                  )}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              disabled={!parsedPreview || parsedPreview.questions.length === 0}
              onClick={() => handleApplyUpload('append')}
              className="rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-white hover:border-slate-400 dark:hover:border-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Append to Current Deck
            </button>
            <button
              type="button"
              disabled={!parsedPreview || parsedPreview.questions.length === 0}
              onClick={() => handleApplyUpload('replace')}
              className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Replace Active Deck
            </button>
          </div>
        </div>
      )}

      {activeTab === 'add' && (
        <form onSubmit={handleAddSingle} className="space-y-3.5">
          <div>
            <label
              htmlFor="single-q"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
            >
              Question Prompt
            </label>
            <textarea
              id="single-q"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your multiple-choice question..."
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { label: 'Option A', val: optA, set: setOptA, idx: 0 as OptionIndex },
              { label: 'Option B', val: optB, set: setOptB, idx: 1 as OptionIndex },
              { label: 'Option C', val: optC, set: setOptC, idx: 2 as OptionIndex },
              { label: 'Option D', val: optD, set: setOptD, idx: 3 as OptionIndex },
            ].map((item) => (
              <div key={item.idx} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCorrectIdx(item.idx)}
                  aria-label={`Mark ${item.label} as correct answer`}
                  className={`h-9 w-9 rounded-lg border text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                    correctIdx === item.idx
                      ? 'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {OPTION_LETTERS[item.idx]}
                </button>
                <input
                  type="text"
                  value={item.val}
                  onChange={(e) => item.set(e.target.value)}
                  placeholder={item.label}
                  className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none"
                />
              </div>
            ))}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Selected correct answer:{' '}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              Option {OPTION_LETTERS[correctIdx]}
            </span>{' '}
            (click A, B, C, or D button to change).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Topic (optional, e.g. Physics)"
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none"
            />
            <input
              type="text"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Explanation shown after reveal (optional)"
              className="w-full rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[#0B1221] px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-amber-500 dark:focus:border-amber-400 focus:outline-none"
            />
          </div>

          {builderError && (
            <p className="text-xs text-red-600 dark:text-red-300" role="alert">
              {builderError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Add Question to Deck
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
