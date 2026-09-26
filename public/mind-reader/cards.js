// The six player cards and the logic that reads them.
//
// Each player carries a hidden `value`. A player's card lists every number
// from 1–63 that "contains" that value, so adding up the values of the cards
// the spectator says YES to recovers their number exactly. None of this is
// ever shown in the UI.
//
// The number lists are written out in full (not generated at runtime) so they
// can be read and checked by eye; tests/mind-reader.test.mjs verifies them.

export const MIN_NUMBER = 1;
export const MAX_NUMBER = 63;

export const PLAYERS = Object.freeze([
  {
    id: 'lloris',
    firstName: 'Hugo',
    lastName: 'Lloris',
    role: 'Goalkeeper',
    nation: 'France',
    motif: 'goal',
    photo: null,
    value: 1,
    numbers: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31, 33, 35, 37, 39, 41, 43, 45, 47, 49, 51, 53, 55, 57, 59, 61, 63],
  },
  {
    id: 'walker',
    firstName: 'Kyle',
    lastName: 'Walker',
    role: 'Right back',
    nation: 'England',
    motif: 'right-flank',
    photo: null,
    value: 2,
    numbers: [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31, 34, 35, 38, 39, 42, 43, 46, 47, 50, 51, 54, 55, 58, 59, 62, 63],
  },
  {
    id: 'alderweireld',
    firstName: 'Toby',
    lastName: 'Alderweireld',
    role: 'Centre back',
    nation: 'Belgium',
    motif: 'box',
    photo: null,
    value: 4,
    numbers: [4, 5, 6, 7, 12, 13, 14, 15, 20, 21, 22, 23, 28, 29, 30, 31, 36, 37, 38, 39, 44, 45, 46, 47, 52, 53, 54, 55, 60, 61, 62, 63],
  },
  {
    id: 'dembele',
    firstName: 'Mousa',
    lastName: 'Dembélé',
    role: 'Midfielder',
    nation: 'Belgium',
    motif: 'centre',
    photo: null,
    value: 8,
    numbers: [8, 9, 10, 11, 12, 13, 14, 15, 24, 25, 26, 27, 28, 29, 30, 31, 40, 41, 42, 43, 44, 45, 46, 47, 56, 57, 58, 59, 60, 61, 62, 63],
  },
  {
    id: 'lo-celso',
    firstName: 'Giovani',
    lastName: 'Lo Celso',
    role: 'Midfielder',
    nation: 'Argentina',
    motif: 'arc',
    photo: null,
    value: 16,
    numbers: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63],
  },
  {
    id: 'assou-ekotto',
    firstName: 'Benoît',
    lastName: 'Assou-Ekotto',
    role: 'Left back',
    nation: 'Cameroon',
    motif: 'left-flank',
    photo: null,
    value: 32,
    numbers: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63],
  },
]);

/**
 * Turns the spectator's six YES/NO answers (in PLAYERS order) into their
 * number. Returns 0 when every answer was NO, which is outside 1–63 and
 * means a card was misread.
 */
export function readMind(answers) {
  if (!Array.isArray(answers) || answers.length !== PLAYERS.length) {
    throw new Error(`Expected ${PLAYERS.length} answers, got ${answers?.length}`);
  }
  let total = 0;
  answers.forEach((yes, i) => {
    if (yes === true) total += PLAYERS[i].value;
  });
  return total;
}
