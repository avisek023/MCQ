import type { Question } from './types.ts';

export const STARTER_DECK_TITLE = 'Starter Warmup Pack (Sample MCQs)';

export const STARTER_QUESTIONS: Question[] = [
  {
    id: 'starter-1',
    topic: 'Science',
    question: 'Which planet in our solar system has the highest surface temperature on average?',
    options: ['Mercury', 'Venus', 'Mars', 'Jupiter'],
    correctIndex: 1,
    explanation: 'Venus traps heat under a dense carbon dioxide atmosphere, averaging around 465°C—hotter than Mercury despite being farther from the Sun.',
  },
  {
    id: 'starter-2',
    topic: 'Computing',
    question: 'In HTTP, which status code specifically indicates that a request succeeded and a new resource was created?',
    options: ['200 OK', '201 Created', '204 No Content', '301 Moved Permanently'],
    correctIndex: 1,
    explanation: '201 Created confirms that the request was fulfilled and resulted in one or more new resources being created.',
  },
  {
    id: 'starter-3',
    topic: 'Geography',
    question: 'Which country has the longest total coastline in the world?',
    options: ['Russia', 'Indonesia', 'Canada', 'Australia'],
    correctIndex: 2,
    explanation: 'Canada’s coastline measures over 202,000 kilometers thanks to its thousands of northern islands.',
  },
  {
    id: 'starter-4',
    topic: 'Mathematics',
    question: 'What is the only even prime number?',
    options: ['0', '2', '4', '6'],
    correctIndex: 1,
    explanation: '2 has only two distinct positive divisors (1 and 2); every larger even number is divisible by 2.',
  },
  {
    id: 'starter-5',
    topic: 'History',
    question: 'In which city was the Gutenberg printing press first operated in the mid-15th century?',
    options: ['Florence', 'Mainz', 'Vienna', 'Prague'],
    correctIndex: 1,
    explanation: 'Johannes Gutenberg established his movable-type printing workshop in Mainz, Germany around 1450.',
  },
  {
    id: 'starter-6',
    topic: 'Physics',
    question: 'What is the SI unit of electrical resistance?',
    options: ['Volt', 'Ampere', 'Ohm', 'Watt'],
    correctIndex: 2,
    explanation: 'Electrical resistance is measured in ohms (Ω), named after German physicist Georg Simon Ohm.',
  },
];
