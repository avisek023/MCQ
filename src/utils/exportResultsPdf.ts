import { jsPDF } from 'jspdf';
import {
  OPTION_LETTERS,
  PlayerInfo,
  RoomSnapshot,
  SCORING_MODE_DETAILS,
  formatPointsWithUnit,
} from '../shared/types';

function sanitizePdfText(raw: string): string {
  return raw
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/[^\x20-\xFF\n]/g, '');
}

export interface PersonalPdfExportParams {
  snapshot: RoomSnapshot;
  player: PlayerInfo;
  rank: number;
  totalRankedPlayers: number;
}

export function exportPersonalResultsPdf({
  snapshot,
  player,
  rank,
  totalRankedPlayers,
}: PersonalPdfExportParams): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 16;
  let y = 16;

  const scoringMode = snapshot.settings.scoringMode ?? 'exam';
  const scoringInfo = SCORING_MODE_DETAILS[scoringMode];
  const attempted = player.correctCount + player.wrongCount;
  const accuracyText =
    attempted > 0 ? `${Math.round((player.correctCount / attempted) * 100)}%` : 'N/A';
  const dateText = new Date().toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > bottomLimit) {
      doc.addPage();
      y = 16;
    }
  };

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(marginX, y, contentWidth, 24, 2.5, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('QuizDuel - Personal Answer Sheet', marginX + 5, y + 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    sanitizePdfText(
      `${snapshot.deckSummary.title}  |  Scoring: ${scoringInfo.label} (${scoringInfo.shortRule})`
    ),
    marginX + 5,
    y + 16.5
  );

  y += 30;

  // Summary Metadata Card
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, y, contentWidth, 28, 2, 2, 'FD');

  const col1X = marginX + 5;
  const col2X = marginX + contentWidth * 0.36;
  const col3X = marginX + contentWidth * 0.68;

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');
  doc.text('PARTICIPANT', col1X, y + 6.5);
  doc.text('ROOM CODE', col2X, y + 6.5);
  doc.text('DATE', col3X, y + 6.5);

  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(sanitizePdfText(player.name), col1X, y + 12);
  doc.text(sanitizePdfText(snapshot.roomCode), col2X, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(sanitizePdfText(dateText), col3X, y + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('FINAL RANK', col1X, y + 19);
  doc.text('TOTAL SCORE', col2X, y + 19);
  doc.text('BREAKDOWN', col3X, y + 19);

  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`#${rank} of ${totalRankedPlayers}`, col1X, y + 24.5);
  doc.setTextColor(180, 83, 9);
  doc.text(sanitizePdfText(formatPointsWithUnit(player.score)), col2X, y + 24.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    sanitizePdfText(
      `${player.correctCount} Correct / ${player.wrongCount} Wrong / ${player.unattemptedCount} Unattempted (${accuracyText})`
    ),
    col3X,
    y + 24.5
  );

  y += 35;

  // Section Heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Question-by-Question Answer Breakdown (${snapshot.history.length} Questions)`,
    marginX,
    y
  );
  y += 6;

  // Each Question Block
  for (const round of snapshot.history) {
    const pick = round.picks[player.id];
    const hasPick = Boolean(pick && pick.optionIndex !== null);
    const isCorrect = Boolean(pick?.isCorrect);
    const isSkipped = Boolean(pick?.skipped);
    const markedIndex = pick?.optionIndex ?? null;
    const ptsText = pick ? formatPointsWithUnit(pick.totalPoints, true) : '0 pts';

    const statusLabel = isCorrect
      ? `CORRECT (${ptsText})`
      : hasPick
        ? `WRONG (${ptsText})`
        : isSkipped
          ? 'UNATTEMPTED - SKIPPED (0 pts)'
          : 'UNATTEMPTED (0 pts)';

    const qPrefix = `Q${round.questionIndex + 1}. `;
    const qLines = doc.splitTextToSize(
      sanitizePdfText(`${qPrefix}${round.question}`),
      contentWidth - 4
    ) as string[];

    const optionLinesList = round.options.map((opt, idx) => {
      const tags: string[] = [];
      if (markedIndex === idx) tags.push('Your Pick');
      if (round.correctIndex === idx) tags.push('Correct Answer');
      const suffix = tags.length > 0 ? `  [${tags.join(' | ')}]` : '';
      return doc.splitTextToSize(
        sanitizePdfText(`   ${OPTION_LETTERS[idx]}. ${opt}${suffix}`),
        contentWidth - 6
      ) as string[];
    });

    const explanationLines = round.explanation
      ? (doc.splitTextToSize(
          sanitizePdfText(`Explanation: ${round.explanation}`),
          contentWidth - 4
        ) as string[])
      : [];

    const totalOptionLines = optionLinesList.reduce((acc, l) => acc + l.length, 0);
    const estimatedHeight =
      10 +
      qLines.length * 4.8 +
      totalOptionLines * 4.4 +
      8 +
      (explanationLines.length > 0 ? explanationLines.length * 4.2 + 4 : 0) +
      6;

    ensureSpace(Math.min(estimatedHeight, 120));

    // Question Header Bar (Topic + Outcome Status)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(marginX, y, contentWidth, 6.5, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      sanitizePdfText(
        `Question ${round.questionIndex + 1}${round.topic ? ` - ${round.topic}` : ''}`
      ),
      marginX + 2.5,
      y + 4.4
    );

    if (isCorrect) {
      doc.setTextColor(22, 163, 74);
    } else if (hasPick) {
      doc.setTextColor(220, 38, 38);
    } else {
      doc.setTextColor(100, 116, 139);
    }
    doc.text(sanitizePdfText(statusLabel), pageWidth - marginX - 2.5, y + 4.4, {
      align: 'right',
    });

    y += 10;

    // Question Prompt
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(qLines, marginX + 1, y);
    y += qLines.length * 4.8 + 1.5;

    // Four Options
    doc.setFontSize(9.2);
    for (let idx = 0; idx < 4; idx++) {
      const optLines = optionLinesList[idx];
      ensureSpace(optLines.length * 4.4 + 2);

      const isOptionCorrect = idx === round.correctIndex;
      const isUserPick = idx === markedIndex;

      if (isOptionCorrect) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(21, 128, 61);
      } else if (isUserPick && !isOptionCorrect) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(185, 28, 28);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
      }

      doc.text(optLines, marginX + 1, y);
      y += optLines.length * 4.4;
    }

    y += 1.5;

    // Participant Answer vs Official Answer Summary Line
    ensureSpace(8);
    const yourPickSummary =
      markedIndex !== null
        ? `${OPTION_LETTERS[markedIndex]}${pick?.elapsedMs != null ? ` (${(pick.elapsedMs / 1000).toFixed(1)}s)` : ''}`
        : isSkipped
          ? 'Unattempted (Skipped)'
          : 'Unattempted';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(
      sanitizePdfText(
        `Your Selection: ${yourPickSummary}   |   Correct Answer: ${OPTION_LETTERS[round.correctIndex]}`
      ),
      marginX + 2,
      y
    );
    y += 4.5;

    // Explanation
    if (explanationLines.length > 0) {
      ensureSpace(explanationLines.length * 4.2 + 2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(explanationLines, marginX + 2, y);
      y += explanationLines.length * 4.2 + 1;
    }

    // Divider
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y + 1.5, pageWidth - marginX, y + 1.5);
    y += 6;
  }

  // Page numbers footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      sanitizePdfText(
        `QuizDuel  |  Room ${snapshot.roomCode}  |  ${player.name}  |  Page ${p} of ${totalPages}`
      ),
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const safePlayerName = player.name.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 24) || 'Player';
  doc.save(`QuizDuel-${snapshot.roomCode}-${safePlayerName}-Results.pdf`);
}
